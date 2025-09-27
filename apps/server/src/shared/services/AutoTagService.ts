import type { PrismaClient } from '@prisma/client';
import { getAutoTagClient } from '../../lib/AutoTagClient';
import path from 'node:path';
import { withPublicAssetArray, toPublicAssetPath } from '../../utils/assetPath';

interface WeightedJaccardSimilarity {
  stackId: number;
  similarity: number;
  commonTags: string[];
}

export class AutoTagService {
  private stacksAIClient = getAutoTagClient();
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async aggregateStackTags(stackId: number, threshold = 0.4) {
    console.log(
      `AutoTagService[SINGLE]: Starting aggregation for stack ${stackId} with threshold ${threshold}`
    );

    const stack = await this.prisma.stack.findUnique({
      where: { id: stackId },
      include: { assets: true },
    });

    if (!stack) {
      console.log(`AutoTagService: Stack ${stackId} not found!`);
      throw new Error('Stack not found');
    }

    console.log(
      `AutoTagService[SINGLE]: Found stack ${stackId} with ${stack.assets.length} assets`
    );

    if (stack.assets.length === 0) {
      console.log(`AutoTagService[SINGLE]: Stack ${stackId} has no assets, returning empty result`);
      return {
        stackId,
        aggregatedTags: {},
        topTags: [],
        assetCount: 0,
        skippedAssets: 0,
        processingTime: Date.now(),
      };
    }

    // Check AI server availability before clearing predictions
    let aiAvailable = false;
    try {
      await this.stacksAIClient.healthCheck();
      aiAvailable = true;
    } catch (e) {
      console.warn(
        'AutoTagService: AI server not available, will reuse existing predictions if any'
      );
    }

    if (aiAvailable) {
      console.log(`AutoTagService: Clearing existing predictions for stack ${stackId}...`);
      await this.prisma.autoTagPrediction.deleteMany({
        where: {
          asset: {
            stackId: stackId,
          },
        },
      });
      console.log(`AutoTagService: Cleared existing predictions for stack ${stackId}`);
    }

    const aggregatedTags: Record<string, number> = {};
    let processedAssets = 0;
    let skippedAssets = 0;

    for (const asset of stack.assets) {
      console.log(`AutoTagService: Processing asset ${asset.id} with file path: ${asset.file}`);
      try {
        // Check if prediction already exists
        let prediction = await this.prisma.autoTagPrediction.findFirst({
          where: {
            assetId: asset.id,
            threshold: { lte: threshold },
          },
          orderBy: { threshold: 'desc' },
        });

        // If no prediction exists, create one
        if (!prediction) {
          console.log(`Predicting tags for asset ${asset.id}`);
          const fileKey = asset.file; // e.g., "library/1/assets/ab/hash.jpg"

          console.log(`[]Asset ${asset.id}: File key="${fileKey}"`);

          if (aiAvailable) {
            try {
              // First try file_key route
              const result = await this.stacksAIClient.generateTags(fileKey, threshold);

              prediction = await this.prisma.autoTagPrediction.upsert({
                where: { assetId: asset.id },
                create: {
                  assetId: asset.id,
                  threshold,
                  tags: result.predicted_tags || [],
                  scores: result.scores,
                  tagCount: result.tag_count || result.predicted_tags?.length || 0,
                },
                update: {
                  threshold,
                  tags: result.predicted_tags || [],
                  scores: result.scores,
                  tagCount: result.tag_count || result.predicted_tags?.length || 0,
                },
              });
            } catch (fileKeyError: any) {
              console.warn(
                `Key-based tagging failed for asset ${asset.id}:`,
                fileKeyError?.message || fileKeyError
              );
              // Fallback: try absolute file path upload
              try {
                const base = process.env.FILES_STORAGE || './data';
                const fullPath = path.join(base, fileKey);
                const result = await this.stacksAIClient.generateTags(fullPath, threshold);

                prediction = await this.prisma.autoTagPrediction.upsert({
                  where: { assetId: asset.id },
                  create: {
                    assetId: asset.id,
                    threshold,
                    tags: result.predicted_tags || [],
                    scores: result.scores,
                    tagCount: result.tag_count || result.predicted_tags?.length || 0,
                  },
                  update: {
                    threshold,
                    tags: result.predicted_tags || [],
                    scores: result.scores,
                    tagCount: result.tag_count || result.predicted_tags?.length || 0,
                  },
                });
              } catch (fileUploadError: any) {
                const msg =
                  fileUploadError?.code === 'P2002'
                    ? `AutoTagPrediction already exists for asset ${asset.id}; treat as success.`
                    : `Skipping asset ${asset.id} (stack ${stackId}) due to file error:`;
                console.warn(msg, fileUploadError?.message || fileUploadError);
                console.warn(`Asset file key was: ${fileKey}`);
                skippedAssets++;
                continue;
              }
            }
          } else {
            console.warn(
              'AI server unavailable; skipping prediction for this asset and relying on existing predictions if any'
            );
            skippedAssets++;
            continue;
          }
        }

        // Aggregate tags
        const scores = prediction.scores as Record<string, number>;
        for (const [tag, score] of Object.entries(scores)) {
          if (score >= threshold) {
            aggregatedTags[tag] = (aggregatedTags[tag] || 0) + score;
          }
        }

        processedAssets++;
      } catch (error) {
        console.error(`Failed to process asset ${asset.id}:`, error);
        skippedAssets++;
      }
    }

    // Calculate average scores (using whatever predictions were available/created)
    const avgTags: Record<string, number> = {};
    for (const [tag, totalScore] of Object.entries(aggregatedTags)) {
      avgTags[tag] = totalScore / processedAssets;
    }

    // Get top tags
    const topTags = Object.entries(avgTags)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([tag, score]) => ({ tag, score }));

