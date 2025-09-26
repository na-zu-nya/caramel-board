import { Hono } from 'hono';

const uploadRoute = new Hono();

// Store upload defaults (in memory for now - could be persisted to DB per user)
let uploadDefaults: {
  datasetId?: string;
  mediaType?: string;
  tags?: string[];
  author?: string;
} = {};

// Set upload defaults
uploadRoute.put('/defaults', async (c) => {
  try {
    const body = await c.req.json();

    uploadDefaults = {
      datasetId: body.datasetId,
      mediaType: body.mediaType,
      tags: Array.isArray(body.tags) ? body.tags : [],
      author: body.author,
    };

    console.log('Upload defaults updated:', uploadDefaults);

    return c.json({ success: true });
  } catch (error) {
    console.error('Failed to set upload defaults:', error);
    return c.json({ error: 'Failed to set upload defaults' }, 500);
  }
});

// Get upload defaults
uploadRoute.get('/defaults', (c) => {
  return c.json(uploadDefaults);
});

export { uploadRoute };
