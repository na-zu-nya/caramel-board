import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let database: DatabaseSync | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const getStandaloneSqlitePath = () =>
  process.env.STANDALONE_SQLITE_PATH || process.env.SQLITE_DB_PATH || '';

export const isStandaloneSqliteEnabled = () => getStandaloneSqlitePath().trim().length > 0;

const resolveSchemaPath = () =>
  process.env.STANDALONE_SCHEMA_PATH ||
  path.join(process.cwd(), 'prisma', 'standalone', 'schema.sql');

const ensureSchema = (db: DatabaseSync) => {
  const hasDatasets = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'datasets'")
    .get();
  if (hasDatasets) return;

  const schemaPath = resolveSchemaPath();
  let schemaSql: string;
  try {
    schemaSql = readFileSync(schemaPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Standalone schema file not found at ${schemaPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  db.exec(schemaSql);
};

export const getStandaloneSqlite = () => {
  const dbPath = getStandaloneSqlitePath();
  if (!dbPath) {
    throw new Error('STANDALONE_SQLITE_PATH is not configured');
  }

  if (!database) {
    const next = new DatabaseSync(dbPath);
    next.exec('PRAGMA foreign_keys = ON');
    ensureSchema(next);
    database = next;
  }

  return database;
};

export const nowIso = () => new Date().toISOString();

export const parseJsonObject = (value: string | null | undefined): Record<string, unknown> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const stringifyJsonObject = (value: Record<string, unknown> | undefined) =>
  JSON.stringify(value ?? {});
