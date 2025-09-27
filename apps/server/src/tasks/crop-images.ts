import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import 'source-map-support/register';

import type { ArgumentsCamelCase } from 'yargs';
import yargs from 'yargs';

dotenv.config();

interface CropOptions {
  _: (string | number)[];
  sourceDir: string;
  s: string;
  outdir: string;
  o: string;
  trim: boolean;
  left: number;
  right: number;
  top: number;
  bottom: number;
  basisHeight: number;
  basisWidth: number;
  rename: boolean;
}

const option = yargs
  .option('sourceDir', {
    alias: 's',
    type: 'string',
    description: 'Source directory',
    demandOption: true,
  })
  .option('outdir', {
    alias: 'o',
    type: 'string',
    description: 'Output directory',
    demandOption: true,
  })
  .option('trim', {
    type: 'boolean',
    default: false,
    description: 'trim',
  })
  .option('rename', {
    type: 'boolean',
    default: false,
    description: 'rename',
  })
  .option('top', {
    type: 'number',
    default: 0,
    description: 'top',
  })
  .option('left', {
    type: 'number',
    default: 0,
    description: 'left',
  })
  .option('right', {
    type: 'number',
    default: 0,
    description: 'right',
  })
  .option('bottom', {
    type: 'number',
    default: 0,
    description: 'bottom',
  })
  .option('basisWidth', {
    type: 'number',
    default: 3496,
    description: 'DPI',
  })
  .option('basisHeight', {
    type: 'number',
    default: 2480,
    description: 'DPI',
  })
  .help()
  .parseSync() as ArgumentsCamelCase<CropOptions>;

async function main() {
  console.log(option);
  const files = fs.readdirSync(option.sourceDir);
  const sortedImages = files
    .filter((f) => {
      return f.endsWith('.jpg') || f.endsWith('.png');
    })
    .map((f) => path.join(option.sourceDir, f))
    .sort((f) => {
      const stat = fs.statSync(f);
      return stat.birthtimeMs;
    });

  let i = 1;
  for (const image of sortedImages) {
    console.log('Crop:', image);
    const output = path.join(
      option.outdir,
      option.rename ? `${`${i}`.padStart(3, '0')}.jpg` : path.basename(image).replace(/png$/, 'jpg')
    );
    const cmd = `convert -crop ${option.right - option.left}x${option.bottom - option.top}+${
      option.left
    }+${option.top} -geometry ${option.basisWidth}x${option.basisHeight} "${image}" "${output}"`;
    console.log(cmd);
    execSync(cmd);
    i++;
  }
}

main();
