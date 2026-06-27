-- title: Stack actual media type

ALTER TABLE stacks
  ADD COLUMN actual_media_type TEXT CHECK (actual_media_type IN ('image', 'video', 'multipleImages'));

CREATE INDEX IF NOT EXISTS idx_stacks_dataset_actual_media_type
  ON stacks(dataset_id, actual_media_type);

UPDATE stacks
SET actual_media_type = CASE
  WHEN EXISTS (
    SELECT 1
    FROM assets
    WHERE assets.stack_id = stacks.id
      AND (
        LOWER(assets.file_type) LIKE 'video/%'
        OR LOWER(LTRIM(assets.file_type, '.')) IN ('mp4', 'mov', 'avi', 'mkv', 'webm')
      )
  ) THEN 'video'
  WHEN (
    SELECT COUNT(*)
    FROM assets
    WHERE assets.stack_id = stacks.id
      AND (
        LOWER(assets.file_type) LIKE 'image/%'
        OR LOWER(LTRIM(assets.file_type, '.')) IN (
          'jpg',
          'jpeg',
          'png',
          'gif',
          'webp',
          'bmp',
          'avif',
          'heic',
          'heif',
          'svg',
          'svgz',
          'tif',
          'tiff'
        )
      )
  ) > 1
  AND NOT EXISTS (
    SELECT 1
    FROM assets
    WHERE assets.stack_id = stacks.id
      AND NOT (
        LOWER(assets.file_type) LIKE 'image/%'
        OR LOWER(LTRIM(assets.file_type, '.')) IN (
          'jpg',
          'jpeg',
          'png',
          'gif',
          'webp',
          'bmp',
          'avif',
          'heic',
          'heif',
          'svg',
          'svgz',
          'tif',
          'tiff'
        )
      )
  ) THEN 'multipleImages'
  WHEN (
    SELECT COUNT(*)
    FROM assets
    WHERE assets.stack_id = stacks.id
      AND (
        LOWER(assets.file_type) LIKE 'image/%'
        OR LOWER(LTRIM(assets.file_type, '.')) IN (
          'jpg',
          'jpeg',
          'png',
          'gif',
          'webp',
          'bmp',
          'avif',
          'heic',
          'heif',
          'svg',
          'svgz',
          'tif',
          'tiff'
        )
      )
  ) = 1
  AND (
    SELECT COUNT(*)
    FROM assets
    WHERE assets.stack_id = stacks.id
  ) = 1 THEN 'image'
  ELSE NULL
END;
