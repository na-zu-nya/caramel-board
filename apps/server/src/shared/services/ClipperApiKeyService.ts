import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const KEY_PREFIX = 'cb_clip_';

export interface ClipperApiKeyState {
  configured: boolean;
  keyPreview: string | null;
  createdAt: string | null;
}

interface StoredClipperApiKey {
  apiKeyEncoded: string;
  keyPreview: string;
  createdAt: string;
}

const getSettingsPath = () => {
  if (process.env.CARAMEL_CLIPPER_KEY_PATH) return process.env.CARAMEL_CLIPPER_KEY_PATH;
  const root = process.env.FILES_STORAGE || path.resolve('./data');
  return path.join(root, 'settings', 'clipper-api-key.json');
};

const encodeApiKey = (apiKey: string) => Buffer.from(apiKey, 'utf8').toString('base64url');

const decodeApiKey = (encoded: string) => Buffer.from(encoded, 'base64url').toString('utf8');

const previewApiKey = (apiKey: string) => `${apiKey.slice(0, KEY_PREFIX.length + 8)}...`;

const isStoredClipperApiKey = (value: unknown): value is StoredClipperApiKey => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.apiKeyEncoded === 'string' &&
    typeof record.keyPreview === 'string' &&
    typeof record.createdAt === 'string'
  );
};

const readStoredKey = (): StoredClipperApiKey | null => {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return isStoredClipperApiKey(parsed) ? parsed : null;
  } catch (error) {
    console.warn('Failed to read Clipper API key settings', error);
    return null;
  }
};

const writeStoredKey = (storedKey: StoredClipperApiKey) => {
  const settingsPath = getSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(storedKey, null, 2)}\n`, { mode: 0o600 });
};

const safeEquals = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export const getClipperApiKeyState = (): ClipperApiKeyState => {
  const storedKey = readStoredKey();
  return {
    configured: Boolean(storedKey),
    keyPreview: storedKey?.keyPreview ?? null,
    createdAt: storedKey?.createdAt ?? null,
  };
};

export const issueClipperApiKey = (): ClipperApiKeyState & { apiKey: string } => {
  const apiKey = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  const createdAt = new Date().toISOString();
  const storedKey = {
    apiKeyEncoded: encodeApiKey(apiKey),
    keyPreview: previewApiKey(apiKey),
    createdAt,
  };
  writeStoredKey(storedKey);
  return {
    apiKey,
    configured: true,
    keyPreview: storedKey.keyPreview,
    createdAt,
  };
};

export const revokeClipperApiKey = () => {
  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) fs.rmSync(settingsPath);
};

export const extractClipperApiKey = (headers: Headers): string | null => {
  const headerValue = headers.get('x-caramel-clipper-key')?.trim();
  if (headerValue) return headerValue;

  const authorization = headers.get('authorization')?.trim();
  if (!authorization?.startsWith('Bearer ')) return null;
  return authorization.slice('Bearer '.length).trim() || null;
};

export const hasValidClipperApiKey = (headers: Headers): boolean => {
  const apiKey = extractClipperApiKey(headers);
  if (!apiKey) return false;

  const storedKey = readStoredKey();
  if (!storedKey) return false;

  try {
    return safeEquals(apiKey, decodeApiKey(storedKey.apiKeyEncoded));
  } catch {
    return false;
  }
};
