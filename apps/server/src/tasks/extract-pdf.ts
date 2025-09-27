import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import path from 'node:path';
import 'source-map-support/register';
import type { ArgumentsCamelCase } from 'yargs';

import yargs from 'yargs';
import { identifyFile } from './utils/imageMagick';

dotenv.config();

interface ExtractOptions {
  _: (string | number)[];
  source: string;
  s: string;
  outdir: string;
  o: string;
  dpi: number;
  basisWidth: number;
  basisHeight: number;
}

const argv = yargs
  .option('source', {
    alias: 's',
    type: 'string',
    description: 'Source file',
    demandOption: true,
  })
  .option('outdir', {
    alias: 'o',
    type: 'string',
    description: 'Output directory',
    demandOption: true,
  })
  .option('dpi', {
    type: 'number',
    default: 300,
    description: 'DPI',
  })
  .option('basisWidth', {
    type: 'number',
    default: 1748,
    description: 'DPI',
  })
  .option('basisHeight', {
    type: 'number',
    default: 2480,
    description: 'DPI',
  })
  .help()
  .parseSync() as ArgumentsCamelCase<ExtractOptions>;

async function main() {
  const pages = identifyFile(argv.source);
  console.log(pages);

  let i = 1;
  for (const page of pages) {
    const output = path.join(argv.outdir, `${`${i}`.padStart(3, '0')}.jpg`);
    console.log(
      `convert -density ${argv.dpi} -geometry ${argv.basisWidth}x${argv.basisHeight} "${page.path}" "${output}"`
    );
    execSync(
      `convert -density ${argv.dpi} -geometry ${argv.basisWidth}x${argv.basisHeight} "${page.path}" "${output}"`
    );
    i++;
  }
}

main();
