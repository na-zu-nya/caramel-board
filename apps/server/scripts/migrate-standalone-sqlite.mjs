#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..', '..');
const args = process.argv.slice(2);

const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
};

const hasFlag = (name) => args.includes(`--${name}`);

const resolveUserPath = (value) => (path.isAbsolute(value) ? value : path.join(repoRoot, value));

const dbArg = getArgValue('db') ?? process.env.STANDALONE_SQLITE_PATH ?? process.env.SQLITE_DB_PATH;
if (!dbArg) {
  console.error('[standalone-migration] --db is required');
  process.exit(1);
}

const dbPath = path.resolve(resolveUserPath(dbArg));
const mode = getArgValue('mode') ?? 'status';
const appVersion = getArgValue('app-version') ?? process.env.CARAMEL_APP_VERSION ?? null;
const migrationsDir = path.resolve(
  resolveUserPath(
    getArgValue('migrations') ?? path.join(serverRoot, 'sqlite', 'migrations')
  )
);
const useJsonLines = hasFlag('json-lines');
const useBackup = hasFlag('backup');

const nowIso = () => new Date().toISOString();

const formatTimestampForPath = () =>
  new Date()
    .toISOString()
    .replaceAll(':', '')
    .replaceAll('.', '')
    .replace('T', '-')
    .replace('Z', '');

const emit = (payload) => {
  if (useJsonLines) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }
  if (payload.message) {
    process.stdout.write(`[standalone-migration] ${payload.message}\n`);
  }
};

const checksumSql = (sql) => crypto.createHash('sha256').update(sql).digest('hex');

const readTitle = (id, sql) => {
  const line = sql
    .split(/\r?\n/, 5)
    .map((part) => part.trim())
    .find((part) => part.startsWith('-- title:'));
  if (!line) return id.replace(/^\d+_/, '').replaceAll('_', ' ');
  return line.replace('-- title:', '').trim() || id;
};

const loadMigrations = () => {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migration directory not found: ${migrationsDir}`);
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(`No standalone migrations found in ${migrationsDir}`);
  }

  return files.map((fileName) => {
    const filePath = path.join(migrationsDir, fileName);
    const sql = fs.readFileSync(filePath, 'utf8');
    const id = path.basename(fileName, '.sql');
    return {
      id,
      title: readTitle(id, sql),
      fileName,
      filePath,
      checksum: checksumSql(sql),
      sql,
    };
  });
};

const tableExists = (db, tableName) => {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row);
};

const ensureMigrationTables = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      checksum TEXT NOT NULL,
      app_version TEXT,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_migration_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_version TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
      backup_path TEXT,
      error TEXT
    );
  `);
};

const getAppliedRows = (db) => {
  if (!tableExists(db, 'schema_migrations')) return [];
  return db
    .prepare(
      'SELECT id, title, checksum, app_version, applied_at FROM schema_migrations ORDER BY applied_at ASC'
    )
    .all();
};

const summarizeMigration = (migration) => ({
  id: migration.id,
  title: migration.title,
  checksum: migration.checksum,
});

