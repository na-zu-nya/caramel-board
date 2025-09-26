import fs from 'fs';
import axios, { type AxiosInstance } from 'axios';
import FormData from 'form-data';

interface TagPrediction {
  predicted_tags: string[];
  tag_count: number;
  threshold: number;
  scores: Record<string, number>;
  processing_time_ms?: number;
}

// Embedding/CLIP interfaces removed (AutoTag-only)

export class AutoTagClient {
  private client: AxiosInstance;

  constructor(baseURL: string = process.env.JOYTAG_SERVER_URL || 'http://localhost:5001') {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
    });
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: string;
    services: Record<string, string>;
    version: string;
  }> {
    const response = await this.client.get('/health');
    return response.data;
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
      const response = await this.client.post<TagPrediction>('/api/v1/tag', {
        file_key: imagePathOrKey,
        threshold,
      });
      return response.data;
    } else {
      // Send as file upload for absolute paths
      const formData = new FormData();
      formData.append('image', fs.createReadStream(imagePathOrKey));
      formData.append('threshold', threshold.toString());

      const response = await this.client.post<TagPrediction>('/api/v1/tag', formData, {
        headers: formData.getHeaders(),
      });

      return response.data;
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
    formData.append('image', imageBuffer, { filename });
    formData.append('threshold', threshold.toString());

    const response = await this.client.post<TagPrediction>('/api/v1/tag', formData, {
      headers: formData.getHeaders(),
    });

    return response.data;
  }

  // All embedding/CLIP methods removed. Only AutoTag endpoints remain.
}

// Singleton instance
let autoTagClient: AutoTagClient | null = null;
export function getAutoTagClient(): AutoTagClient {
  if (!autoTagClient) {
    autoTagClient = new AutoTagClient();
  }
  return autoTagClient;
}
