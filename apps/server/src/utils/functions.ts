import crypto from 'crypto';
import fs from 'fs';

export function getExtension(sourcePath: string) {
  return sourcePath.substr(sourcePath.lastIndexOf('.') + 1) ?? '';
}

export function getFileType(sourcePath: string) {
  return getExtension(sourcePath).toLowerCase().replace(/jpe?g/, 'jpg');
}

export function getHash(path: string): Promise<string> {
  return new Promise((resolve) => {
    const stream = fs.createReadStream(path);
    const sha = crypto.createHash('sha256');
    stream.on('data', (chunk) => sha.update(chunk));
    stream.on('close', () => {
      resolve(sha.digest('hex'));
    });
  });
}
