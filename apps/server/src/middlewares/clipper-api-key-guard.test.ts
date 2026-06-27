import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { issueClipperApiKey } from '../shared/services/ClipperApiKeyService';
import { clipperApiKeyGuard } from './clipper-api-key-guard';

const createApp = () =>
  new Hono()
    .use('/api/v1/*', clipperApiKeyGuard)
    .get('/api/v1/health', (c) => c.json({ status: 'ok' }))
    .get('/api/v1/datasets', (c) => c.json([]));

const extensionOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

describe('clipperApiKeyGuard', () => {
  const previousKeyPath = process.env.CARAMEL_CLIPPER_KEY_PATH;
  let tempDir: string | null = null;

  afterEach(() => {
    if (previousKeyPath === undefined) {
      delete process.env.CARAMEL_CLIPPER_KEY_PATH;
    } else {
      process.env.CARAMEL_CLIPPER_KEY_PATH = previousKeyPath;
    }
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  const useTempKeyPath = () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'caramel-clipper-key-guard-'));
    process.env.CARAMEL_CLIPPER_KEY_PATH = path.join(tempDir, 'clipper-api-key.json');
  };

  it('allows extension health checks without a Clipper key', async () => {
    useTempKeyPath();
    const response = await createApp().request('/api/v1/health', {
      headers: { origin: extensionOrigin },
    });

    expect(response.status).toBe(200);
  });

  it('requires a Clipper key for any browser extension API request outside public paths', async () => {
    useTempKeyPath();
    const response = await createApp().request('/api/v1/datasets', {
      headers: { origin: extensionOrigin },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Clipper API key is required' });
  });

  it('allows browser extension API requests with a valid Clipper key', async () => {
    useTempKeyPath();
    const { apiKey } = issueClipperApiKey();
    const response = await createApp().request('/api/v1/datasets', {
      headers: {
        origin: extensionOrigin,
        'x-caramel-clipper-key': apiKey,
      },
    });

    expect(response.status).toBe(200);
  });

  it('does not require a Clipper key for non-extension origins', async () => {
    useTempKeyPath();
    const response = await createApp().request('/api/v1/datasets', {
      headers: { origin: 'http://localhost:6766' },
    });

    expect(response.status).toBe(200);
  });
});
