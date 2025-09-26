// Dataset types
export interface Dataset {
  id: string;
  name: string;
  icon?: string; // 絵文字またはアイコン
  description?: string;
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
  themeColor?: string;
  isProtected?: boolean;
  authorized?: boolean;
  isDefault?: boolean;
}

// Media types
export type MediaType = 'image' | 'comic' | 'video';

// Color types
export interface DominantColor {
  r: number;
  g: number;
  b: number;
  hex: string;
  percentage: number;
  // 色相・トーン情報
  hue: number; // 色相 (0-360)
  saturation: number; // 彩度 (0-100) - 淡い〜ビビッド
  lightness: number; // 明度 (0-100) - 暗い〜明るい
  hueCategory: string; // 色相カテゴリ ('red', 'orange', 'yellow', etc.)
}

// Color filter types
export interface ColorFilter {
  hueCategories?: string[];
  tonePoint?: { saturation: number; lightness: number };
  toneTolerance?: number;
  similarityThreshold?: number; // 0-100 (選択した色相に対する類似度のパーセンテージ)
  customColor?: string; // カスタムカラー (hex形式)
}

export type HueCategory =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'violet'
  | 'gray';

// Stack types
export interface Stack {
  id: string | number;
  datasetId: string;
  name: string;
  mediaType: MediaType;
  thumbnailUrl?: string;
  thumbnail?: string; // Legacy support
  assetCount: number;
  createdAt: string;
  updatedAt: string;
  tags?: Tag[] | string[]; // Can be either Tag objects or strings
  author?: string | Author; // Can be string or Author object
  isFavorite?: boolean;
  favorited?: boolean; // Legacy support
  likeCount?: number;
  liked?: number; // Legacy support
  isLiked?: boolean;
  assets: Asset[]; // Stack contains assets
  dominantColors?: DominantColor[]; // 代表色
  autoTags?: AutoTag[]; // AI生成タグ
  hasEmbedding?: boolean; // 埋め込みが生成されているかどうか
}

// AutoTag type
export interface AutoTag {
  autoTagKey: string;
  displayName: string;
  mappedTag?: {
    id: number;
    title: string;
  };
  score?: number;
}

// Asset types
export interface Asset {
  id: string | number;
  stackId: string | number;
  file: string; // Full file path
  url?: string; // Alternative to file
  thumbnail?: string; // Thumbnail path
  thumbnailUrl?: string; // Alternative to thumbnail
  preview?: string | null; // プレイバック用プレビュー
  width?: number;
  height?: number;
  size?: number;
  mimeType?: string;
  orderInStack?: number;
  meta?: {
    markers?: VideoMarker[];
  };
  createdAt?: string;
}

// Video marker types
export interface VideoMarker {
  time: number;
  color: string;
  label?: string;
  type?: 'ghost' | 'scene' | 'finish';
}

// Author types
export interface Author {
  id: string | number;
  name: string;
  count?: number;
}

// Tag types
export interface Tag {
  id: string;
  name: string;
  displayName?: string;
  count: number;
  isAutoTag?: boolean;
}

// Collection types
// コレクションのタイプ
// 互換性のため 'SCRATCH' を追加（サーバが未対応でもクライアント側は受理可能）
export type CollectionType = 'SMART' | 'MANUAL' | 'SCRATCH';

export interface Collection {
  id: number;
  name: string;
  icon: string;
  description?: string;
  type: CollectionType;
  dataSetId: number;
  folderId?: number; // 所属するフォルダID（ルートの場合はnull）
  createdAt: string;
  updatedAt: string;
  filterConfig?: Record<string, any>;
  // kind はクライアント側の便宜的な識別（サーバは filterConfig.kind を返す想定）。
  // 'scratch' の場合は一時収集用の特別なコレクションとして扱う。
  kind?: 'collection' | 'scratch';
  dataSet?: {
    id: number;
    name: string;
    icon?: string;
  };
  folder?: CollectionFolder; // 所属するフォルダ
  _count?: {
    collectionStacks: number;
  };
}

