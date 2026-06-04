# API 棚卸しメモ

作成日: 2026-06-05

スタンドアロン / SQLite 化に向けて、現行 API を「フロントから使われているもの」「deprecated / 到達不能 / 実質未使用のもの」に分けるための棚卸しです。

確認した起点:

- サーバーの API マウント: `apps/server/src/app.ts`, `apps/server/src/routes.ts`
- サーバールート定義: `apps/server/src/routes/**/*.ts`, `apps/server/src/features/datasets/routes/**/*.ts`
- クライアント呼び出し: `apps/client/src/lib/api-client.ts`, `apps/client/src/**/*.tsx`, `apps/client/src/**/*.ts`

## 結論

SQLite 版サーバーへ移す前に、まず削除または無効化確認しやすいのは次のグループです。

1. `routes.ts` からマウントされていないルートファイル
2. client に wrapper だけ残っているが、server に対応 route が存在しない API
3. マウント済みだが client 参照が見つからない管理・互換 API

特に search / embedding / AI analysis 系は、server 側コメントでも embedding が削除済みになっており、SQLite 移行対象から外す前提でよい候補です。

## 確実に到達不能または破綻している候補

| 種別 | 対象 | 根拠 | 方針案 |
| --- | --- | --- | --- |
| 未マウント route | `apps/server/src/routes/pictures.ts` の `POST /:id/predict-tags` | `routes.ts` に `picturesRoute` の import / mount がない。`PictureService` もこの route からのみ参照されている。 | 削除候補。AutoTag は現行 `/api/v1/auto-tags/*` と stack aggregate に寄せる。 |
| 未マウント route tree | `apps/server/src/features/datasets/routes/index.ts`, `apps/server/src/features/datasets/routes/dataset-stacks.ts` | `routes.ts` は `apps/server/src/routes/datasetStacks.ts` を mount している。features 配下の `datasetRoutes` は mount されていない。 | route と route 専用 middleware は削除候補。ただし `features/datasets/services/*` は現行 route から使われているため削除不可。 |
| client wrapper のみ | `apiClient.generateAllEmbeddings()` -> `POST /api/v1/search/generate-all-embeddings` | `/api/v1/search` route が mount されていない。client 参照 0 件。server 側にも embedding removed コメントが複数ある。 | 削除候補。 |
| client wrapper のみ | `apiClient.getEmbeddingQueueStatus()` -> `GET /api/v1/search/queue-status` | `/api/v1/search` route が mount されていない。client 参照 0 件。 | 削除候補。 |
| client wrapper のみ | `apiClient.runDatasetAIAnalysis()` -> `POST /api/v1/datasets/:id/ai-analysis` | `datasets-lite.ts` に対応 route がない。client 参照 0 件。 | 削除候補。 |
| client wrapper のみ | `apiClient.regenerateDatasetAutoTags()` -> `POST /api/v1/stacks/dataset/:datasetId/aggregate-all-tags` | `stacks.ts` に対応 route がない。client 参照 0 件。stack 単体の `/api/v1/stacks/:id/aggregate-tags` は存在し使用中。 | 削除候補。 |
| dead fallback | `updateAssetMeta()` の fallback `/api/v1/assets/:assetId/meta`, `/assets/:assetId/meta` | primary の `/api/v1/datasets/:datasetId/stacks/:stackId/assets/:assetId/meta` は mount 済み。fallback 2 本は server に存在しない。 | fallback 削除候補。 |

## マウント済みだが client 参照が見つからない候補

これらは server endpoint としては存在しますが、現行 client からの直接参照または `apiClient` wrapper 利用が見つかりませんでした。削除前に、外部利用・手動運用・将来 UI 予定の有無を確認する必要があります。

