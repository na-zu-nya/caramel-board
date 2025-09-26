import fs from 'node:fs';
import path from 'node:path';
import {zValidator} from '@hono/zod-validator';
import type {Stack} from '@prisma/client';
import {Hono} from 'hono';
import {DuplicateAssetError} from '../../../errors/DuplicateAssetError';
import {DatasetIdParamSchema, IdParamSchema, StackQuerySchema, UpdateStackSchema,} from '../../../schemas';
import {SearchQuerySchema} from '../../../schemas/search-schema.js';
import {datasetScope} from '../middleware/dataset-scope';
import type {SearchMode, SearchRequest} from '../services/search-service.js';

const app = new Hono();

// Apply dataset scope middleware
app.use('/:dataSetId/*', datasetScope);

// Get all stacks in a dataset with unified search
app.get(
  '/:dataSetId/stacks',
  zValidator('param', DatasetIdParamSchema),
  zValidator('query', SearchQuerySchema),
  async (c) => {
    try {
      const dataSetId = c.req.valid('param').dataSetId;
      const queryParams = c.req.valid('query');

      // Get SearchService from context
      const searchService = c.get('searchService');
      if (!searchService) {
        return c.json({error: 'Search service not available'}, 500);
      }

      // Build search request
      const searchRequest: SearchRequest = {
        mode: queryParams.mode as SearchMode,
        datasetId: dataSetId,
        referenceStackId: queryParams.referenceStackId,
        query: queryParams.query,
        filters: queryParams.filters || {},
        sort: queryParams.sort || ({by: 'recommended', order: 'desc'} as const),
        pagination: {
          limit: queryParams.limit,
          offset: queryParams.offset,
        },
      };

      // Execute search
      const result = await searchService.search(searchRequest);

      return c.json(
        result satisfies {
          stacks: Stack[];
          total: number;
          limit: number;
          offset: number;
        }
      );
    } catch (error) {
      console.error('Error searching stacks:', error);
      return c.json({error: 'Failed to search stacks'}, 500);
    }
  }
);

// Get stack by ID
app.get(
  '/:dataSetId/stacks/:id',
  zValidator('param', IdParamSchema),
  zValidator('query', StackQuerySchema),
  async (c) => {
    try {
      const {id} = c.req.valid('param');
      const options = c.req.valid('query');
      const stackService = c.get('stackService');

      const stack = await stackService.getById(id, options);

      if (!stack) {
        return c.json({error: 'Stack not found'}, 404);
      }

      return c.json(stack);
    } catch (error) {
      console.error('Error getting stack:', error);
      return c.json({error: 'Failed to get stack'}, 500);
    }
  }
);

// Create stack with file upload
app.post('/:dataSetId/stacks', async (c) => {
  try {
    const stackService = c.get('stackService');

    // Handle multipart form data for file uploads
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const mediaType = formData.get('mediaType') as string;
    const name = formData.get('name') as string;

    if (!file) {
      return c.json(
        {
          success: false,
          error: {
            issues: [
              {
                code: 'invalid_type',
                expected: 'file',
                received: 'undefined',
                path: ['file'],
                message: 'File is required',
              },
            ],
          },
        },
        400
      );
    }

    // Ensure temp directory exists under storage root
    const storageRoot = process.env.FILES_STORAGE || path.resolve('./data');
    const tempDir = path.join(storageRoot, 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, {recursive: true});
    }

    // Create a temporary file for processing
    const buffer = await file.arrayBuffer();
    const tempPath = path.join(tempDir, `upload-${Date.now()}-${file.name}`);
    fs.writeFileSync(tempPath, Buffer.from(buffer));

    let finalMediaType = typeof mediaType === 'string' && mediaType.length > 0 ? mediaType : '';
    if (!finalMediaType) {
      const mimeType = (file.type || '').toLowerCase();
      if (mimeType.startsWith('video/')) {
        finalMediaType = 'video';
      } else if (mimeType === 'application/pdf') {
        finalMediaType = 'comic';
      } else {
        finalMediaType = 'image';
      }
    }

    // Create stack with the file
    const stack = await stackService.createWithFile({
      name: name || file.name,
      mediaType: finalMediaType,
      file: {
        path: tempPath,
        originalname: file.name,
        mimetype: file.type,
        size: file.size,
      },
    });

    return c.json(stack, 201);
  } catch (error: any) {
    if (error instanceof DuplicateAssetError) {
      return c.json(
        {
          error: '重複画像のため作成できません',
          code: error.code,
          details: error.details,
        },
        409
      );
    }
    console.error('Error creating stack:', error);
    return c.json({error: 'Failed to create stack'}, 500);
  }
});

