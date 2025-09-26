import * as fs from 'fs';
import path from 'path';
import type { Stream } from 'stream';
import fsExtra, { type Dirent, type WriteStream } from 'fs-extra';
import { getHash } from '../../utils/functions';

const { mkdirp, mkdirpSync, rmdir } = fsExtra;

interface DataStorageConfig {
  storageDir: string;
}

export const createDataStorageService = (config: DataStorageConfig) => {
  const resolveRoot = (): string => {
    if (config.storageDir) {
      return path.resolve(config.storageDir);
    }
    if (process.env.FILES_STORAGE) {
      return path.resolve(process.env.FILES_STORAGE);
    }

    const candidates = [
      path.resolve('./data/assets'),
      path.resolve('./assets'),
      path.resolve('./data'),
    ];

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch {
        // ignore
      }
    }

    return path.resolve('./data');
  };

  const storageDir = resolveRoot();

  // データセットIDを含むパスを生成
  const buildPath = (key: string, dataSetId?: number): string => {
    // keyが既にdataSetIdを含んでいる場合はそのまま使用
    if (key.startsWith('library/') && /^library\/\d+\//.test(key)) {
      return key;
    }

    if (key.startsWith('files/') && /^files\/\d+\//.test(key)) {
      return key;
    }

    // dataSetIdが指定されていない場合はデフォルト(1)を使用
    const dsId = dataSetId || 1;

    // library/で始まる場合はdataSetIdを挿入
    if (key.startsWith('library/')) {
      return key.replace('library/', `library/${dsId}/`);
    }

    // 旧仕様: files/で始まる場合はdataSetIdを挿入
    if (key.startsWith('files/')) {
      return key.replace('files/', `files/${dsId}/`);
    }

    // それ以外はそのまま返す（tmpなど）
    return key;
  };

  const getPath = (key: string): string => {
    // Normalize to avoid absolute keys discarding storageDir
    const safeKey = key.startsWith('/') ? key.slice(1) : key;
    console.log('Storage.getPath:key:', safeKey);
    console.log('Storage.getPath:dataDir:', storageDir);
    return path.join(storageDir, safeKey);
  };

  return {
    /**
     * List files in a directory
     */
    async list(key: string, dataSetId?: number): Promise<Dirent[]> {
      const finalKey = buildPath(key, dataSetId);
      return new Promise((resolve, reject) => {
        fs.readdir(getPath(finalKey), { withFileTypes: true }, (err, data) => {
          if (err) {
            return reject(err);
          }

          resolve(data.filter((dirent) => dirent.isFile()));
        });
      });
    },

    /**
     * Get file contents as string
     */
    async get(key: string, dataSetId?: number): Promise<string> {
      const finalKey = buildPath(key, dataSetId);
      return new Promise((resolve, reject) => {
        fs.readFile(getPath(finalKey), { encoding: 'utf-8' }, (err, data) => {
          if (err) {
            return reject(err);
          }

          resolve(data);
        });
      });
    },

    /**
     * Get file as stream
     */
    getStream(key: string, dataSetId?: number): Stream {
      const finalKey = buildPath(key, dataSetId);
      return fs.createReadStream(getPath(finalKey));
    },

    /**
     * Put file contents
     */
    async put(key: string, data: string, dataSetId?: number): Promise<void> {
      const finalKey = buildPath(key, dataSetId);
      const targetPath = getPath(finalKey);
      // 書き込み前にディレクトリを作成
      await mkdirp(path.dirname(targetPath));

      return new Promise((resolve, reject) => {
        fs.writeFile(targetPath, data, (err) => {
          if (err) {
            return reject(err);
          }

          resolve();
        });
      });
    },

    /**
     * Put stream
     */
    async putStream(key: string, stream: Stream, dataSetId?: number): Promise<void> {
      const writeStream = this.getPutStream(key, dataSetId);
      stream.pipe(writeStream);
    },

    /**
     * Get writable stream
     */
    getPutStream(key: string, dataSetId?: number): WriteStream {
      const finalKey = buildPath(key, dataSetId);
      const targetPath = getPath(finalKey);
      // ストリーム書き込み前にディレクトリを作成
      mkdirpSync(path.dirname(targetPath));
      return fs.createWriteStream(targetPath);
    },

    /**
     * Move file
     */
    move(key: string, oldPath: string, dataSetId?: number): void {
      const finalKey = buildPath(key, dataSetId);
      console.log('DataStorage.move', oldPath, getPath(finalKey));
      const targetPath = getPath(finalKey);
      // 移動先のディレクトリを確実に作成
      mkdirpSync(path.dirname(targetPath));
      fs.copyFileSync(oldPath, targetPath);
      fs.rmSync(oldPath);
    },

    /**
     * Delete file
     */
    async delete(key: string, dataSetId?: number): Promise<void> {
      const finalKey = buildPath(key, dataSetId);
      return new Promise((resolve, reject) => {
        fs.rm(getPath(finalKey), (err) => {
          if (err) {
            return reject(err);
          }

          resolve();
        });
      });
    },

    /**
     * Check if file exists
     */
    exists(key: string, dataSetId?: number): boolean {
      const finalKey = buildPath(key, dataSetId);
      const targetPath = getPath(finalKey);
      return !!fs.existsSync(targetPath);
    },

    /**
     * Create directory
     */
    async mkdir(key: string, dataSetId?: number): Promise<void> {
      const finalKey = buildPath(key, dataSetId);
      return new Promise((resolve, reject) => {
        mkdirp(getPath(finalKey), (err) => {
          if (err) {
            return reject(err);
          }

          resolve();
        });
      });
    },

    /**
     * Remove directory
     */
    async rmdir(key: string, dataSetId?: number): Promise<void> {
      const finalKey = buildPath(key, dataSetId);
      return new Promise((resolve, reject) => {
        rmdir(getPath(finalKey), (err) => {
          if (err) {
            return reject(err);
          }

          resolve();
        });
      });
    },

    /**
     * Get full path
     */
    getPath(key: string): string {
      return getPath(key);
    },

    /**
     * Get file hash
     */
    async getHash(key: string, dataSetId?: number): Promise<string> {
      const finalKey = buildPath(key, dataSetId);
      return getHash(getPath(finalKey));
    },

    /**
     * Delete a file
     */
    async deleteFile(key: string, dataSetId?: number): Promise<void> {
      const finalKey = buildPath(key, dataSetId);
      const filePath = getPath(finalKey);
      
      return new Promise((resolve, reject) => {
        fs.unlink(filePath, (err) => {
          if (err && err.code !== 'ENOENT') {
            return reject(err);
          }
          resolve();
        });
      });
    },
  };
};

// 型エクスポート
export type DataStorageService = ReturnType<typeof createDataStorageService>;
