export type StackMediaCategory = 'image' | 'comic' | 'video';
export type StackMediaType = 'image' | 'video' | 'multipleImages';

export interface StandaloneStackListParams {
  dataSetId: number;
  collection?: number;
  mediaCategory?: StackMediaCategory;
  mediaTypes?: StackMediaType[];
  tag?: string | string[];
  author?: string | string[];
  fav?: '0' | '1';
  liked?: '0' | '1';
  hasNoTags?: boolean;
  hasNoAuthor?: boolean;
  search?: string;
  stackIds?: number[];
  sort?: 'recommended' | 'dateAdded' | 'name' | 'likes' | 'updated' | 'id';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export interface StackRow {
  id: number;
  dataset_id: number;
  author_id: number | null;
  author_name: string | null;
  name: string;
  thumbnail: string;
  media_type: string;
  actual_media_type: StackMediaType | null;
  liked: number;
  meta_json: string | null;
  dominant_colors_json: string | null;
  created_at: string;
  updated_at: string;
  asset_count: number;
  is_favorite: number;
}

export interface AuthorLinkRow {
  id: number;
  author_id: number;
  provider: string | null;
  label: string;
  url: string;
  external_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AssetRow {
  id: number;
  stack_id: number;
  file: string;
  thumbnail: string;
  preview: string | null;
  file_type: string;
  original_name: string;
  hash: string;
  width: number | null;
  height: number | null;
  order_in_stack: number;
  meta_json: string | null;
  dominant_colors_json: string | null;
  created_at: string;
  updated_at: string;
  is_favorite?: number;
}

export interface OriginalAssetRow {
  id: number;
  stack_id: number;
  file: string;
  file_type: string;
  original_name: string;
}

export interface AssetPreviewRow {
  id: number;
  file: string;
  file_type: string;
  hash: string;
  preview: string | null;
}

export interface AssetThumbnailRow {
  id: number;
  file: string;
  thumbnail: string;
  file_type: string;
  hash: string;
  width: number | null;
  height: number | null;
  order_in_stack: number;
}

export interface StackDatasetRow {
  id: number;
  dataset_id: number;
}

export interface StandaloneFileInput {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface AddAssetWithFileOptions {
  allowDuplicate?: boolean;
  storageHash?: string;
  meta?: Record<string, unknown>;
}

export interface CreateStackWithFileInput {
  dataSetId: number;
  name: string;
  mediaType: StackMediaCategory;
  author?: string;
  tags?: string[];
  file: StandaloneFileInput;
}

export interface DuplicateAssetRow {
  id: number;
  stack_id: number;
}

export interface TagRow {
  id: number;
  title: string;
}

export interface CountRow {
  count: number;
}

export interface AutoTagScoreRow {
  stack_id: number;
  tag_key: string;
  score: number;
}

export interface AutoTagAggregateRow {
  top_tags_json: string | null;
}

export interface AutoTagMappingDisplayRow {
  auto_tag_key: string;
  display_name: string;
  tag_id: number | null;
  tag_title: string | null;
}

export interface AutoTagEntry {
  tag: string;
  score?: number;
}

export interface ManualTagRow {
  stack_id: number;
  title: string;
}

export interface DocumentFrequencyRow {
  tag_key: string;
  count: number;
}

export interface SimilarVectors {
  auto: Map<string, number>;
  manual: Set<string>;
}
