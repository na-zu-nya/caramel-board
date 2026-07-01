import { describe, expect, it } from 'vitest';
import { getStackFilterKey } from '@/lib/stack-filter';
import type { StackFilter } from '@/types';

describe('stack filter key', () => {
  it('normalizes array values deterministically', () => {
    expect(getStackFilterKey({ tags: ['z', 'a'] })).toBe(getStackFilterKey({ tags: ['a', 'z'] }));
  });

  it('accepts single string values from runtime search params', () => {
    const runtimeFilter = { tags: 'reference' } as unknown as StackFilter;

    expect(getStackFilterKey(runtimeFilter)).toBe(getStackFilterKey({ tags: ['reference'] }));
  });

  it('ignores non-string runtime values instead of spreading them', () => {
    const runtimeFilter = {
      tags: [null, 'reference'],
      authors: { name: 'invalid' },
    } as unknown as StackFilter;

    expect(() => getStackFilterKey(runtimeFilter)).not.toThrow();
    expect(getStackFilterKey(runtimeFilter)).toBe(getStackFilterKey({ tags: ['reference'] }));
  });
});
