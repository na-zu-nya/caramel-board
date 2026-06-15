# スタンドアロン移行設計メモ

このメモは、現行の PostgreSQL 版 CaramelBoard から、スタンドアロン / SQLite 版へ移るための移行仕様です。

## 目的

- PostgreSQL 依存を新アプリへ持ち込まない。
- 旧DBは一方向 export の対象として扱い、以後の更新前提にしない。
- SQLite では検索・自動タグ・色検索のホットパスを JSON 走査ではなく正規化テーブルで扱う。
- export 成果物をチェックポイントにして、Tauri 化や新サービス実装を独立して進められるようにする。

## 移行ステップ

1. SQLite 前提の新スキーマを固定する。
2. PostgreSQL から中間 export 形式を出力する。
3. 中間 export 形式から SQLite DB を作る importer を実装する。
4. SQLite 版サーバーを新スキーマへ接続する。
5. Tauri は設定・起動・バックアップ・WebView を担当する。

このPR相当の作業では 1 から 3 のうち、1 と 2 の仕様、3 のうち PostgreSQL exporter までを扱う。

## SQLite スキーマ方針

DDL は [apps/server/prisma/standalone/schema.sql](../apps/server/prisma/standalone/schema.sql) を正とする。

### 基本方針

- テーブル名・カラム名は SQLite 版では snake_case に寄せる。
- ID は旧DBの値を維持して import する。
- enum は `TEXT CHECK (...)` で表現する。
- boolean は `INTEGER NOT NULL DEFAULT 0` で表現する。
- 日時は ISO-8601 文字列の `TEXT` として保存する。
- JSON は互換・表示・再構築用途に `*_json TEXT` として保持するが、検索対象は正規化テーブルへ展開する。
- 検索対象の文字列は必要に応じて `COLLATE NOCASE` を付ける。

### 正規化する主なデータ

- `AutoTagPrediction.scores`
  - `auto_tag_prediction_scores` に `prediction_id`, `asset_id`, `tag_key`, `score`, `rank` として展開する。
- `StackAutoTagAggregate.topTags`
  - `stack_auto_tag_scores` に `aggregate_id`, `stack_id`, `tag_key`, `score`, `rank`, `asset_count` として展開する。
- `Stack.dominantColors` / `Asset.dominantColors`
  - 既存の `StackColor` / `AssetColor` 相当を `stack_colors` / `asset_colors` として検索用の正とする。
  - JSON は `dominant_colors_json` として残す。

## export 形式

exporter はディレクトリを生成する。tar/zip化は次段階で必要になった時に別処理にする。

```text
caramel-board-standalone-export-YYYYMMDD-HHMMSS/
├── manifest.json
└── data/
    ├── datasets.ndjson
    ├── users.ndjson
    ├── authors.ndjson
    ├── stacks.ndjson
    ├── assets.ndjson
    ├── tags.ndjson
    ├── stack_tags.ndjson
    ├── collections.ndjson
    ├── collection_folders.ndjson
    ├── collection_stacks.ndjson
    ├── stack_favorites.ndjson
    ├── asset_favorites.ndjson
    ├── like_activities.ndjson
    ├── navigation_pins.ndjson
    ├── auto_tag_mappings.ndjson
    ├── auto_tag_predictions.ndjson
    ├── auto_tag_prediction_scores.ndjson
    ├── stack_auto_tag_aggregates.ndjson
    ├── stack_auto_tag_scores.ndjson
    ├── stack_colors.ndjson
    ├── asset_colors.ndjson
    └── files.ndjson
```

`manifest.json` は export 仕様バージョン、生成日時、対象 dataset、各ファイルの行数と sha256 を持つ。

### files.ndjson

`files.ndjson` はDB中のファイル参照を列挙する。

- `kind`: `asset_file` / `asset_thumbnail` / `asset_preview` / `stack_thumbnail`
- `dataset_id`
- `stack_id`
- `asset_id`
- `key`
- `exists`: `--verify-files` 指定時のみ実ファイル確認結果を入れる
- `size`: `--verify-files` 指定時のみファイルサイズを入れる

ファイル実体はこの段階では同梱しない。旧アプリからの export チェックポイントとして、まず参照の完全性を検証可能にする。

## exporter

実装ファイルは [apps/server/scripts/export-standalone.mjs](../apps/server/scripts/export-standalone.mjs)。

実行例:

```bash
npm run -w @caramelboard/server export:standalone
npm run -w @caramelboard/server export:standalone -- --out=exports/my-export
npm run -w @caramelboard/server export:standalone -- --dataset=1 --verify-files
```

主なオプション:

- `--out=<path>`: 出力先ディレクトリ。省略時は `exports/caramel-board-standalone-export-YYYYMMDD-HHMMSS`。
- `--dataset=<id>`: 特定 dataset のみ export する。
- `--verify-files`: `FILES_STORAGE` または `--storage-root` 配下のファイル存在確認を行う。
- `--storage-root=<path>`: ファイル存在確認用の保存先ルートを明示する。

## importer 側の予定

SQLite importer は [apps/server/scripts/import-standalone-sqlite.mjs](../apps/server/scripts/import-standalone-sqlite.mjs) で実装する。

実行例:

```bash
npm run standalone:import -- --input=exports/caramel-board-standalone-export-YYYYMMDD-HHMMSS --db=exports/imported.sqlite --verify-files
```

処理順:

1. 一時DBへ `schema.sql` を適用する。
2. `PRAGMA foreign_keys = OFF` で ID 維持 insert を行う。
3. 全NDJSONを transaction 内で投入する。
4. `PRAGMA foreign_keys = ON` 後に `PRAGMA foreign_key_check` を実行する。
5. 問題なければ一時DBを指定された出力先へ rename する。
6. `--verify-files` 指定時は `files.ndjson` と保存ディレクトリを照合する。
7. import report を `<db>.import-report.json` に出力する。

importer は中断時にDBファイルを破棄できるよう、一時ファイルへ作成して最後に rename する。
