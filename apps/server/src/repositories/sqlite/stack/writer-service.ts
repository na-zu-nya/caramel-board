import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '../sqlite';

type StackResolver<TStack> = (id: number, dataSetId: number) => TStack | null;

export class StackWriterService {
  constructor(private db: DatabaseSync) {}

  updateStack<TStack>(
    stackId: number,
    dataSetId: number,
    data: {
      name?: string;
      thumbnail?: string;
      meta?: Record<string, unknown>;
      category?: 'image' | 'books' | 'video';
    },
    resolveStack: StackResolver<TStack>
  ) {
    if (!resolveStack(stackId, dataSetId)) return null;
    const updates: string[] = [];
    const params: Array<string | number> = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.thumbnail !== undefined) {
      updates.push('thumbnail = ?');
      params.push(data.thumbnail);
    }
    if (data.meta !== undefined) {
      updates.push('meta_json = ?');
      params.push(JSON.stringify(data.meta));
    }
    if (data.category !== undefined) {
      updates.push('category = ?');
      params.push(data.category);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(nowIso());
      this.db
        .prepare(`UPDATE stacks SET ${updates.join(', ')} WHERE id = ? AND dataset_id = ?`)
        .run(...params, stackId, dataSetId);
    }

    return resolveStack(stackId, dataSetId);
  }
}