const inspectDatabase = (targetDbPath, migrations) => {
  const latest = migrations.at(-1) ?? null;
  const base = migrations[0] ?? null;
  const baseSummary = base ? summarizeMigration(base) : null;
  const latestSummary = latest ? summarizeMigration(latest) : null;

  if (!fs.existsSync(targetDbPath)) {
    return {
      status: 'pending',
      dbPath: targetDbPath,
      currentVersion: null,
      latestVersion: latest?.id ?? null,
      appliedCount: 0,
      pending: migrations.map(summarizeMigration),
      legacyBaseline: false,
      requiresBackup: false,
      backupPath: null,
      message: 'Database has not been initialized.',
      error: null,
      base: baseSummary,
      latest: latestSummary,
    };
  }

  const db = new DatabaseSync(targetDbPath);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    const hasDatasets = tableExists(db, 'datasets');
    if (!hasDatasets) {
      return {
        status: 'pending',
        dbPath: targetDbPath,
        currentVersion: null,
        latestVersion: latest?.id ?? null,
        appliedCount: 0,
        pending: migrations.map(summarizeMigration),
        legacyBaseline: false,
        requiresBackup: true,
        backupPath: null,
        message: 'Database exists but standalone schema is not initialized.',
        error: null,
        base: baseSummary,
        latest: latestSummary,
      };
    }

    const appliedRows = getAppliedRows(db);
    if (appliedRows.length === 0) {
      const pending = migrations.slice(1).map(summarizeMigration);
      return {
        status: pending.length > 0 ? 'pending' : 'ready',
        dbPath: targetDbPath,
        currentVersion: base?.id ?? null,
        latestVersion: latest?.id ?? null,
        appliedCount: base ? 1 : 0,
        pending,
        legacyBaseline: true,
        requiresBackup: pending.length > 0,
        backupPath: null,
        message:
          pending.length > 0
            ? 'Legacy standalone database requires migrations.'
            : 'Legacy standalone database matches the baseline schema.',
        error: null,
        base: baseSummary,
        latest: latestSummary,
      };
    }

    const byId = new Map(appliedRows.map((row) => [row.id, row]));
    const mismatched = migrations.find((migration) => {
      const row = byId.get(migration.id);
      return row && row.checksum !== migration.checksum;
    });
    if (mismatched) {
      return {
        status: 'history_mismatch',
        dbPath: targetDbPath,
        currentVersion: appliedRows.at(-1)?.id ?? null,
        latestVersion: latest?.id ?? null,
        appliedCount: appliedRows.length,
        pending: [],
        legacyBaseline: false,
        requiresBackup: false,
        backupPath: null,
        message: `Applied migration was changed after it ran: ${mismatched.id}`,
        error: `Migration history mismatch: ${mismatched.id}`,
        base: baseSummary,
        latest: latestSummary,
      };
    }

    const pending = migrations
      .filter((migration) => !byId.has(migration.id))
      .map(summarizeMigration);
    const currentVersion = migrations.filter((migration) => byId.has(migration.id)).at(-1)?.id;

    return {
      status: pending.length > 0 ? 'pending' : 'ready',
      dbPath: targetDbPath,
      currentVersion: currentVersion ?? null,
      latestVersion: latest?.id ?? null,
      appliedCount: appliedRows.length,
      pending,
      legacyBaseline: false,
      requiresBackup: pending.length > 0,
      backupPath: null,
      message:
        pending.length > 0
          ? `${pending.length} standalone migration(s) pending.`
          : 'Standalone database is up to date.',
      error: null,
      base: baseSummary,
      latest: latestSummary,
    };
  } finally {
    db.close();
  }
};

const createBackup = (targetDbPath) => {
  if (!fs.existsSync(targetDbPath)) return null;
  const backupDir = path.join(
    path.dirname(targetDbPath),
    `${path.basename(targetDbPath)}.backup-${formatTimestampForPath()}`
  );
  fs.mkdirSync(backupDir, { recursive: true });
  try {
    for (const candidate of [targetDbPath, `${targetDbPath}-wal`, `${targetDbPath}-shm`]) {
      if (fs.existsSync(candidate)) {
        fs.copyFileSync(
          candidate,
          path.join(backupDir, path.basename(candidate)),
          fs.constants.COPYFILE_FICLONE
        );
      }
    }
  } catch (error) {
    fs.rmSync(backupDir, { recursive: true, force: true });
    throw error;
  }
  return backupDir;
};