| endpoint / wrapper | 状態 | 方針案 |
| --- | --- | --- |
| `GET /api/v1/activities` | mounted。client 参照なし。 | yearly likes と delete だけ残し、一覧 API は削除候補。 |
| `GET /api/v1/activities/likes` | mounted。client 参照なし。 | `GET /likes/yearly`, `DELETE /likes/:id` は使用中。通常 likes 一覧は削除候補。 |
| `GET /api/v1/navigation-pins` | mounted。レスポンスは dataset scoped API への案内。client は `/dataset/:dataSetId` を使用。 | 開発者向け案内 endpoint なら standalone では不要候補。 |
| `GET /api/v1/upload/defaults` | mounted。client wrapper なし。 | 起動設定 UI に引き継ぐなら再設計、現行 API としては削除候補。 |
| `PUT /api/v1/upload/defaults` / `apiClient.setUploadDefaults()` | mounted だが `apiClient.setUploadDefaults()` の利用 0 件。client 内の `setUploadDefaults` は React state setter。 | 現行 UI では未使用。起動設定に統合するなら新 API として設計し直す。 |
| `POST /api/v1/colors/search` | mounted。client 参照なし。 | 色検索 UI がないなら削除候補。 |
| `POST /api/v1/colors/search-multi` | mounted。client 参照なし。 | 色検索 UI がないなら削除候補。 |
| `POST /api/v1/colors/filter` / `apiClient.searchByColorFilter()` | mounted だが wrapper 利用 0 件。 | 現行 UI から未使用。SQLite では色特徴量テーブルで再設計する候補。 |
| `POST /api/v1/colors/datasets/:datasetId/update-all-colors` / `apiClient.updateAllDatasetColors()` | mounted だが wrapper 利用 0 件。 | 全体再生成は `datasets/:id/refresh-all` に寄せるなら削除候補。 |
| `GET /api/v1/datasets/:dataSetId/stacks` | mounted。client は主に `/api/v1/stacks/paginated` を使用。 | dataset-scoped 検索 route と generic route の統合対象。 |
| dataset-scoped stack CRUD (`POST/PUT/DELETE /api/v1/datasets/:dataSetId/stacks...`) | mounted。client は generic `/api/v1/stacks` 系を主に使用。 | generic route へ一本化するか、SQLite 版で dataset-scoped に統一するか要判断。 |
| `GET /api/v1/tags/:id/stacks` | mounted。client 参照なし。 | client は `/api/v1/stacks/paginated` の filter を使用。削除候補。 |
| `POST /api/v1/tags/tag-stack` | mounted。client 参照なし。 | stack 側 `/api/v1/stacks/:id/tags` と bulk tags が使用中。削除候補。 |
| `apiClient.getAssets()` | wrapper 利用 0 件。endpoint は `GET /api/v1/datasets/:datasetId/stacks/:stackId/assets` として mounted。 | stack detail に assets が含まれる運用なら wrapper は削除候補。 |
| `apiClient.getStackCollections()` | wrapper 利用 0 件。endpoint は mounted。 | collection badge 等の UI がなければ wrapper 削除候補。endpoint は直接利用がないか確認後。 |
| `apiClient.getCollectionFolder()` | wrapper 利用 0 件。endpoint は mounted。 | folder tree / list で足りているなら wrapper 削除候補。 |
| `apiClient.reorderCollectionFolders()` | wrapper 利用 0 件。endpoint は mounted。 | DnD folder reorder UI が未実装なら保留または削除候補。 |

## deprecated コメントがあるが互換として残っているもの

| 対象 | 状態 | 方針案 |
| --- | --- | --- |
| `apps/server/src/routes/datasetStacks.ts` の paginated 廃止コメント | `GET /:dataSetId/stacks` を使うようコメントされているが、client は generic `/api/v1/stacks/paginated` を多用している。 | SQLite 化時に `stacks/paginated` と dataset-scoped search のどちらを正とするか決める。 |
| `apps/server/src/routes/stacks.ts` の legacy params | client 由来の旧 filter params を受けている。 | SQLite API では filter schema を明文化して互換吸収層を薄くする。 |
| client の `thumbnail`, `favorited`, `liked` legacy fields | response 正規化で互換維持している。 | DB 移行とは別に wire format の整理タイミングで扱う。 |
| `/files/*` の legacy fallback | storage path 互換。 | export / import 済みデータのファイル参照を壊さないため、SQLite 化直後は維持が安全。 |

## SQLite 版の最小移行対象として残す API

現行 client から利用が確認でき、スタンドアロン化でも維持が必要な API です。

- datasets: list / detail / create / update / delete / overview / protection / auth / set-default / refresh-all
- stacks: paginated list / detail / favorite / like / thumbnail refresh / tag aggregate / tags / author / media-type / bulk edit / merge / remove / upload / URL import / download originals
- dataset assets: stack assets / asset meta update
- assets-lite: remove / separate / order / favorite / like
- collections: CRUD / stack add-remove / bulk add / reorder / smart-stacks
- collection-folders: tree / CRUD / move
- tags: list / management / search / create / rename / merge / delete
- authors: list / search
- activities: yearly likes / like activity delete
- navigation-pins: dataset scoped list / CRUD / order
- auto-tags: health / statistics / strict statistics / mappings / stack auto-tag search
- colors: stats / stack update

## 次の進め方

1. まず「確実に到達不能または破綻している候補」を削除する。
2. `api-client.ts` の未使用 wrapper を落とし、client 側型から存在しない API を消す。
3. マウント済み未使用 API は、SQLite 版で残すかどうかを機能単位で決める。
4. API 統合方針を決める。特に stack list は `/api/v1/stacks/paginated` と `/api/v1/datasets/:dataSetId/stacks` のどちらを canonical にするか固定する。
