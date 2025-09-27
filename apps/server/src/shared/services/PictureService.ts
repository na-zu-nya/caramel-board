import type { Prisma } from '@prisma/client';
import { prisma } from '../../app';
import { AutoTagClient } from '../../lib/AutoTagClient';

type PredictionPayload = {
  tags: string[];
  scores: Record<string, number>;
  tagCount: number;
};

const ensureStringArray = (value: Prisma.JsonValue | null | undefined): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

const normalizePredictionResult = (result: unknown): PredictionPayload => {
  if (!result || typeof result !== 'object') {
    return { tags: [], scores: {}, tagCount: 0 };
  }

  const record = result as Record<string, unknown>;
  const tagsSource = record.tags ?? record.predicted_tags;
  const tags = Array.isArray(tagsSource)
    ? tagsSource.filter((tag): tag is string => typeof tag === 'string')
    : [];

  const rawScores = record.scores;
  const scores =
    rawScores && typeof rawScores === 'object' && !Array.isArray(rawScores)
      ? (rawScores as Record<string, number>)
      : {};

  const rawCount = record.tag_count;
  const tagCount = typeof rawCount === 'number' ? rawCount : tags.length;

  return {
    tags,
    scores,
    tagCount,
  };
};

export class PictureService {
  private autoTagClient: AutoTagClient;

  constructor() {
    this.autoTagClient = new AutoTagClient();
  }

  async predictTags(stackId: number, threshold = 0.4) {
    const stack = await prisma.stack.findUnique({
      where: { id: stackId },
      include: { assets: true },
    });

    if (!stack) {
      throw new Error('Stack not found');
    }

    if (stack.assets.length === 0) {
      throw new Error('No assets found in stack');
    }

    // Use the first asset for prediction
    const asset = stack.assets[0];

    // Check if prediction already exists
    let prediction = await prisma.autoTagPrediction.findFirst({
      where: {
        assetId: asset.id,
        threshold: { lte: threshold },
      },
      orderBy: { threshold: 'desc' },
    });

    if (!prediction) {
      console.log(`Predicting tags for asset ${asset.id}`);
      const result = await this.autoTagClient.predictFromFile(asset.file, threshold);
      const normalized = normalizePredictionResult(result);

      prediction = await prisma.autoTagPrediction.upsert({
        where: { assetId: asset.id },
        create: {
          assetId: asset.id,
          threshold,
          tags: normalized.tags,
          scores: normalized.scores,
          tagCount: normalized.tagCount,
        },
        update: {
          threshold,
          tags: normalized.tags,
          scores: normalized.scores,
          tagCount: normalized.tagCount,
        },
      });
    }

    const storedTags = ensureStringArray(prediction.tags as Prisma.JsonValue);

    return {
      stackId,
      assetId: asset.id,
      threshold: prediction.threshold,
      tags: storedTags,
      scores: prediction.scores,
      cached: true,
      createdAt: prediction.createdAt,
    };
  }
}