const insertMigrationRow = (db, migration) => {
  db.prepare(
    `INSERT OR IGNORE INTO schema_migrations
      (id, title, checksum, app_version, applied_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(migration.id, migration.title, migration.checksum, appVersion, nowIso());
};

const applyMigrations = (targetDbPath, migrations) => {
  const before = inspectDatabase(targetDbPath, migrations);
  if (before.status === 'ready') {
    emit({
      type: 'completed',
      phase: 'ready',
      message: 'Standalone database is already up to date.',
      percent: 100,
      backupPath: null,
      dbPath: targetDbPath,
    });
    return { ...before, backupPath: null };
  }
  if (before.status === 'history_mismatch') {
    throw new Error(before.error ?? before.message);
  }

  fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
  emit({ type: 'progress', phase: 'backup', message: 'Creating database backup.', percent: 10 });
  const backupPath = useBackup ? createBackup(targetDbPath) : null;

  const db = new DatabaseSync(targetDbPath);
  let runId = null;
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    ensureMigrationTables(db);
    const run = db
      .prepare(
        `INSERT INTO schema_migration_runs
          (app_version, started_at, status, backup_path)
         VALUES (?, ?, 'running', ?)`
      )
      .run(appVersion, nowIso(), backupPath);
    runId = Number(run.lastInsertRowid);

    const latest = migrations.at(-1) ?? null;
    const pendingIds = new Set(before.pending.map((migration) => migration.id));
    const pending = migrations.filter((migration) => pendingIds.has(migration.id));

    db.exec('BEGIN IMMEDIATE');
    try {
      if (before.legacyBaseline && migrations[0]) {
        insertMigrationRow(db, migrations[0]);
        emit({
          type: 'progress',
          phase: 'baseline',
          migration: migrations[0].id,
          message: 'Recording legacy database baseline.',
          percent: 25,
        });
      }

      pending.forEach((migration, index) => {
        const stepPercent = 30 + Math.round(((index + 1) / Math.max(pending.length, 1)) * 55);
        emit({
          type: 'progress',
          phase: 'apply',
          migration: migration.id,
          message: `Applying ${migration.title}.`,
          percent: stepPercent,
        });
        db.exec(migration.sql);
        insertMigrationRow(db, migration);
      });

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    db.prepare(
      `UPDATE schema_migration_runs
       SET finished_at = ?, status = 'completed'
       WHERE id = ?`
    ).run(nowIso(), runId);

    emit({
      type: 'completed',
      phase: 'completed',
      message: latest ? `Database updated to ${latest.id}.` : 'Database updated.',
      percent: 100,
      backupPath,
      dbPath: targetDbPath,
    });
    return {
      status: 'ready',
      dbPath: targetDbPath,
      currentVersion: latest?.id ?? null,
      latestVersion: latest?.id ?? null,
      appliedCount: migrations.length,
      pending: [],
      legacyBaseline: false,
      requiresBackup: false,
      backupPath,
      message: 'Standalone database is up to date.',
      error: null,
      base: migrations[0] ? summarizeMigration(migrations[0]) : null,
      latest: latest ? summarizeMigration(latest) : null,
    };
  } catch (error) {
    if (runId !== null) {
      db.prepare(
        `UPDATE schema_migration_runs
         SET finished_at = ?, status = 'failed', error = ?
         WHERE id = ?`
      ).run(nowIso(), error instanceof Error ? error.message : String(error), runId);
    }
    throw error;
  } finally {
    db.close();
  }
};

try {
  const migrations = loadMigrations();
  if (mode === 'status') {
    const status = inspectDatabase(dbPath, migrations);
    process.stdout.write(`${JSON.stringify(status)}\n`);
  } else if (mode === 'apply') {
    const status = applyMigrations(dbPath, migrations);
    if (!useJsonLines) {
      process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    }
  } else {
    throw new Error(`Unknown mode: ${mode}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (useJsonLines) {
    process.stdout.write(
      `${JSON.stringify({ type: 'error', phase: 'error', message, percent: 100 })}\n`
    );
  }
  console.error(`[standalone-migration] ${message}`);
  process.exit(1);
}