    // Save or update aggregate
    const _aggregate = await this.prisma.stackAutoTagAggregate.upsert({
      where: { stackId },
      create: {
        stackId,
        aggregatedTags: avgTags,
        topTags,
        assetCount: processedAssets,
        threshold,
      },
      update: {
        aggregatedTags: avgTags,
        topTags,
        assetCount: processedAssets,
        threshold,
        updatedAt: new Date(),
      },
    });

    return {
      stackId,
      aggregatedTags: avgTags,
      topTags,
      assetCount: processedAssets,
      skippedAssets,
      processingTime: Date.now(),
    };
  }

  async aggregateAllStackTags(threshold = 0.4, batchSize = 5) {
    const stacks = await this.prisma.stack.findMany({
      include: { assets: true },
    });

    const results = [];
    let processed = 0;

    for (let i = 0; i < stacks.length; i += batchSize) {
      const batch = stacks.slice(i, i + batchSize);

      const batchPromises = batch.map(async (stack) => {
        try {
          return await this.aggregateStackTags(stack.id, threshold);
        } catch (error) {
          console.error(`Failed to process stack ${stack.id}:`, error.message);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(Boolean));
      processed += batch.length;

      console.log(`Processed ${processed}/${stacks.length} stacks`);
    }

    return {
      totalStacks: stacks.length,
      processedStacks: results.length,
      threshold,
      batchSize,
      results,
    };
  }

  async aggregateDatasetTags(datasetId: number, threshold = 0.4, batchSize = 5) {
    // Clear existing predictions for this dataset to force re-processing
    console.log(`Clearing existing AutoTag predictions for dataset ${datasetId}...`);
    await this.prisma.autoTagPrediction.deleteMany({
      where: {
        asset: {
          stack: {
            dataSetId: datasetId,
          },
        },
      },
    });
    console.log(`Cleared existing predictions for dataset ${datasetId}`);

    const stacks = await this.prisma.stack.findMany({
      where: { dataSetId: datasetId },
      include: { assets: true },
    });

    const results = [];
    let processed = 0;

    for (let i = 0; i < stacks.length; i += batchSize) {
      const batch = stacks.slice(i, i + batchSize);

      const batchPromises = batch.map(async (stack) => {
        try {
          return await this.aggregateStackTags(stack.id, threshold);
        } catch (error) {
          console.error(`Failed to process stack ${stack.id}:`, error.message);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(Boolean));
      processed += batch.length;

      console.log(`Processed ${processed}/${stacks.length} stacks for dataset ${datasetId}`);
    }

    const totalAssets = results.reduce((sum, result) => sum + (result?.assetCount || 0), 0);
    const totalSkipped = results.reduce((sum, result) => sum + (result?.skippedAssets || 0), 0);

    return {
      datasetId,
      totalStacks: stacks.length,
      processedStacks: results.length,
      totalAssets,
      skippedAssets: totalSkipped,
      threshold,
      batchSize,
      results,
      message: `Successfully processed ${results.length} stacks (${totalAssets} assets, ${totalSkipped} skipped) in dataset ${datasetId}`,
    };
  }

  async findSimilarStacks(stackId: number, limit = 20, threshold = 0.1) {
    // Get the target stack's aggregated tags
    const targetAggregate = await this.prisma.stackAutoTagAggregate.findUnique({
      where: { stackId },
    });

    if (!targetAggregate) {
      throw new Error('Stack aggregate not found. Please run tag aggregation first.');
    }

    // Get all other aggregates
    const allAggregates = await this.prisma.stackAutoTagAggregate.findMany({
      where: {
        stackId: { not: stackId },
      },
      include: {
        stack: {
          include: {
            assets: {
              take: 1,
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    const targetTags = targetAggregate.aggregatedTags as Record<string, number>;
    const similarities: Array<WeightedJaccardSimilarity & { stack: any }> = [];

    for (const aggregate of allAggregates) {
      const compareTags = aggregate.aggregatedTags as Record<string, number>;
      const similarity = this.calculateWeightedJaccardSimilarity(targetTags, compareTags);

      if (similarity.similarity >= threshold) {
        const assets = withPublicAssetArray(
          aggregate.stack.assets as any[],
          aggregate.stack.dataSetId
        );
        const stackThumbnail = toPublicAssetPath(
          assets[0]?.thumbnail || aggregate.stack.thumbnail,
          aggregate.stack.dataSetId
        );

        similarities.push({
          ...similarity,
          stackId: aggregate.stackId,
          stack: {
            ...aggregate.stack,
            assets,
            thumbnail: stackThumbnail,
          },
        });
      }
    }

    // Sort by similarity and limit results
    const sortedSimilarities = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return {
      targetStackId: stackId,
      results: sortedSimilarities, // 'similarities' -> 'results' for client compatibility
      total: sortedSimilarities.length,
    };
  }

  /**
   * データセット全体の自動タグを再生成（キューに追加）
   */
  async regenerateDatasetAutoTags(
    datasetId: number,
    options: {
      threshold?: number;
      batchSize?: number;
      forceRegenerate?: boolean;
    } = {}
  ): Promise<number> {
    const { threshold = 0.4, batchSize = 5, forceRegenerate = false } = options;

    // データセット内のアセットを取得
    const whereCondition: any = {
      stack: {
        dataSetId: datasetId,
      },
      fileType: {
        in: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      },
    };

    // forceRegenerateがfalseの場合は、自動タグがないアセットのみ対象
    if (!forceRegenerate) {
      whereCondition.autoTagPrediction = {
        is: null,
      };
    }

    const assets = await this.prisma.asset.findMany({
      where: whereCondition,
      select: { id: true, stackId: true, file: true },
    });

    // forceRegenerateがtrueの場合、既存の予測を削除
    if (forceRegenerate && assets.length > 0) {
      await this.prisma.autoTagPrediction.deleteMany({
        where: {
          assetId: {
            in: assets.map((a) => a.id),
          },
        },
      });
    }

    // スタックごとにグループ化
    const stackAssets = new Map<number, typeof assets>();
    for (const asset of assets) {
      if (!stackAssets.has(asset.stackId)) {
        stackAssets.set(asset.stackId, []);
      }
      stackAssets.get(asset.stackId)!.push(asset);
    }

    // バッチ処理でスタックごとに自動タグを生成
    let processedCount = 0;
    const stackIds = Array.from(stackAssets.keys());

    for (let i = 0; i < stackIds.length; i += batchSize) {
      const batch = stackIds.slice(i, i + batchSize);

      const batchPromises = batch.map(async (stackId) => {
        try {
          await this.aggregateStackTags(stackId, threshold);
          processedCount += stackAssets.get(stackId)!.length;
        } catch (error) {
          console.error(`Failed to generate autotags for stack ${stackId}:`, error);
        }
      });

      await Promise.all(batchPromises);
      console.log(
        `Processed ${i + batch.length}/${stackIds.length} stacks for dataset ${datasetId}`
      );
    }

    return processedCount;
  }

  private calculateWeightedJaccardSimilarity(
    tagsA: Record<string, number>,
    tagsB: Record<string, number>
  ): { similarity: number; commonTags: string[] } {
    const allTags = new Set([...Object.keys(tagsA), ...Object.keys(tagsB)]);

    let numerator = 0;
    let denominator = 0;
    const commonTags: string[] = [];

    for (const tag of allTags) {
      const scoreA = tagsA[tag] || 0;
      const scoreB = tagsB[tag] || 0;

      numerator += Math.min(scoreA, scoreB);
      denominator += Math.max(scoreA, scoreB);

      if (scoreA > 0 && scoreB > 0) {
        commonTags.push(tag);
      }
    }

    const similarity = denominator > 0 ? numerator / denominator : 0;

    return {
      similarity,
      commonTags: commonTags.sort(),
    };
  }
}
