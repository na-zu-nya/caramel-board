import {prisma} from '../../app';
import {AutoTagClient} from '../../lib/AutoTagClient';

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

      prediction = await prisma.autoTagPrediction.upsert({
        where: { assetId: asset.id },
        create: {
          assetId: asset.id,
          threshold,
          tags: result.tags,
          scores: result.scores,
          tagCount: (result as any).tags ? (result as any).tags.length : 0,
        },
        update: {
          threshold,
          tags: result.tags,
          scores: result.scores,
          tagCount: (result as any).tags ? (result as any).tags.length : 0,
        },
      });
    }

    return {
      stackId,
      assetId: asset.id,
      threshold: prediction.threshold,
      tags: (prediction as any).tags,
      scores: prediction.scores,
      cached: true,
      createdAt: prediction.createdAt,
    };
  }
}
