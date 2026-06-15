PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS datasets (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  icon TEXT,
  theme_color TEXT,
  description TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  is_protected INTEGER NOT NULL DEFAULT 0 CHECK (is_protected IN (0, 1)),
  password_hash TEXT,
  password_salt TEXT,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_datasets_default
  ON datasets(is_default)
  WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT COLLATE NOCASE UNIQUE,
  role TEXT NOT NULL DEFAULT 'super',
  password_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS authors (
  id INTEGER PRIMARY KEY,
  dataset_id INTEGER NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  UNIQUE (name, dataset_id)
);

CREATE INDEX IF NOT EXISTS idx_authors_dataset ON authors(dataset_id);

CREATE TABLE IF NOT EXISTS stacks (
  id INTEGER PRIMARY KEY,
  dataset_id INTEGER NOT NULL,
  author_id INTEGER,
  name TEXT NOT NULL COLLATE NOCASE,
  thumbnail TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'comic', 'video')),
  liked INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT,
  dominant_colors_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_stacks_dataset_created ON stacks(dataset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stacks_dataset_media_type ON stacks(dataset_id, media_type);
CREATE INDEX IF NOT EXISTS idx_stacks_author ON stacks(author_id);
CREATE INDEX IF NOT EXISTS idx_stacks_liked ON stacks(liked DESC);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY,
  stack_id INTEGER NOT NULL,
  file TEXT NOT NULL UNIQUE,
  thumbnail TEXT NOT NULL,
  preview TEXT,
  file_type TEXT NOT NULL,
  original_name TEXT NOT NULL,
  hash TEXT NOT NULL,
  order_in_stack INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT,
  dominant_colors_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (stack_id) REFERENCES stacks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assets_stack_order ON assets(stack_id, order_in_stack, id);
CREATE INDEX IF NOT EXISTS idx_assets_hash ON assets(hash);
CREATE INDEX IF NOT EXISTS idx_assets_created ON assets(created_at DESC);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY,
  dataset_id INTEGER NOT NULL,
  title TEXT NOT NULL COLLATE NOCASE,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  UNIQUE (title, dataset_id)
);

CREATE INDEX IF NOT EXISTS idx_tags_dataset ON tags(dataset_id);

