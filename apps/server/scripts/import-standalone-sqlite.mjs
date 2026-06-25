#!/usr/bin/env node

import fs, { createReadStream, promises as fsp } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
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

const inputRoot = path.resolve(
  resolveUserPath(
    getArgValue('input') ?? getArgValue('in') ?? path.join(repoRoot, 'exports', 'latest')
  )
);
const dbPath = path.resolve(
  resolveUserPath(getArgValue('db') ?? path.join(inputRoot, 'caramel-board.sqlite'))
);
const schemaPath = path.resolve(
  resolveUserPath(
    getArgValue('schema') ?? path.join(serverRoot, 'prisma', 'standalone', 'schema.sql')
  )
);
const force = hasFlag('force');
const verifyFiles = hasFlag('verify-files');
const progressInterval = Number(getArgValue('progress-interval') ?? 1000);
const storageRoot = path.resolve(
  resolveUserPath(getArgValue('storage-root') ?? path.join(repoRoot, 'data/assets'))
);

const dataDir = path.join(inputRoot, 'data');
const manifestPath = path.join(inputRoot, 'manifest.json');

const tableImports = [
  {
    table: 'datasets',
    file: 'datasets.ndjson',
    columns: [
      'id',
      'name',
      'icon',
      'theme_color',
      'description',
      'settings_json',
      'is_protected',
      'password_hash',
      'password_salt',
      'is_default',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'users',
    file: 'users.ndjson',
    columns: ['id', 'name', 'email', 'role', 'password_hash', 'created_at', 'updated_at'],
  },
  {
    table: 'authors',
    file: 'authors.ndjson',
    columns: ['id', 'dataset_id', 'name'],
  },
  {
    table: 'author_links',
    file: 'author_links.ndjson',
    columns: [
      'id',
      'author_id',
      'provider',
      'label',
      'url',
      'external_id',
      'sort_order',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'collection_folders',
    file: 'collection_folders.ndjson',
    columns: [
      'id',
      'dataset_id',
      'parent_id',
      'name',
      'icon',
      'description',
      'sort_order',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'stacks',
    file: 'stacks.ndjson',
    columns: [
      'id',
      'dataset_id',
      'author_id',
      'name',
      'thumbnail',
      'media_type',
      'liked',
      'meta_json',
      'dominant_colors_json',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'assets',
    file: 'assets.ndjson',
    columns: [
      'id',
      'stack_id',
      'file',
      'thumbnail',
      'preview',
      'file_type',
      'original_name',
      'hash',
      'order_in_stack',
      'meta_json',
      'dominant_colors_json',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'tags',
    file: 'tags.ndjson',
    columns: ['id', 'dataset_id', 'title'],
  },
  {
    table: 'stack_tags',
    file: 'stack_tags.ndjson',
    columns: ['stack_id', 'tag_id'],
  },
  {
    table: 'collections',
    file: 'collections.ndjson',
    columns: [
      'id',
      'dataset_id',
      'folder_id',
      'name',
      'icon',
      'description',
      'type',
      'filter_config_json',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'collection_stacks',
    file: 'collection_stacks.ndjson',
    columns: ['collection_id', 'stack_id', 'added_at', 'order_index'],
  },
  {
    table: 'stack_favorites',
    file: 'stack_favorites.ndjson',
    columns: ['id', 'user_id', 'stack_id', 'created_at'],
  },
  {
    table: 'asset_favorites',
    file: 'asset_favorites.ndjson',
    columns: ['id', 'user_id', 'asset_id', 'created_at'],
  },
  {
    table: 'like_activities',
    file: 'like_activities.ndjson',
    columns: ['id', 'stack_id', 'asset_id', 'user_id', 'created_at'],
  },
  {
    table: 'navigation_pins',
    file: 'navigation_pins.ndjson',
    columns: [
      'id',
      'dataset_id',
      'user_id',
      'collection_id',
      'type',
      'name',
      'icon',
      'media_type',
      'sort_order',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'auto_tag_mappings',
    file: 'auto_tag_mappings.ndjson',
    columns: [
      'id',
      'dataset_id',
      'tag_id',
      'auto_tag_key',
      'display_name',
      'description',
      'is_active',
      'is_stop',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'auto_tag_predictions',
    file: 'auto_tag_predictions.ndjson',
    columns: [
      'id',
      'asset_id',
      'tags_json',
      'scores_json',
      'threshold',
      'tag_count',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'auto_tag_prediction_scores',
    file: 'auto_tag_prediction_scores.ndjson',
    columns: ['prediction_id', 'asset_id', 'tag_key', 'score', 'rank'],
  },
  {
    table: 'stack_auto_tag_aggregates',
    file: 'stack_auto_tag_aggregates.ndjson',
    columns: [
      'id',
      'stack_id',
      'aggregated_tags_json',
      'top_tags_json',
      'asset_count',
      'threshold',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'stack_auto_tag_scores',
    file: 'stack_auto_tag_scores.ndjson',
    columns: ['aggregate_id', 'stack_id', 'tag_key', 'score', 'rank', 'asset_count', 'threshold'],
  },
  {
    table: 'stack_colors',
    file: 'stack_colors.ndjson',
    columns: [
      'id',
      'stack_id',
      'r',
      'g',
      'b',
      'hex',
      'percentage',
      'hue',
      'saturation',
      'lightness',
      'hue_category',
      'order_index',
    ],
  },
  {
    table: 'asset_colors',
    file: 'asset_colors.ndjson',
    columns: [
      'id',
      'asset_id',
      'r',
      'g',
      'b',
      'hex',
      'percentage',
      'hue',
      'saturation',
      'lightness',
      'hue_category',
      'order_index',
    ],
  },
];

const requireFile = async (filePath, label) => {
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw new Error(`${label} がファイルではありません: ${filePath}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`${label} が見つかりません: ${filePath}`);
    }
    throw error;
  }
};

const sqlIdentifier = (name) => `"${name.replaceAll('"', '""')}"`;

const sqliteValue = (value) => {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (typeof value === 'object' && value !== null && !Buffer.isBuffer(value)) {
    return JSON.stringify(value);
  }
  return value;
};

const compactErrorMessage = (error) => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const formatWriteContext = (context) => {
  const parts = [];
  if (context?.phase) parts.push(`phase=${context.phase}`);
  if (context?.table) parts.push(`table=${context.table}`);
  if (context?.file) parts.push(`file=${context.file}`);
  if (context?.lineNumber) parts.push(`line=${context.lineNumber}`);
  if (context?.rowId !== undefined && context?.rowId !== null)
    parts.push(`row.id=${context.rowId}`);
  return parts.join(', ');
};

const sqliteNoCaseKey = (value) =>
  String(value ?? '').replace(/[A-Z]/g, (character) => character.toLowerCase());

const createImportContext = () => ({
  authorCanonicalIds: new Map(),
  authorIdMap: new Map(),
  tagCanonicalIds: new Map(),
  tagIdMap: new Map(),
  stackTagKeys: new Set(),
  duplicateAuthors: 0,
  duplicateTags: 0,
  duplicateStackTags: 0,
});

const prepareRowForImport = (row, definition, importContext) => {
  if (definition.table === 'authors') {
    const key = `${row.dataset_id}\u0000${sqliteNoCaseKey(row.name)}`;
    const existingId = importContext.authorCanonicalIds.get(key);
    if (existingId !== undefined) {
      importContext.authorIdMap.set(String(row.id), existingId);
      importContext.duplicateAuthors += 1;
      return null;
    }

    importContext.authorCanonicalIds.set(key, row.id);
    importContext.authorIdMap.set(String(row.id), row.id);
    return row;
  }

  if (definition.table === 'stacks' && row.author_id !== null && row.author_id !== undefined) {
    const mappedAuthorId = importContext.authorIdMap.get(String(row.author_id));
    if (mappedAuthorId !== undefined && mappedAuthorId !== row.author_id) {
      return {
        ...row,
        author_id: mappedAuthorId,
      };
    }
  }

  if (
    definition.table === 'author_links' &&
    row.author_id !== null &&
    row.author_id !== undefined
  ) {
    const mappedAuthorId = importContext.authorIdMap.get(String(row.author_id));
    if (mappedAuthorId !== undefined && mappedAuthorId !== row.author_id) {
      return {
        ...row,
        author_id: mappedAuthorId,
      };
    }
  }

  if (definition.table === 'tags') {
    const key = `${row.dataset_id}\u0000${sqliteNoCaseKey(row.title)}`;
    const existingId = importContext.tagCanonicalIds.get(key);
    if (existingId !== undefined) {
      importContext.tagIdMap.set(String(row.id), existingId);
      importContext.duplicateTags += 1;
      return null;
    }

    importContext.tagCanonicalIds.set(key, row.id);
    importContext.tagIdMap.set(String(row.id), row.id);
    return row;
  }

  if (definition.table === 'stack_tags') {
    const mappedTagId = importContext.tagIdMap.get(String(row.tag_id)) ?? row.tag_id;
    const preparedRow =
      mappedTagId !== row.tag_id
        ? {
            ...row,
            tag_id: mappedTagId,
          }
        : row;
    const key = `${preparedRow.stack_id}\u0000${preparedRow.tag_id}`;
    if (importContext.stackTagKeys.has(key)) {
      importContext.duplicateStackTags += 1;
      return null;
    }
    importContext.stackTagKeys.add(key);
    return preparedRow;
  }

  if (definition.table === 'auto_tag_mappings' && row.tag_id !== null && row.tag_id !== undefined) {
    const mappedTagId = importContext.tagIdMap.get(String(row.tag_id));
    if (mappedTagId !== undefined && mappedTagId !== row.tag_id) {
      return {
        ...row,
        tag_id: mappedTagId,
      };
    }
  }

  return row;
};

const formatTableImportSummary = (table, count, importContext) => {
  if (table === 'authors' && importContext.duplicateAuthors > 0) {
    return `[standalone-import] ${table}: ${count} (${importContext.duplicateAuthors} duplicates merged)`;
  }

  if (table === 'tags' && importContext.duplicateTags > 0) {
    return `[standalone-import] ${table}: ${count} (${importContext.duplicateTags} duplicates merged)`;
  }

  if (table === 'stack_tags' && importContext.duplicateStackTags > 0) {
    return `[standalone-import] ${table}: ${count} (${importContext.duplicateStackTags} duplicates skipped after tag merge)`;
  }

  return `[standalone-import] ${table}: ${count}`;
};

const execSqlWithContext = (db, sql, context = {}) => {
  try {
    db.exec(sql);
  } catch (error) {
    const writeContext = formatWriteContext(context);
    const details = [
      `SQLite import への書き込みに失敗しました: ${compactErrorMessage(error)}`,
      writeContext ? `直前の書き込み: ${writeContext}` : '',
    ].filter(Boolean);
    throw new Error(details.join('\n'), { cause: error });
  }
};

const runSqliteImport = async () => {
  const tmpDbPath = `${dbPath}.tmp-${process.pid}`;
  await fsp.rm(tmpDbPath, { force: true });
  await fsp.mkdir(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(tmpDbPath);
  let transactionStarted = false;

  try {
    execSqlWithContext(db, 'PRAGMA foreign_keys = OFF;', { phase: 'sqlite setup' });
    execSqlWithContext(db, 'PRAGMA journal_mode = OFF;', { phase: 'sqlite setup' });
    execSqlWithContext(db, 'PRAGMA synchronous = OFF;', { phase: 'sqlite setup' });
    execSqlWithContext(db, await fsp.readFile(schemaPath, 'utf8'), { phase: 'schema' });
    execSqlWithContext(db, 'PRAGMA foreign_keys = OFF;\nBEGIN IMMEDIATE;', {
      phase: 'transaction start',
    });
    transactionStarted = true;

    const counts = {};
    const importContext = createImportContext();

    for (const definition of tableImports) {
      const filePath = path.join(dataDir, definition.file);
      await requireFile(filePath, definition.file);
      const count = await importNdjsonTable(db, filePath, definition, importContext);
      counts[definition.table] = count;
      console.log(formatTableImportSummary(definition.table, count, importContext));
    }

    execSqlWithContext(db, 'COMMIT;\nPRAGMA foreign_keys = ON;', { phase: 'commit' });
    transactionStarted = false;

    const fkErrors = runSqliteScalarList(db, 'PRAGMA foreign_key_check;');
    if (fkErrors.length > 0) {
      throw new Error(`foreign_key_check failed:\n${fkErrors.join('\n')}`);
    }

    db.close();

    if (fs.existsSync(dbPath)) {
      if (!force) {
        await fsp.rm(tmpDbPath, { force: true });
        throw new Error(`DB出力先が既に存在します: ${dbPath} (--force で上書きできます)`);
      }
      await fsp.rm(dbPath, { force: true });
    }

    await fsp.rename(tmpDbPath, dbPath);
    return {
      ...counts,
      _merged_duplicate_authors: importContext.duplicateAuthors,
      _merged_duplicate_tags: importContext.duplicateTags,
      _skipped_duplicate_stack_tags: importContext.duplicateStackTags,
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // Keep the original import failure.
      }
    }
    db.close();
    await fsp.rm(tmpDbPath, { force: true });
    throw error;
  }
};

const importNdjsonTable = async (db, filePath, definition, importContext) => {
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const columnSql = definition.columns.map(sqlIdentifier).join(', ');
  const placeholders = definition.columns.map(() => '?').join(', ');
  const statement = db.prepare(
    `INSERT INTO ${sqlIdentifier(definition.table)} (${columnSql}) VALUES (${placeholders})`
  );
  let count = 0;
  let lineNumber = 0;

  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw new Error(
        `${definition.file}:${lineNumber} のJSONを読み取れません: ${compactErrorMessage(error)}`
      );
    }
    const preparedRow = prepareRowForImport(row, definition, importContext);
    if (!preparedRow) continue;

    const values = definition.columns.map((column) => sqliteValue(preparedRow[column]));
    try {
      statement.run(...values);
    } catch (error) {
      throw new Error(
        [
          `SQLite import への書き込みに失敗しました: ${compactErrorMessage(error)}`,
          `直前の書き込み: ${formatWriteContext({
            phase: 'table import',
            table: definition.table,
            file: definition.file,
            lineNumber,
            rowId: preparedRow.id,
          })}`,
        ].join('\n'),
        { cause: error }
      );
    }
    count += 1;
    if (progressInterval > 0 && count % progressInterval === 0) {
      console.log(`[standalone-import] ${definition.table}: ${count}...`);
    }
  }

  return count;
};

const runSqliteScalarList = (db, sql) => {
  return db
    .prepare(sql)
    .all()
    .map((row) => Object.values(row).join('|'))
    .filter(Boolean);
};

const normalizePathKey = (key) => {
  if (!key || typeof key !== 'string') return '';
  const withoutProtocol = key.replace(/^https?:\/\/[^/]+/i, '');
  return withoutProtocol.replace(/^\/+/, '');
};

const storageCandidates = (key) => {
  const normalized = normalizePathKey(key);
  if (!normalized) return [];
  const candidates = [path.join(storageRoot, normalized)];
  if (normalized.startsWith('library/')) {
    candidates.push(path.join(storageRoot, normalized.replace(/^library\//, '')));
    candidates.push(path.join(path.dirname(storageRoot), normalized));
  }
  if (normalized.startsWith('files/')) {
    candidates.push(path.join(storageRoot, normalized.replace(/^files\//, '')));
  }
  return [...new Set(candidates)];
};

const verifyFileReferences = async () => {
  if (!verifyFiles) return null;

  const filePath = path.join(dataDir, 'files.ndjson');
  await requireFile(filePath, 'files.ndjson');

  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const summary = { total: 0, missing: 0, missing_by_kind: {}, missing_samples: [] };

  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    summary.total += 1;
    const key = normalizePathKey(row.normalized_key ?? row.key);
    const candidates = storageCandidates(key);
    if (!candidates.some((candidate) => fs.existsSync(candidate))) {
      summary.missing += 1;
      summary.missing_by_kind[row.kind] = (summary.missing_by_kind[row.kind] ?? 0) + 1;
      if (summary.missing_samples.length < 10) {
        summary.missing_samples.push({ kind: row.kind, key, target: candidates[0] ?? '' });
      }
    }
  }

  return summary;
};

const writeImportReport = async ({ manifest, counts, fileVerification }) => {
  const report = {
    imported_at: new Date().toISOString(),
    input: inputRoot,
    db: dbPath,
    manifest: {
      format: manifest.format,
      version: manifest.version,
      generated_at: manifest.generated_at,
      options: manifest.options,
    },
    counts,
    file_verification: fileVerification,
  };

  const reportPath = `${dbPath}.import-report.json`;
  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return reportPath;
};

const run = async () => {
  await requireFile(manifestPath, 'manifest.json');
  await requireFile(schemaPath, 'schema.sql');
  if (!fs.existsSync(dataDir)) {
    throw new Error(`data ディレクトリが見つかりません: ${dataDir}`);
  }

  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  if (manifest.format !== 'caramel-board-standalone-export') {
    throw new Error(`未対応のexport形式です: ${manifest.format}`);
  }

  console.log(`[standalone-import] input: ${inputRoot}`);
  console.log(`[standalone-import] db: ${dbPath}`);
  const counts = await runSqliteImport();
  const fileVerification = await verifyFileReferences();
  const reportPath = await writeImportReport({ manifest, counts, fileVerification });

  console.log('[standalone-import] 完了');
  console.log(`[standalone-import] report: ${reportPath}`);
  if (fileVerification) {
    console.log(
      `[standalone-import] files: total=${fileVerification.total}, missing=${fileVerification.missing}`
    );
  }
};

try {
  await run();
} catch (error) {
  console.error('[standalone-import] 失敗しました');
  console.error(error);
  process.exitCode = 1;
}
