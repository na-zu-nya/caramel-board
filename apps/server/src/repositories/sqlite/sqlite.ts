import { DatabaseSync } from 'node:sqlite';
import { assertStandaloneMigrationsReady } from './migrations';

let database: DatabaseSync | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const getStandaloneSqlitePath = () =>
  process.env.STANDALONE_SQLITE_PATH || process.env.SQLITE_DB_PATH || '';

export const isStandaloneSqliteEnabled = () => getStandaloneSqlitePath().trim().length > 0;

export const getStandaloneSqlite = () => {
  const dbPath = getStandaloneSqlitePath();
  if (!dbPath) {
    throw new Error('STANDALONE_SQLITE_PATH is not configured');
  }

  if (!database) {
    const next = new DatabaseSync(dbPath);
    next.exec('PRAGMA foreign_keys = ON');
    assertStandaloneMigrationsReady(next);
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