CREATE TABLE IF NOT EXISTS stack_tags (
  stack_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (stack_id, tag_id),
  FOREIGN KEY (stack_id) REFERENCES stacks(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stack_tags_tag ON stack_tags(tag_id);

CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY,
  dataset_id INTEGER NOT NULL,
  folder_id INTEGER,
  name TEXT NOT NULL COLLATE NOCASE,
  icon TEXT NOT NULL DEFAULT '📂',
  description TEXT,
  type TEXT NOT NULL DEFAULT 'MANUAL' CHECK (type IN ('SMART', 'MANUAL', 'SCRATCH')),
  filter_config_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES collection_folders(id) ON DELETE SET NULL,
  UNIQUE (name, dataset_id)
);

CREATE INDEX IF NOT EXISTS idx_collections_dataset ON collections(dataset_id);
CREATE INDEX IF NOT EXISTS idx_collections_folder ON collections(folder_id);
CREATE INDEX IF NOT EXISTS idx_collections_type ON collections(type);

CREATE TABLE IF NOT EXISTS collection_folders (
  id INTEGER PRIMARY KEY,
  dataset_id INTEGER NOT NULL,
  parent_id INTEGER,
  name TEXT NOT NULL COLLATE NOCASE,
  icon TEXT NOT NULL DEFAULT '📁',
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES collection_folders(id) ON DELETE CASCADE,
  UNIQUE (name, dataset_id, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_folders_dataset ON collection_folders(dataset_id);
CREATE INDEX IF NOT EXISTS idx_collection_folders_parent ON collection_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_collection_folders_order ON collection_folders(sort_order);

CREATE TABLE IF NOT EXISTS collection_stacks (
  collection_id INTEGER NOT NULL,
  stack_id INTEGER NOT NULL,
  added_at TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, stack_id),
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (stack_id) REFERENCES stacks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_collection_stacks_stack ON collection_stacks(stack_id);
CREATE INDEX IF NOT EXISTS idx_collection_stacks_order ON collection_stacks(collection_id, order_index);

CREATE TABLE IF NOT EXISTS stack_favorites (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  stack_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (stack_id) REFERENCES stacks(id) ON DELETE CASCADE,
  UNIQUE (user_id, stack_id)
);

CREATE INDEX IF NOT EXISTS idx_stack_favorites_stack ON stack_favorites(stack_id);

CREATE TABLE IF NOT EXISTS asset_favorites (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  asset_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  UNIQUE (user_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_asset_favorites_asset ON asset_favorites(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_favorites_created ON asset_favorites(created_at DESC);

CREATE TABLE IF NOT EXISTS like_activities (
  id INTEGER PRIMARY KEY,
  stack_id INTEGER NOT NULL,
  asset_id INTEGER,
  user_id INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (stack_id) REFERENCES stacks(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_like_activities_stack ON like_activities(stack_id);
CREATE INDEX IF NOT EXISTS idx_like_activities_asset ON like_activities(asset_id);
CREATE INDEX IF NOT EXISTS idx_like_activities_user ON like_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_like_activities_created ON like_activities(created_at DESC);

CREATE TABLE IF NOT EXISTS navigation_pins (
  id INTEGER PRIMARY KEY,
  dataset_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  collection_id INTEGER,
  type TEXT NOT NULL CHECK (type IN ('COLLECTION', 'MEDIA_TYPE', 'OVERVIEW', 'FAVORITES', 'LIKES')),
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  media_type TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  UNIQUE (user_id, type, dataset_id, collection_id, media_type)
);

CREATE INDEX IF NOT EXISTS idx_navigation_pins_dataset ON navigation_pins(dataset_id);
CREATE INDEX IF NOT EXISTS idx_navigation_pins_user_order ON navigation_pins(user_id, sort_order);

CREATE TABLE IF NOT EXISTS auto_tag_mappings (
  id INTEGER PRIMARY KEY,
  dataset_id INTEGER NOT NULL,
  tag_id INTEGER,
  auto_tag_key TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL COLLATE NOCASE,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  is_stop INTEGER NOT NULL DEFAULT 0 CHECK (is_stop IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE SET NULL,
  UNIQUE (auto_tag_key, dataset_id)
);

CREATE INDEX IF NOT EXISTS idx_auto_tag_mappings_dataset ON auto_tag_mappings(dataset_id);
CREATE INDEX IF NOT EXISTS idx_auto_tag_mappings_tag ON auto_tag_mappings(tag_id);
CREATE INDEX IF NOT EXISTS idx_auto_tag_mappings_active ON auto_tag_mappings(is_active);

CREATE TABLE IF NOT EXISTS auto_tag_predictions (
  id INTEGER PRIMARY KEY,
  asset_id INTEGER NOT NULL UNIQUE,
  tags_json TEXT NOT NULL,
  scores_json TEXT NOT NULL,
  threshold REAL NOT NULL DEFAULT 0.4,
  tag_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auto_tag_predictions_created ON auto_tag_predictions(created_at DESC);

CREATE TABLE IF NOT EXISTS auto_tag_prediction_scores (
  prediction_id INTEGER NOT NULL,
  asset_id INTEGER NOT NULL,
  tag_key TEXT NOT NULL COLLATE NOCASE,
  score REAL NOT NULL,
  rank INTEGER NOT NULL,
  PRIMARY KEY (prediction_id, tag_key),
  FOREIGN KEY (prediction_id) REFERENCES auto_tag_predictions(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auto_tag_prediction_scores_tag_score
  ON auto_tag_prediction_scores(tag_key, score DESC);
CREATE INDEX IF NOT EXISTS idx_auto_tag_prediction_scores_asset
  ON auto_tag_prediction_scores(asset_id, score DESC);

CREATE TABLE IF NOT EXISTS stack_auto_tag_aggregates (
  id INTEGER PRIMARY KEY,
  stack_id INTEGER NOT NULL UNIQUE,
  aggregated_tags_json TEXT NOT NULL,
  top_tags_json TEXT NOT NULL,
  asset_count INTEGER NOT NULL,
  threshold REAL NOT NULL DEFAULT 0.4,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (stack_id) REFERENCES stacks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stack_auto_tag_aggregates_created
  ON stack_auto_tag_aggregates(created_at DESC);

CREATE TABLE IF NOT EXISTS stack_auto_tag_scores (
  aggregate_id INTEGER NOT NULL,
  stack_id INTEGER NOT NULL,
  tag_key TEXT NOT NULL COLLATE NOCASE,
  score REAL NOT NULL,
  rank INTEGER NOT NULL,
  asset_count INTEGER NOT NULL,
  threshold REAL NOT NULL,
  PRIMARY KEY (aggregate_id, tag_key),
  FOREIGN KEY (aggregate_id) REFERENCES stack_auto_tag_aggregates(id) ON DELETE CASCADE,
  FOREIGN KEY (stack_id) REFERENCES stacks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stack_auto_tag_scores_tag_score
  ON stack_auto_tag_scores(tag_key, score DESC);
CREATE INDEX IF NOT EXISTS idx_stack_auto_tag_scores_stack
  ON stack_auto_tag_scores(stack_id, score DESC);

CREATE TABLE IF NOT EXISTS stack_colors (
  id INTEGER PRIMARY KEY,
  stack_id INTEGER NOT NULL,
  r INTEGER NOT NULL,
  g INTEGER NOT NULL,
  b INTEGER NOT NULL,
  hex TEXT NOT NULL COLLATE NOCASE,
  percentage REAL NOT NULL,
  hue INTEGER NOT NULL,
  saturation INTEGER NOT NULL,
  lightness INTEGER NOT NULL,
  hue_category TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (stack_id) REFERENCES stacks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stack_colors_stack ON stack_colors(stack_id);
CREATE INDEX IF NOT EXISTS idx_stack_colors_hue_category ON stack_colors(hue_category);
CREATE INDEX IF NOT EXISTS idx_stack_colors_hue ON stack_colors(hue);
CREATE INDEX IF NOT EXISTS idx_stack_colors_tone ON stack_colors(saturation, lightness);
CREATE INDEX IF NOT EXISTS idx_stack_colors_hex ON stack_colors(hex);

CREATE TABLE IF NOT EXISTS asset_colors (
  id INTEGER PRIMARY KEY,
  asset_id INTEGER NOT NULL,
  r INTEGER NOT NULL,
  g INTEGER NOT NULL,
  b INTEGER NOT NULL,
  hex TEXT NOT NULL COLLATE NOCASE,
  percentage REAL NOT NULL,
  hue INTEGER NOT NULL,
  saturation INTEGER NOT NULL,
  lightness INTEGER NOT NULL,
  hue_category TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_asset_colors_asset ON asset_colors(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_colors_hue_category ON asset_colors(hue_category);
CREATE INDEX IF NOT EXISTS idx_asset_colors_hue ON asset_colors(hue);
CREATE INDEX IF NOT EXISTS idx_asset_colors_tone ON asset_colors(saturation, lightness);
CREATE INDEX IF NOT EXISTS idx_asset_colors_hex ON asset_colors(hex);
