import { execSync } from 'node:child_process';
import path from 'node:path';

export function identifyFile(file: string) {
  const result = execSync(`identify "${file}"`, { encoding: 'utf-8' });
  return result
    .replace(/\n$/, '')
    .split('\n')
    .map((m) => parseInfo(file, m));
}

function parseInfo(sourceFile: string, infoString: string) {
  const info = [sourceFile, ...infoString.substr(sourceFile.length + 1).split(' ')];
  const [width, height] = info[2].split('x').map((v) => +v);
  return {
    path: info[0],
    basename: path.basename(info[0]),
    type: info[1],
    width,
    height,
    bit: +info[4].replace(/[^0-9]/g, ''),
    colorspace: info[5],
    size: info[6],
  };
}
