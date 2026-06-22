import { Hono } from 'hono';
import {
  getClipperApiKeyState,
  issueClipperApiKey,
  revokeClipperApiKey,
} from '../shared/services/ClipperApiKeyService';

export const clipperRoute = new Hono();

clipperRoute.get('/api-key', (c) => c.json(getClipperApiKeyState()));

clipperRoute.post('/api-key', (c) => c.json(issueClipperApiKey(), 201));

clipperRoute.delete('/api-key', (c) => {
  revokeClipperApiKey();
  return c.json({ success: true, ...getClipperApiKeyState() });
});
