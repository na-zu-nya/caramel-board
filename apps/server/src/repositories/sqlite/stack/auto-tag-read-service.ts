import type { DatabaseSync } from 'node:sqlite';
import { parseJsonArray, placeholders, toAutoTagEntry } from './helpers';
import type { AutoTagAggregateRow, AutoTagEntry, AutoTagMappingDisplayRow } from './types';

export class StackAutoTagReadService {
  constructor(private db: DatabaseSync) {}

  getAutoTagsByStackId(stackId: number, dataSetId: number) {
    const aggregate = this.db
      .prepare('SELECT top_tags_json FROM stack_auto_tag_aggregates WHERE stack_id = ?')
      .get(stackId) as AutoTagAggregateRow | undefined;
    const entries = parseJsonArray(aggregate?.top_tags_json)
      .map(toAutoTagEntry)
      .filter((entry): entry is AutoTagEntry => entry !== null);
    if (entries.length === 0) return [];

    const keys = entries.map((entry) => entry.tag).filter((tag) => tag.length > 0);
    const rows =
      keys.length > 0
        ? (this.db
            .prepare(
              `SELECT m.auto_tag_key, m.display_name, m.tag_id, t.title AS tag_title
               FROM auto_tag_mappings m
               LEFT JOIN tags t ON t.id = m.tag_id
               WHERE m.dataset_id = ?
                 AND m.is_active = 1
                 AND m.auto_tag_key IN (${placeholders(keys)})`
            )
            .all(dataSetId, ...keys) as AutoTagMappingDisplayRow[])
        : [];
    const mappingMap = new Map(rows.map((mapping) => [mapping.auto_tag_key, mapping]));

    return entries.map((entry) => {
      const mapping = mappingMap.get(entry.tag);
      return {
        autoTagKey: entry.tag,
        displayName: mapping?.display_name ?? entry.tag,
        mappedTag:
          mapping?.tag_id && mapping.tag_title
            ? { id: mapping.tag_id, title: mapping.tag_title }
            : null,
        score: entry.score,
      };
    });
  }
}
