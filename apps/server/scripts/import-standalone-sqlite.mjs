#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs, { createReadStream, promises as fsp } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
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

const sqlLiteral = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return `'${text.replaceAll("'", "''")}'`;
};

const writeSql = async (stdin, sql) => {
  if (!stdin.write(sql)) {
    await once(stdin, 'drain');
  }
};

const runSqliteImport = async () => {
  const tmpDbPath = `${dbPath}.tmp-${process.pid}`;
  await fsp.rm(tmpDbPath, { force: true });
  await fsp.mkdir(path.dirname(dbPath), { recursive: true });

  const child = spawn('sqlite3', [tmpDbPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  await writeSql(child.stdin, '.bail on\n');
  await writeSql(child.stdin, 'PRAGMA foreign_keys = OFF;\n');
  await writeSql(child.stdin, 'PRAGMA journal_mode = OFF;\n');
  await writeSql(child.stdin, 'PRAGMA synchronous = OFF;\n');
  await writeSql(child.stdin, await fsp.readFile(schemaPath, 'utf8'));
  await writeSql(child.stdin, '\nPRAGMA foreign_keys = OFF;\nBEGIN IMMEDIATE;\n');

  const counts = {};

  for (const definition of tableImports) {
    const filePath = path.join(dataDir, definition.file);
    await requireFile(filePath, definition.file);
    const count = await importNdjsonTable(child.stdin, filePath, definition);
    counts[definition.table] = count;
    console.log(`[standalone-import] ${definition.table}: ${count}`);
  }

  await writeSql(child.stdin, 'COMMIT;\nPRAGMA foreign_keys = ON;\n');
  child.stdin.end();

  const [code] = await once(child, 'close');
  if (code !== 0) {
    await fsp.rm(tmpDbPath, { force: true });
    throw new Error(`sqlite3 import failed (${code})\n${stderr || stdout}`);
  }

  const fkErrors = await runSqliteScalarList(tmpDbPath, 'PRAGMA foreign_key_check;');
  if (fkErrors.length > 0) {
    await fsp.rm(tmpDbPath, { force: true });
    throw new Error(`foreign_key_check failed:\n${fkErrors.join('\n')}`);
  }

  if (fs.existsSync(dbPath)) {
    if (!force) {
      await fsp.rm(tmpDbPath, { force: true });
      throw new Error(`DB出力先が既に存在します: ${dbPath} (--force で上書きできます)`);
    }
    await fsp.rm(dbPath, { force: true });
  }

  await fsp.rename(tmpDbPath, dbPath);
  return counts;
};

const importNdjsonTable = async (stdin, filePath, definition) => {
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const columnSql = definition.columns.map(sqlIdentifier).join(', ');
  let count = 0;

  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const values = definition.columns.map((column) => sqlLiteral(row[column])).join(', ');
    await writeSql(
      stdin,
      `INSERT INTO ${sqlIdentifier(definition.table)} (${columnSql}) VALUES (${values});\n`
    );
    count += 1;
  }

  return count;
};

const runSqliteScalarList = async (targetDbPath, sql) => {
  const child = spawn('sqlite3', ['-batch', targetDbPath, sql], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const [code] = await once(child, 'close');
  if (code !== 0) {
    throw new Error(`sqlite3 failed (${code}): ${stderr || stdout}`);
  }

  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
};

const normalizePathKey = (key) => {
  if (!key || typeof key !== 'string') return '';
  const withoutProtocol = key.replace(/^https?:\/\/[^/]+/i, '');
  return withoutProtocol.replace(/^\/+/, '');
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
    const target = path.join(storageRoot, key);
    if (!fs.existsSync(target)) {
      summary.missing += 1;
      summary.missing_by_kind[row.kind] = (summary.missing_by_kind[row.kind] ?? 0) + 1;
      if (summary.missing_samples.length < 10) {
        summary.missing_samples.push({ kind: row.kind, key, target });
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
