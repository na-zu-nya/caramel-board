-- title: Author links

CREATE TABLE IF NOT EXISTS author_links (
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL,
  provider TEXT,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  external_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_author_links_author ON author_links(author_id);
CREATE INDEX IF NOT EXISTS idx_author_links_provider_external_id
  ON author_links(provider, external_id);
