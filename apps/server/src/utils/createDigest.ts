import { createHash } from 'node:crypto';
import type { Stream } from 'node:stream';

export function createStreamDigest(stream: Stream): Promise<string> {
  return new Promise((resolve, reject) => {
    const shasum = createHash('sha256');
    stream.on('data', (chunk) => shasum.update(chunk));
    stream.on('close', () => {
      resolve(shasum.digest('hex'));
    });
    stream.on('error', (err) => reject(err));
  });
}
