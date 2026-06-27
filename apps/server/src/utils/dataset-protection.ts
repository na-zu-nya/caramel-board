import crypto from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

const TOKEN_PREFIX = 'ds_auth_';

function getSecret(): string {
  return process.env.SESSION_SECRET || 'dev-secret';
}

function getCookieName(datasetId: number): string {
  return `${TOKEN_PREFIX}${datasetId}`;
}

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const computed = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
}

function signToken(datasetId: number, passwordHash: string): string {
  const h = crypto.createHmac('sha256', getSecret());
  h.update(`${datasetId}:${passwordHash}`);
  return h.digest('hex');
}

export function isDatasetAuthorizedFromState(
  c: Context,
  datasetId: number,
  ds: { isProtected: boolean; passwordHash: string | null }
): boolean {
  if (!ds.isProtected) return true;
  const token = getCookie(c, getCookieName(datasetId));
  if (!token) return false;
  if (!ds.passwordHash) return false;
  const expected = signToken(datasetId, ds.passwordHash);
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
}

export function setDatasetAuthCookie(c: Context, datasetId: number, passwordHash: string) {
  const token = signToken(datasetId, passwordHash);
  setCookie(c, getCookieName(datasetId), token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 12, // 12 hours
  });
}