// Update stack
app.put(
  '/:dataSetId/stacks/:id',
  zValidator('param', IdParamSchema),
  zValidator('json', UpdateStackSchema),
  async (c) => {
    try {
      const {id} = c.req.valid('param');
      const data = c.req.valid('json');
      const stackService = c.get('stackService');

      const stack = await stackService.update(id, data);
      return c.json(stack);
    } catch (error: any) {
      if (error.message === 'Stack not found in this dataset') {
        return c.json({error: error.message}, 404);
      }
      console.error('Error updating stack:', error);
      return c.json({error: 'Failed to update stack'}, 500);
    }
  }
);

// Delete stack
app.delete('/:dataSetId/stacks/:id', zValidator('param', IdParamSchema), async (c) => {
  try {
    const {id} = c.req.valid('param');
    const stackService = c.get('stackService');

    await stackService.delete(id);
    return c.json({success: true});
  } catch (error: any) {
    if (error.message === 'Stack not found in this dataset') {
      return c.json({error: error.message}, 404);
    }
    console.error('Error deleting stack:', error);
    return c.json({error: 'Failed to delete stack'}, 500);
  }
});

// Add tag to stack
app.post('/:dataSetId/stacks/:id/tags', zValidator('param', IdParamSchema), async (c) => {
  try {
    const {id} = c.req.valid('param');
    const {tag} = await c.req.json();
    const stackService = c.get('stackService');

    if (!tag) {
      return c.json({error: 'Tag is required'}, 400);
    }

    await stackService.addTag(id, tag);
    return c.json({success: true});
  } catch (error) {
    console.error('Error adding tag:', error);
    return c.json({error: 'Failed to add tag'}, 500);
  }
});

// Remove tag from stack
app.delete('/:dataSetId/stacks/:id/tags/:tag', zValidator('param', IdParamSchema), async (c) => {
  try {
    const {id} = c.req.valid('param');
    const tag = c.req.param('tag');
    const stackService = c.get('stackService');

    await stackService.removeTag(id, tag);
    return c.json({success: true});
  } catch (error) {
    console.error('Error removing tag:', error);
    return c.json({error: 'Failed to remove tag'}, 500);
  }
});

// Update stack author
app.put('/:dataSetId/stacks/:id/author', zValidator('param', IdParamSchema), async (c) => {
  try {
    const {id} = c.req.valid('param');
    const {author} = await c.req.json();
    const stackService = c.get('stackService');

    await stackService.updateAuthor(id, author);
    return c.json({success: true});
  } catch (error) {
    console.error('Error updating author:', error);
    return c.json({error: 'Failed to update author'}, 500);
  }
});

// Favorite/unfavorite stack
app.put('/:dataSetId/stacks/:id/favorite', zValidator('param', IdParamSchema), async (c) => {
  try {
    const {id} = c.req.valid('param');
    const {favorited} = await c.req.json();
    const stackService = c.get('stackService');

    await stackService.setFavorite(id, favorited);
    return c.json({success: true});
  } catch (error) {
    console.error('Error setting favorite:', error);
    return c.json({error: 'Failed to set favorite'}, 500);
  }
});

// Like stack
app.post('/:dataSetId/stacks/:id/like', zValidator('param', IdParamSchema), async (c) => {
  try {
    const {id} = c.req.valid('param');
    const stackService = c.get('stackService');

    await stackService.like(id);
    return c.json({success: true});
  } catch (error) {
    console.error('Error liking stack:', error);
    return c.json({error: 'Failed to like stack'}, 500);
  }
});

// Search tags for dataset
app.get('/:dataSetId/tags/search', async (c) => {
  try {
    const key = c.req.query('key') || '';
    const tagService = c.get('tagService');

    const tags = await tagService.search(key);
    return c.json(tags);
  } catch (error) {
    console.error('Error searching tags:', error);
    return c.json({error: 'Failed to search tags'}, 500);
  }
});

export {app as datasetStacksRoute};
