#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(root, 'src');
const forbidden = ['@prisma/client', 'PrismaClient', 'usePrisma', 'getPrisma'];

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return full.endsWith('.ts') ? [full] : [];
  });
};

const violations = [];
for (const file of walk(sourceRoot)) {
  const raw = fs.readFileSync(file, 'utf8');
  for (const pattern of forbidden) {
    if (raw.includes(pattern)) {
      violations.push(`${path.relative(root, file)}: contains ${pattern}`);
    }
  }
}

if (violations.length > 0) {
  console.error('server-standalone must not depend on Prisma:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}
