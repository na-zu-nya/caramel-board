import { describe, expect, it } from 'vitest';
import { PaginatedFiltersParamSchema } from './search-schema';

describe('PaginatedFiltersParamSchema', () => {
  it('parses a valid filters JSON and applies defaults for omitted fields', () => {
    const full = PaginatedFiltersParamSchema.parse(
      JSON.stringify({
        imageSearch: {
          tags: [{ key: 'tag_a', score: 0.9 }],
          colors: [{ r: 255, g: 0, b: 0, hex: '#FF0000', percentage: 1 }],
          tagWeight: 0.5,
        },
      })
    );
    expect(full).toEqual({
      imageSearch: {
        tags: [{ key: 'tag_a', score: 0.9 }],
        colors: [{ r: 255, g: 0, b: 0, hex: '#FF0000', percentage: 1 }],
        tagWeight: 0.5,
        threshold: 0,
      },
    });

    const defaults = PaginatedFiltersParamSchema.parse(JSON.stringify({ imageSearch: {} }));
    expect(defaults).toEqual({
      imageSearch: { tags: [], colors: [], tagWeight: 0.65, threshold: 0 },
    });
  });

  it('returns undefined for broken JSON', () => {
    expect(PaginatedFiltersParamSchema.parse('{not json')).toBeUndefined();
  });

  it('returns undefined when the JSON has no imageSearch key', () => {
    expect(PaginatedFiltersParamSchema.parse(JSON.stringify({ other: true }))).toBeUndefined();
  });

  it('returns undefined when imageSearch violates the schema', () => {
    expect(
      PaginatedFiltersParamSchema.parse(JSON.stringify({ imageSearch: { tagWeight: 2 } }))
    ).toBeUndefined();
  });

  it('returns undefined when no value is provided', () => {
    expect(PaginatedFiltersParamSchema.parse(undefined)).toBeUndefined();
  });

  it('clamps a colorlip percentage above 1 instead of rejecting the whole filter', () => {
    const result = PaginatedFiltersParamSchema.parse(
      JSON.stringify({
        imageSearch: {
          colors: [{ r: 255, g: 0, b: 0, hex: '#FF0000', percentage: 1.2 }],
        },
      })
    );
    expect(result?.imageSearch.colors[0].percentage).toEqual(1);
  });
});