// Collection Folder types
export interface CollectionFolder {
  id: number;
  name: string;
  icon: string;
  description?: string;
  dataSetId: number;
  parentId?: number; // 親フォルダID（ルートの場合はnull）
  order: number; // 同じ階層での並び順
  createdAt: string;
  updatedAt: string;
  dataSet?: {
    id: number;
    name: string;
    icon?: string;
  };
  parent?: CollectionFolder; // 親フォルダ
  children?: CollectionFolder[]; // 子フォルダ
  collections?: Collection[]; // フォルダ内のコレクション
  _count?: {
    children: number;
    collections: number;
  };
}

// Folder tree structure for UI display
export interface FolderTreeNode {
  type: 'folder' | 'collection';
  id: number;
  name: string;
  icon: string;
  description?: string;
  isExpanded?: boolean; // UI state for folder expansion
  level: number; // Nesting level for indentation
  children?: FolderTreeNode[]; // For folders only
  collection?: Collection; // For collection type
  folder?: CollectionFolder; // For folder type
  _count?: {
    children?: number;
    collections?: number;
    collectionStacks?: number;
  };
}

// Navigation Pin types (for header navigation)
export type PinType = 'COLLECTION' | 'MEDIA_TYPE' | 'OVERVIEW' | 'FAVORITES' | 'LIKES';

export type ImportUrlStatus = 'created' | 'added' | 'skipped' | 'error';

export interface ImportUrlResult {
  url: string;
  status: ImportUrlStatus;
  stackId?: number;
  assetId?: number;
  message?: string;
}

export interface Pin {
  id: number;
  type: PinType;
  dataSetId: number; // Database field name from NavigationPin model
  userId?: number;
  name: string;
  icon: string; // Lucide icon name
  order: number; // Display order in header
  createdAt: string;
  updatedAt: string;
  // References
  collectionId?: number; // For COLLECTION type
  mediaType?: MediaType; // For MEDIA_TYPE type
  // Relations (populated when fetched)
  collection?: Collection;
}

// Available icons for pins and collections (curated list of useful Lucide icons)
export const AVAILABLE_ICONS = [
  'BookText',
  'Image',
  'Film',
  'BookOpen',
  'Folder',
  'Star',
  'Heart',
  'Tag',
  'Grid',
  'List',
  'Calendar',
  'Clock',
  'Archive',
  'Bookmark',
  'Camera',
  'Music',
  'Video',
  'FileText',
  'Newspaper',
  'Award',
  'Trophy',
  'Target',
  'Flag',
  'Map',
  'Compass',
  'Search',
  'Filter',
  'Settings',
  'Users',
  'User',
  'Crown',
  'Zap',
  'Flame',
  'Sun',
  'Moon',
  'Palette',
  'Brush',
  'Pen',
  'Pencil',
  'Eye',
  'Lock',
  'Key',
  'Shield',
  'Diamond',
  'Gem',
] as const;

export type AvailableIcon = (typeof AVAILABLE_ICONS)[number];

// API Response types
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

// Server-specific Stack response (temporary until we standardize)
export interface StackPaginatedResponse {
  stacks: Stack[];
  total: number;
  offset: number;
  limit: number;
}

// Filter and Sort types
export interface StackFilter {
  datasetId?: string;
  collectionId?: string;
  mediaType?: MediaType;
  tags?: string[];
  authors?: string[];
  isFavorite?: boolean;
  isLiked?: boolean;
  search?: string;
  colorFilter?: ColorFilter;
  hasNoTags?: boolean;
  hasNoAuthor?: boolean;
}

export type SortField =
  | 'recommended'
  | 'likeCount'
  | 'createdAt'
  | 'updatedAt'
  | 'name'
  | 'updateAt'
  | 'liked'
  | 'favorited'
  | 'assetCount';
export type SortOrder = 'asc' | 'desc';

export interface SortOption {
  field: SortField;
  order: SortOrder;
}

// MediaGrid component types
export interface MediaGridItem {
  id: string | number;
  name: string;
  thumbnail?: string;
  thumbnailUrl?: string;
  favorited?: boolean;
  isFavorite?: boolean;
  [key: string]: unknown;
}
