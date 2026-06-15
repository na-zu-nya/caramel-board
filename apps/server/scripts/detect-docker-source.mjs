#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..', '..');
const args = process.argv.slice(2);

dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(serverRoot, '.env'), override: false });

const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
};

const resolveUserPath = (value) => (path.isAbsolute(value) ? value : path.join(repoRoot, value));

const unique = (values) => [...new Set(values.filter((value) => value?.trim()))];

const defaultDatabaseUrls = (host, port) => [
  `postgresql://caramel_user:caramel_pass@${host}:${port}/caramel_board_db?connection_limit=20&pool_timeout=0`,
  `postgresql://caramel_user:caramel_password@${host}:${port}/caramel_board_db?connection_limit=20&pool_timeout=0`,
];

const composeCommand = () => {
  try {
    execFileSync('docker', ['compose', 'version'], { stdio: 'ignore' });
    return ['docker', 'compose'];
  } catch {
    try {
      execFileSync('docker-compose', ['version'], { stdio: 'ignore' });
      return ['docker-compose'];
    } catch {
      return null;
    }
  }
};

const parseComposePort = (raw) => {
  const value = raw.trim().split('\n')[0]?.trim();
  if (!value) return null;
  const match = value.match(/([^:]+):(\d+)$/);
  if (!match) return null;
  const host = match[1] === '0.0.0.0' || match[1] === '::' ? '127.0.0.1' : match[1];
  return { host, port: match[2] };
};

const composePortCandidates = () => {
  const command = composeCommand();
  if (!command) return [];

  const composeSets = [
    ['-f', 'docker-compose.yml'],
    ['-f', 'docker-compose.yml', '-f', 'docker-compose.local.yml'],
    ['-f', 'docker-compose.dev.yml'],
  ];

  const candidates = [];
  for (const composeArgs of composeSets) {
    if (
      composeArgs.some((arg) => arg.endsWith('.yml') && !fs.existsSync(path.join(repoRoot, arg)))
    ) {
      continue;
    }
    try {
      const raw = execFileSync(
        command[0],
        [...command.slice(1), ...composeArgs, 'port', 'postgres', '5432'],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      );
      const parsed = parseComposePort(raw);
      if (parsed) candidates.push(parsed);
    } catch {
      // Docker が未起動、または compose project が未起動の場合は既定候補に進む。
    }
  }

  return candidates;
};

const databaseUrlCandidates = () => {
  const explicit = getArgValue('database-url');
  const composeUrls = composePortCandidates().flatMap(({ host, port }) =>
    defaultDatabaseUrls(host, port)
  );
  return unique([
    explicit,
    process.env.DATABASE_URL,
    ...composeUrls,
    ...defaultDatabaseUrls('127.0.0.1', '5432'),
    ...defaultDatabaseUrls('localhost', '5432'),
  ]);
};

const storageRootFromLocalCompose = () => {
  const localCompose = path.join(repoRoot, 'docker-compose.local.yml');
  if (!fs.existsSync(localCompose)) return null;

  const lines = fs.readFileSync(localCompose, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/-\s*([^:]+):\/app\/data(?::|$)/);
    if (match?.[1]) return resolveUserPath(match[1].trim().replace(/^['"]|['"]$/g, ''));
  }
  return null;
};

const storageRootCandidates = () =>
  unique([
    getArgValue('storage-root'),
    process.env.FILES_STORAGE,
    storageRootFromLocalCompose(),
    path.join(repoRoot, 'data/assets'),
    path.join(repoRoot, 'data'),
    path.join(repoRoot, 'assets'),
  ]).map(resolveUserPath);

const detectStorageRoot = () => {
  const candidates = storageRootCandidates();
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  const storageRoot = existing ?? candidates[0] ?? path.join(repoRoot, 'data/assets');
  return {
    storageRoot,
    storageRootExists: fs.existsSync(storageRoot),
  };
};

const loadPrisma = async () => {
  try {
    return await import(path.join(serverRoot, 'node_modules/@prisma/client/index.js'));
  } catch {
    const resolved = require.resolve('@prisma/client');
    return await import(resolved);
  }
};

const tryDatabase = async (PrismaClient, databaseUrl) => {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    await prisma.$connect();
    const [datasetCount, stackCount, assetCount, datasets] = await Promise.all([
      prisma.dataSet.count(),
      prisma.stack.count(),
      prisma.asset.count(),
      prisma.dataSet.findMany({
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
        take: 5,
      }),
    ]);
    return { datasetCount, stackCount, assetCount, datasets };
  } finally {
    await prisma.$disconnect();
  }
};

const run = async () => {
  const { PrismaClient } = await loadPrisma();
  const storage = detectStorageRoot();
  let lastError = '';

  for (const databaseUrl of databaseUrlCandidates()) {
    try {
      const summary = await tryDatabase(PrismaClient, databaseUrl);
      process.stdout.write(
        `${JSON.stringify({
          available: true,
          databaseUrl,
          ...storage,
          ...summary,
          message: 'old Docker PostgreSQL is reachable',
        })}\n`
      );
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      available: false,
      databaseUrl: '',
      ...storage,
      datasetCount: 0,
      stackCount: 0,
      assetCount: 0,
      datasets: [],
      message: lastError || 'old Docker PostgreSQL was not detected',
    })}\n`
  );
};

try {
  await run();
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({
      available: false,
      databaseUrl: '',
      storageRoot: path.join(repoRoot, 'data/assets'),
      storageRootExists: false,
      datasetCount: 0,
      stackCount: 0,
      assetCount: 0,
      datasets: [],
      message: error instanceof Error ? error.message : String(error),
    })}\n`
  );
}
