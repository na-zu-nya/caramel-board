import type { DatabaseSync } from 'node:sqlite';
import {
  clamp01,
  DEFAULT_AUTO_STOP_TAGS,
  normalizeTag,
  placeholders,
  SIMILAR_CONFIG,
} from './helpers';
import type {
  AutoTagScoreRow,
  CountRow,
  DocumentFrequencyRow,
  ManualTagRow,
  SimilarVectors,
} from './types';

type StackResolver<TStack> = (id: number, dataSetId: number) => TStack | null;

export class StackSimilarService {
  constructor(private db: DatabaseSync) {}

  getSimilarByStackIds<TStack>(
    dataSetId: number,
    sourceStackIds: number[],
    options: { limit: number; offset: number; threshold?: number },
    resolveStack: StackResolver<TStack>
  ) {
    const sourceIds = Array.from(new Set(sourceStackIds)).filter((id) => Number.isFinite(id));
    if (sourceIds.length === 0) {
      return { stacks: [], total: 0, limit: options.limit, offset: options.offset };
    }

    const verifiedSourceIds = this.getExistingStackIds(dataSetId, sourceIds);
    if (verifiedSourceIds.length === 0) {
      return { stacks: [], total: 0, limit: options.limit, offset: options.offset };
    }

    const stopTags = new Set(DEFAULT_AUTO_STOP_TAGS.map(normalizeTag));
    const reference = this.buildSimilarReference(dataSetId, verifiedSourceIds, stopTags);
    const similarIds = this.runSimilarSearch(dataSetId, reference, verifiedSourceIds, stopTags, {
      threshold: options.threshold,
    });
    const pagedIds = similarIds.slice(options.offset, options.offset + options.limit);

    return {
      stacks: pagedIds
        .map((id) => resolveStack(id, dataSetId))
        .filter((stack): stack is TStack => stack !== null),
      total: similarIds.length,
      limit: options.limit,
      offset: options.offset,
    };
  }

