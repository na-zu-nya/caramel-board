-- title: Add maintenance task runs

CREATE TABLE IF NOT EXISTS maintenance_task_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL,
  total INTEGER,
  processed INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_maintenance_task_runs_task ON maintenance_task_runs(task_id, started_at);
