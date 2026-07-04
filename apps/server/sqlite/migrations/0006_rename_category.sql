-- title: Rename media type to category

-- Rebuild stacks: media_type -> category, 'comic' -> 'books', updated CHECK constraint.
-- Recreates the full stacks definition (0001_initial + 0003_stack_actual_media_type)
-- to keep every column, index, and foreign key intact. This migration must run with
-- foreign key enforcement disabled for its own transaction (handled by the migration
-- runner), since other tables hold foreign keys referencing stacks(id).
CREATE TABLE stacks_new (
  id INTEGER PRIMARY KEY,
  dataset_id INTEGER NOT NULL,
  author_id INTEGER,
  name TEXT NOT NULL COLLATE NOCASE,
  thumbnail TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'image' CHECK (category IN ('image', 'books', 'video')),
  actual_media_type TEXT CHECK (actual_media_type IN ('image', 'video', 'multipleImages')),
  liked INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT,
  dominant_colors_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE SET NULL
);

INSERT INTO stacks_new
  (id, dataset_id, author_id, name, thumbnail, category, actual_media_type, liked, meta_json, dominant_colors_json, created_at, updated_at)
SELECT
  id, dataset_id, author_id, name, thumbnail,
  CASE WHEN media_type = 'comic' THEN 'books' ELSE media_type END,
  actual_media_type, liked, meta_json, dominant_colors_json, created_at, updated_at
FROM stacks;

DROP TABLE stacks;
ALTER TABLE stacks_new RENAME TO stacks;

CREATE INDEX IF NOT EXISTS idx_stacks_dataset_created ON stacks(dataset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stacks_dataset_category ON stacks(dataset_id, category);
CREATE INDEX IF NOT EXISTS idx_stacks_dataset_actual_media_type
  ON stacks(dataset_id, actual_media_type);
CREATE INDEX IF NOT EXISTS idx_stacks_author ON stacks(author_id);
CREATE INDEX IF NOT EXISTS idx_stacks_liked ON stacks(liked DESC);

-- Rebuild navigation_pins: media_type -> category column (part of the UNIQUE constraint),
-- MEDIA_TYPE -> CATEGORY pin type, 'comic' -> 'books', and the 'Comics' pin name -> 'Books'.
CREATE TABLE navigation_pins_new (
  id INTEGER PRIMARY KEY,
  dataset_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  collection_id INTEGER,
  type TEXT NOT NULL CHECK (type IN ('COLLECTION', 'CATEGORY', 'OVERVIEW', 'FAVORITES', 'LIKES')),
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  category TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  UNIQUE (user_id, type, dataset_id, collection_id, category)
);

INSERT INTO navigation_pins_new
  (id, dataset_id, user_id, collection_id, type, name, icon, category, sort_order, created_at, updated_at)
SELECT
  id, dataset_id, user_id, collection_id,
  CASE WHEN type = 'MEDIA_TYPE' THEN 'CATEGORY' ELSE type END,
  CASE WHEN type = 'MEDIA_TYPE' AND name = 'Comics' THEN 'Books' ELSE name END,
  icon,
  CASE WHEN media_type = 'comic' THEN 'books' ELSE media_type END,
  sort_order, created_at, updated_at
FROM navigation_pins;

DROP TABLE navigation_pins;
ALTER TABLE navigation_pins_new RENAME TO navigation_pins;

CREATE INDEX IF NOT EXISTS idx_navigation_pins_dataset ON navigation_pins(dataset_id);
CREATE INDEX IF NOT EXISTS idx_navigation_pins_user_order ON navigation_pins(user_id, sort_order);

-- Smart collection filterConfig JSON: mediaCategory -> category key, 'comic' -> 'books' value.
UPDATE collections
SET filter_config_json = json_set(
  json_remove(filter_config_json, '$.mediaCategory'),
  '$.category',
  json_extract(filter_config_json, '$.mediaCategory')
)
WHERE filter_config_json IS NOT NULL
  AND json_valid(filter_config_json)
  AND json_extract(filter_config_json, '$.mediaCategory') IS NOT NULL;

UPDATE collections
SET filter_config_json = json_set(filter_config_json, '$.category', 'books')
WHERE filter_config_json IS NOT NULL
  AND json_valid(filter_config_json)
  AND json_extract(filter_config_json, '$.category') = 'comic';
