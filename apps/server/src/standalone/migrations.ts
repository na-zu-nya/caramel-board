import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export interface StandaloneMigrationSummary {
  id: string;
  title: string;
  checksum: string;
}

export interface StandaloneMigrationStatus {
  status: 'ready' | 'pending' | 'history_mismatch';
  currentVersion: string | null;
  latestVersion: string | null;
  appliedCount: number;
  pending: StandaloneMigrationSummary[];
  legacyBaseline: boolean;
  message: string;
  error: string | null;
}

interface MigrationDefinition extends StandaloneMigrationSummary {
  sql: string;
}

interface AppliedMigrationRow {
  id: string;
  checksum: string;
}

export class StandaloneMigrationRequiredError extends Error {
  constructor(readonly status: StandaloneMigrationStatus) {
    super(status.message);
    this.name = 'StandaloneMigrationRequiredError';
  }
}

const checksumSql = (sql: string) => createHash('sha256').update(sql).digest('hex');

const readTitle = (id: string, sql: string) => {
  const titleLine = sql
    .split(/\r?\n/, 5)
    .map((line) => line.trim())
    .find((line) => line.startsWith('-- title:'));
  return titleLine?.replace('-- title:', '').trim() || id.replace(/^\d+_/, '').replaceAll('_', ' ');
};

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const resolveMigrationsDir = () => {
  if (process.env.STANDALONE_MIGRATIONS_PATH) return process.env.STANDALONE_MIGRATIONS_PATH;
  const candidates = [
    path.join(process.cwd(), 'prisma', 'standalone', 'migrations'),
    path.join(process.cwd(), 'apps', 'server', 'prisma', 'standalone', 'migrations'),
    path.join(moduleDir, '..', 'prisma', 'standalone', 'migrations'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
};

const loadMigrations = (): MigrationDefinition[] => {
  const migrationsDir = resolveMigrationsDir();
  if (!existsSync(migrationsDir)) {
    throw new Error(`Standalone migration directory not found at ${migrationsDir}`);
  }

  const files = readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(`Standalone migration files not found at ${migrationsDir}`);
  }

  return files.map((fileName) => {
    const sql = readFileSync(path.join(migrationsDir, fileName), 'utf8');
    const id = path.basename(fileName, '.sql');
    return {
      id,
      title: readTitle(id, sql),
      checksum: checksumSql(sql),
      sql,
    };
  });
};

const tableExists = (db: DatabaseSync, tableName: string) =>
  Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)
  );

const getAppliedRows = (db: DatabaseSync): AppliedMigrationRow[] => {
  if (!tableExists(db, 'schema_migrations')) return [];
  return db
    .prepare('SELECT id, checksum FROM schema_migrations ORDER BY applied_at ASC')
    .all() as AppliedMigrationRow[];
};

const summarize = (migration: MigrationDefinition): StandaloneMigrationSummary => ({
  id: migration.id,
  title: migration.title,
  checksum: migration.checksum,
});

export const getStandaloneMigrationStatus = (db: DatabaseSync): StandaloneMigrationStatus => {
  const migrations = loadMigrations();
  const latest = migrations.at(-1) ?? null;
  const base = migrations[0] ?? null;

  if (!tableExists(db, 'datasets')) {
    return {
      status: 'pending',
      currentVersion: null,
      latestVersion: latest?.id ?? null,
      appliedCount: 0,
      pending: migrations.map(summarize),
      legacyBaseline: false,
      message: 'Standalone database has not been initialized. Run the desktop migration.',
      error: null,
    };
  }

  const appliedRows = getAppliedRows(db);
  if (appliedRows.length === 0) {
    const pending = migrations.slice(1).map(summarize);
    return {
      status: pending.length > 0 ? 'pending' : 'ready',
      currentVersion: base?.id ?? null,
      latestVersion: latest?.id ?? null,
      appliedCount: base ? 1 : 0,
      pending,
      legacyBaseline: true,
      message:
        pending.length > 0
          ? 'Legacy standalone database requires migrations. Run the desktop migration.'
          : 'Standalone database is ready.',
      error: null,
    };
  }

  const appliedById = new Map(appliedRows.map((row) => [row.id, row]));
  const mismatched = migrations.find((migration) => {
    const row = appliedById.get(migration.id);
    return row && row.checksum !== migration.checksum;
  });
  if (mismatched) {
    return {
      status: 'history_mismatch',
      currentVersion: appliedRows.at(-1)?.id ?? null,
      latestVersion: latest?.id ?? null,
      appliedCount: appliedRows.length,
      pending: [],
      legacyBaseline: false,
      message: `Applied standalone migration was changed after it ran: ${mismatched.id}`,
      error: `Migration history mismatch: ${mismatched.id}`,
    };
  }

  const pending = migrations.filter((migration) => !appliedById.has(migration.id)).map(summarize);
  const currentVersion =
    migrations.filter((migration) => appliedById.has(migration.id)).at(-1)?.id ?? null;

  return {
    status: pending.length > 0 ? 'pending' : 'ready',
    currentVersion,
    latestVersion: latest?.id ?? null,
    appliedCount: appliedRows.length,
    pending,
    legacyBaseline: false,
    message:
      pending.length > 0
        ? `${pending.length} standalone migration(s) pending. Run the desktop migration.`
        : 'Standalone database is ready.',
    error: null,
  };
};

export const assertStandaloneMigrationsReady = (db: DatabaseSync) => {
  const status = getStandaloneMigrationStatus(db);
  if (status.status !== 'ready') {
    throw new StandaloneMigrationRequiredError(status);
  }
};
