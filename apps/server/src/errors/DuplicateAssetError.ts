export type DuplicateScope = 'same-stack' | 'dataset';

export class DuplicateAssetError extends Error {
  code = 'DUPLICATE_ASSET' as const;
  details?: { assetId: number; stackId: number; scope: DuplicateScope };

  constructor(message: string, details?: { assetId: number; stackId: number; scope: DuplicateScope }) {
    super(message);
    this.name = 'DuplicateAssetError';
    this.details = details;
  }
}

