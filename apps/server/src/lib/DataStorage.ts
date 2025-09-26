import * as fs from 'fs';
import path from 'path';
import type { Stream } from 'stream';
import fsExtra, { type Dirent, type WriteStream } from 'fs-extra';
import { getHash } from '../utils/functions';

const { mkdirp, mkdirpSync, rmdir } = fsExtra;

const resolveDataDirectory = () => {
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
      // ignore file system errors and keep checking fallbacks
    }
  }

  return path.resolve('./data');
};

const getDataDirectory = () => resolveDataDirectory();

// biome-ignore lint/complexity/noStaticOnlyClass: Utility class for data storage operations
export class DataStorage {
  // データセットIDを含むパスを生成
  private static buildPath(key: string, dataSetId?: number): string {
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

    // legacy files/で始まる場合はdataSetIdを挿入
    if (key.startsWith('files/')) {
      return key.replace('files/', `files/${dsId}/`);
    }

    // それ以外はそのまま返す（tmpなど）
    return key;
  }
  static async list(key: string, dataSetId?: number): Promise<Dirent[]> {
    const finalKey = DataStorage.buildPath(key, dataSetId);
    return new Promise((resolve, reject) => {
      fs.readdir(DataStorage.getPath(finalKey), { withFileTypes: true }, (err, data) => {
        if (err) {
          return reject(err);
        }

        resolve(data.filter((dirent) => dirent.isFile()));
      });
    });
  }

  static async get(key: string, dataSetId?: number): Promise<string> {
    const finalKey = DataStorage.buildPath(key, dataSetId);
    return new Promise((resolve, reject) => {
      fs.readFile(DataStorage.getPath(finalKey), { encoding: 'utf-8' }, (err, data) => {
        if (err) {
          return reject(err);
        }

        resolve(data);
      });
    });
  }

  static getStream(key: string, dataSetId?: number): Stream {
    const finalKey = DataStorage.buildPath(key, dataSetId);
    return fs.createReadStream(DataStorage.getPath(finalKey));
  }

  static async put(key: string, data: string, dataSetId?: number): Promise<void> {
    const finalKey = DataStorage.buildPath(key, dataSetId);
    const targetPath = DataStorage.getPath(finalKey);
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
  }

  static async putStream(key: string, stream: Stream, dataSetId?: number) {
    const writeStream = DataStorage.getPutStream(key, dataSetId);
    stream.pipe(writeStream);
  }

  static getPutStream(key: string, dataSetId?: number): WriteStream {
    const finalKey = DataStorage.buildPath(key, dataSetId);
    const targetPath = DataStorage.getPath(finalKey);
    // ストリーム書き込み前にディレクトリを作成
    mkdirpSync(path.dirname(targetPath));
    return fs.createWriteStream(targetPath);
  }

  static move(key: string, oldPath: string, dataSetId?: number) {
    const finalKey = DataStorage.buildPath(key, dataSetId);
    console.log('DataStorage.move', oldPath, DataStorage.getPath(finalKey));
    const targetPath = DataStorage.getPath(finalKey);
    // 移動先のディレクトリを確実に作成
    mkdirpSync(path.dirname(targetPath));
    fs.copyFileSync(oldPath, targetPath);
    fs.rmSync(oldPath);
  }

  static async delete(key: string, dataSetId?: number): Promise<void> {
    const finalKey = DataStorage.buildPath(key, dataSetId);
    return new Promise((resolve, reject) => {
      fs.rm(DataStorage.getPath(finalKey), (err) => {
        if (err) {
          return reject(err);
        }

        resolve();
      });
    });
  }

  static exists(key: string, dataSetId?: number): boolean {
    const finalKey = DataStorage.buildPath(key, dataSetId);
    const targetPath = DataStorage.getPath(finalKey);
    return !!fs.existsSync(targetPath);
  }

  static async mkdir(key: string, dataSetId?: number): Promise<void> {
    const finalKey = DataStorage.buildPath(key, dataSetId);
    return new Promise((resolve, reject) => {
      mkdirp(DataStorage.getPath(finalKey), (err) => {
        if (err) {
          return reject(err);
        }

        resolve();
      });
    });
  }

  static async rmdir(key: string, dataSetId?: number): Promise<void> {
    const finalKey = DataStorage.buildPath(key, dataSetId);
    return new Promise((resolve, reject) => {
      rmdir(DataStorage.getPath(finalKey), (err) => {
        if (err) {
          return reject(err);
        }

        resolve();
      });
    });
  }

  static getPath(key: string): string {
    // Normalize to avoid absolute keys discarding storageDir
    const safeKey = key.startsWith('/') ? key.slice(1) : key;
    console.log('Storage.getPath:key:', safeKey);
    console.log('Storage.getPath:dataDir:', getDataDirectory());
    return path.join(getDataDirectory(), safeKey);
  }

  static async getHash(key: string, dataSetId?: number): Promise<string> {
    const finalKey = DataStorage.buildPath(key, dataSetId);
    return getHash(DataStorage.getPath(finalKey));
  }
}
