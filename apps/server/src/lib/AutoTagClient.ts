import { readFile } from 'node:fs/promises';
import path from 'node:path';

interface TagPrediction {
  predicted_tags: string[];
  tag_count: number;
  threshold: number;
  scores: Record<string, number>;
  processing_time_ms?: number;
}

// Embedding/CLIP interfaces removed (AutoTag-only)

export class AutoTagClient {
  private baseURL: string;

  private timeoutMs: number;

  constructor(baseURL: string = process.env.JOYTAG_SERVER_URL || 'http://localhost:5001') {
    this.baseURL = baseURL.replace(/\/+$/, '');
    this.timeoutMs = Number(process.env.JOYTAG_REQUEST_TIMEOUT_MS || 300000);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: string;
    services: Record<string, string>;
    version: string;
  }> {
    return this.requestJson('/health');
  }

  /**
   * Generate tags for an image
   */
  async generateTags(imagePathOrKey: string, threshold = 0.4): Promise<TagPrediction> {
    // Check if this is a file key (relative path) or absolute path
    if (
      imagePathOrKey.startsWith('library/') ||
      imagePathOrKey.startsWith('files/') ||
      !imagePathOrKey.startsWith('/')
    ) {
      // Send as file key
      return this.requestJson('/api/v1/tag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          file_key: imagePathOrKey,
          threshold,
        }),
      });
    } else {
      // Send as file upload for absolute paths
      const image = await readFile(imagePathOrKey);
      const formData = new FormData();
      formData.append('image', new Blob([toBlobPart(image)]), path.basename(imagePathOrKey));
      formData.append('threshold', threshold.toString());

      return this.requestJson('/api/v1/tag', {
        method: 'POST',
        body: formData,
      });
    }
  }

  /**
   * Generate tags from image buffer
   */
  async generateTagsFromBuffer(
    imageBuffer: Buffer,
    filename: string,
    threshold = 0.4
  ): Promise<TagPrediction> {
    const formData = new FormData();
    formData.append('image', new Blob([toBlobPart(imageBuffer)]), filename);
    formData.append('threshold', threshold.toString());

    return this.requestJson('/api/v1/tag', {
      method: 'POST',
      body: formData,
    });
  }

  /**
   * Backward-compatible wrapper used by legacy services expecting predictFromFile
   */
  async predictFromFile(fileKey: string | null, threshold = 0.4): Promise<TagPrediction> {
    if (!fileKey) {
      throw new Error('fileKey is required for AutoTag prediction');
    }
    return this.generateTags(fileKey, threshold);
  }

  // All embedding/CLIP methods removed. Only AutoTag endpoints remain.

  private requestUrl(route: string): string {
    return new URL(route, `${this.baseURL}/`).toString();
  }

  private async requestJson<TResponse>(route: string, init: RequestInit = {}): Promise<TResponse> {
    const response = await fetch(this.requestUrl(route), {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const data = await parseResponseBody(response);
    if (!response.ok) {
      throw new AutoTagHttpError(response, data);
    }
    return data as TResponse;
  }
}

interface AutoTagHttpErrorResponse {
  status: number;
  data: unknown;
}

class AutoTagHttpError extends Error {
  response: AutoTagHttpErrorResponse;

  constructor(response: Response, data: unknown) {
    super(formatHttpErrorMessage(response, data));
    this.name = 'AutoTagHttpError';
    this.response = {
      status: response.status,
      data,
    };
  }
}

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const formatHttpErrorMessage = (response: Response, data: unknown) => {
  const detail = typeof data === 'string' ? data : JSON.stringify(data);
  return detail
    ? `JoyTag request failed (${response.status} ${response.statusText}): ${detail}`
    : `JoyTag request failed (${response.status} ${response.statusText})`;
};

const toBlobPart = (buffer: Buffer): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes;
};

// Singleton instance
let autoTagClient: AutoTagClient | null = null;
export function getAutoTagClient(): AutoTagClient {
  if (!autoTagClient) {
    autoTagClient = new AutoTagClient();
  }
  return autoTagClient;
}
