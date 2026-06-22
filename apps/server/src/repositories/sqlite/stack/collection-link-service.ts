import type { DatabaseSync } from 'node:sqlite';

export class StackCollectionLinkService {
  constructor(private db: DatabaseSync) {}

  getCollectionIdsByStackId(stackId: number) {
    const rows = this.db
      .prepare(
        `SELECT collection_id
         FROM collection_stacks
         WHERE stack_id = ?
         ORDER BY collection_id ASC`
      )
      .all(stackId) as Array<{ collection_id: number }>;
    return { collectionIds: rows.map((row) => row.collection_id) };
  }
}
