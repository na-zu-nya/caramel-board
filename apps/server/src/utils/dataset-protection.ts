import { getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { prisma } from '../shared/di';
import crypto from 'node:crypto';

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

export async function isDatasetAuthorized(c: Context, datasetId: number): Promise<boolean> {
  const ds = await prisma.dataSet.findUnique({ where: { id: datasetId }, select: { isProtected: true, passwordHash: true } });
  if (!ds) return false;
  if (!ds.isProtected) return true;
  const token = getCookie(c, getCookieName(datasetId));
  if (!token) return false;
  if (!ds.passwordHash) return false;
  const expected = signToken(datasetId, ds.passwordHash);
  return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
}

export async function ensureDatasetAuthorized(c: Context, datasetId: number) {
  const ok = await isDatasetAuthorized(c, datasetId);
  if (!ok) {
    return c.json({ error: 'Protected dataset', protected: true }, 401);
  }
  return null;
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