  private getExistingStackIds(dataSetId: number, stackIds: number[]) {
    if (stackIds.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT id
         FROM stacks
         WHERE dataset_id = ?
           AND id IN (${placeholders(stackIds)})`
      )
      .all(dataSetId, ...stackIds) as Array<{ id: number }>;
    const existing = new Set(rows.map((row) => row.id));
    return stackIds.filter((id) => existing.has(id));
  }

  private getAutoTagVectors(dataSetId: number, stackIds: number[], stopTags: Set<string>) {
    if (stackIds.length === 0) return new Map<number, Map<string, number>>();
    const rows = this.db
      .prepare(
        `SELECT scores.stack_id, lower(scores.tag_key) AS tag_key, scores.score
         FROM stack_auto_tag_scores scores
         JOIN stacks s ON s.id = scores.stack_id
         WHERE s.dataset_id = ?
           AND scores.stack_id IN (${placeholders(stackIds)})
           AND scores.score >= ?
         ORDER BY scores.stack_id ASC, scores.score DESC, scores.rank ASC`
      )
      .all(dataSetId, ...stackIds, SIMILAR_CONFIG.autoMinScore) as AutoTagScoreRow[];

    const vectors = new Map<number, Map<string, number>>();
    for (const row of rows) {
      const tag = normalizeTag(row.tag_key);
      if (!tag || stopTags.has(tag)) continue;
      const vector = vectors.get(row.stack_id) ?? new Map<string, number>();
      if (vector.size >= SIMILAR_CONFIG.autoTopN || vector.has(tag)) {
        vectors.set(row.stack_id, vector);
        continue;
      }
      vector.set(tag, row.score);
      vectors.set(row.stack_id, vector);
    }
    return vectors;
  }

  private getManualTagSets(dataSetId: number, stackIds: number[], stopTags: Set<string>) {
    if (stackIds.length === 0) return new Map<number, Set<string>>();
    const rows = this.db
      .prepare(
        `SELECT st.stack_id, t.title
         FROM stack_tags st
         JOIN tags t ON t.id = st.tag_id
         JOIN stacks s ON s.id = st.stack_id
         WHERE s.dataset_id = ?
           AND st.stack_id IN (${placeholders(stackIds)})
         ORDER BY st.stack_id ASC, t.title ASC`
      )
      .all(dataSetId, ...stackIds) as ManualTagRow[];

    const sets = new Map<number, Set<string>>();
    for (const row of rows) {
      const tag = normalizeTag(row.title);
      if (!tag || stopTags.has(tag)) continue;
      const set = sets.get(row.stack_id) ?? new Set<string>();
      if (set.size < SIMILAR_CONFIG.manualTopN) set.add(tag);
      sets.set(row.stack_id, set);
    }
    return sets;
  }

  private buildSimilarReference(
    dataSetId: number,
    stackIds: number[],
    stopTags: Set<string>
  ): SimilarVectors {
    const autoVectors = this.getAutoTagVectors(dataSetId, stackIds, stopTags);
    const manualSets = this.getManualTagSets(dataSetId, stackIds, stopTags);
    const autoScores = new Map<string, number>();

    for (const vector of autoVectors.values()) {
      for (const [tag, score] of vector) {
        autoScores.set(tag, (autoScores.get(tag) ?? 0) + score);
      }
    }

    const sourceCount = Math.max(stackIds.length, 1);
    const auto = new Map(
      Array.from(autoScores.entries())
        .map(([tag, score]) => [tag, Math.min(1, score / sourceCount)] as const)
        .filter(([, score]) => score > 0)
        .sort((left, right) => right[1] - left[1])
        .slice(0, SIMILAR_CONFIG.autoTopN)
    );

    const manualCounts = new Map<string, number>();
    for (const stackId of stackIds) {
      const tags = manualSets.get(stackId);
      if (!tags) continue;
      for (const tag of tags) {
        manualCounts.set(tag, (manualCounts.get(tag) ?? 0) + 1);
      }
    }

    const manual = new Set(
      Array.from(manualCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, SIMILAR_CONFIG.manualTopN)
        .map(([tag]) => tag)
    );

    return { auto, manual };
  }

  private getAutoCandidateIds(dataSetId: number, autoTags: string[], excludedStackIds: number[]) {
    if (autoTags.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT DISTINCT scores.stack_id AS id
         FROM stack_auto_tag_scores scores
         JOIN stacks s ON s.id = scores.stack_id
         WHERE s.dataset_id = ?
           AND scores.score >= ?
           AND lower(scores.tag_key) IN (${placeholders(autoTags)})
           AND scores.stack_id NOT IN (${placeholders(excludedStackIds)})
         LIMIT ?`
      )
      .all(
        dataSetId,
        SIMILAR_CONFIG.autoMinScore,
        ...autoTags,
        ...excludedStackIds,
        SIMILAR_CONFIG.candidateLimit
      ) as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

  private getManualCandidateIds(dataSetId: number, tags: string[], excludedStackIds: number[]) {
    if (tags.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT DISTINCT st.stack_id AS id
         FROM stack_tags st
         JOIN tags t ON t.id = st.tag_id
         JOIN stacks s ON s.id = st.stack_id
         WHERE s.dataset_id = ?
           AND lower(t.title) IN (${placeholders(tags)})
           AND st.stack_id NOT IN (${placeholders(excludedStackIds)})
         LIMIT ?`
      )
      .all(dataSetId, ...tags, ...excludedStackIds, SIMILAR_CONFIG.candidateLimit) as Array<{
      id: number;
    }>;
    return rows.map((row) => row.id);
  }

  private getDatasetStackCount(dataSetId: number) {
    return (
      (
        this.db
          .prepare('SELECT COUNT(*) AS count FROM stacks WHERE dataset_id = ?')
          .get(dataSetId) as CountRow | undefined
      )?.count ?? 0
    );
  }

  private getAutoDocumentFrequency(dataSetId: number, tags: string[]) {
    if (tags.length === 0) return new Map<string, number>();
    const rows = this.db
      .prepare(
        `SELECT lower(scores.tag_key) AS tag_key, COUNT(DISTINCT scores.stack_id) AS count
         FROM stack_auto_tag_scores scores
         JOIN stacks s ON s.id = scores.stack_id
         WHERE s.dataset_id = ?
           AND scores.score >= ?
           AND lower(scores.tag_key) IN (${placeholders(tags)})
         GROUP BY lower(scores.tag_key)`
      )
      .all(dataSetId, SIMILAR_CONFIG.autoMinScore, ...tags) as DocumentFrequencyRow[];
    return new Map(rows.map((row) => [row.tag_key, row.count]));
  }

  private getManualDocumentFrequency(dataSetId: number, tags: string[]) {
    if (tags.length === 0) return new Map<string, number>();
    const rows = this.db
      .prepare(
        `SELECT lower(t.title) AS tag_key, COUNT(DISTINCT st.stack_id) AS count
         FROM stack_tags st
         JOIN tags t ON t.id = st.tag_id
         JOIN stacks s ON s.id = st.stack_id
         WHERE s.dataset_id = ?
           AND lower(t.title) IN (${placeholders(tags)})
         GROUP BY lower(t.title)`
      )
      .all(dataSetId, ...tags) as DocumentFrequencyRow[];
    return new Map(rows.map((row) => [row.tag_key, row.count]));
  }

  private getSimilarIdfWeight(
    tag: string,
    hasManual: boolean,
    autoDf: Map<string, number>,
    manualDf: Map<string, number>,
    datasetSize: number
  ) {
    const df = autoDf.get(tag) || (hasManual ? (manualDf.get(tag) ?? 0) : 0);
    const base = Math.log((Math.max(datasetSize, 1) + 1) / (df + 1));
    const weight = Number.isFinite(base)
      ? Math.max(base, SIMILAR_CONFIG.minIdf)
      : SIMILAR_CONFIG.minIdf;
    return hasManual ? weight * SIMILAR_CONFIG.manualWeightMultiplierOnIdf : weight;
  }

  private runSimilarSearch(
    dataSetId: number,
    reference: SimilarVectors,
    excludedStackIds: number[],
    stopTags: Set<string>,
    options: { threshold?: number }
  ) {
    if (reference.auto.size === 0 && reference.manual.size === 0) return [];

    const autoProbe = Array.from(reference.auto.keys()).slice(0, SIMILAR_CONFIG.autoProbeCount);
    const manualProbe = Array.from(reference.manual);
    const candidateIds = Array.from(
      new Set([
        ...this.getAutoCandidateIds(dataSetId, autoProbe, excludedStackIds),
        ...this.getManualCandidateIds(dataSetId, manualProbe, excludedStackIds),
      ])
    );
    if (candidateIds.length === 0) return [];

    const autoVectors = this.getAutoTagVectors(dataSetId, candidateIds, stopTags);
    const manualSets = this.getManualTagSets(dataSetId, candidateIds, stopTags);
    const autoUniverse = new Set(reference.auto.keys());
    const manualUniverse = new Set(reference.manual);
    const candidates = candidateIds
      .map((stackId) => ({
        stackId,
        auto: autoVectors.get(stackId) ?? new Map<string, number>(),
        manual: manualSets.get(stackId) ?? new Set<string>(),
      }))
      .filter((candidate) => candidate.auto.size > 0 || candidate.manual.size > 0);

    for (const candidate of candidates) {
      for (const tag of candidate.auto.keys()) autoUniverse.add(tag);
      for (const tag of candidate.manual) manualUniverse.add(tag);
    }

    const datasetSize = this.getDatasetStackCount(dataSetId);
    const autoDf = this.getAutoDocumentFrequency(dataSetId, Array.from(autoUniverse));
    const manualDf = this.getManualDocumentFrequency(dataSetId, Array.from(manualUniverse));
    const scores = new Map<number, number>();

    for (const candidate of candidates) {
      const union = new Set([
        ...reference.auto.keys(),
        ...candidate.auto.keys(),
        ...reference.manual,
        ...candidate.manual,
      ]);
      let numerator = 0;
      let denominator = 0;

      for (const tag of union) {
        const refAutoVal = reference.auto.get(tag) ?? 0;
        const candAutoVal = candidate.auto.get(tag) ?? 0;
        const refManualVal = reference.manual.has(tag) ? 1 : 0;
        const candManualVal = candidate.manual.has(tag) ? 1 : 0;
        if (!refAutoVal && !candAutoVal && !refManualVal && !candManualVal) continue;

        const refValue =
          SIMILAR_CONFIG.autoWeight * refAutoVal + SIMILAR_CONFIG.manualWeight * refManualVal;
        const candValue =
          SIMILAR_CONFIG.autoWeight * candAutoVal + SIMILAR_CONFIG.manualWeight * candManualVal;
        if (!refValue && !candValue) continue;

        const weight = this.getSimilarIdfWeight(
          tag,
          Boolean(refManualVal || candManualVal),
          autoDf,
          manualDf,
          datasetSize
        );
        numerator += weight * Math.min(refValue, candValue);
        denominator += weight * Math.max(refValue, candValue);
      }

      const score = denominator > 0 ? numerator / denominator : 0;
      if (score > 0) scores.set(candidate.stackId, score);
    }

    const threshold = clamp01(options.threshold ?? 0);
    return Array.from(scores.entries())
      .filter(([, score]) => score >= threshold)
      .sort((left, right) => right[1] - left[1])
      .slice(0, SIMILAR_CONFIG.resultLimit)
      .map(([id]) => id);
  }
}
