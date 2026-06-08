# API 棚卸しメモ

作成日: 2026-06-05

スタンドアロン / SQLite 化に向けて、現行 API を「フロントから使われているもの」「deprecated / 到達不能 / 実質未使用のもの」に分けるための棚卸しです。

確認した起点:

- サーバーの API マウント: `apps/server/src/app.ts`, `apps/server/src/routes.ts`
- サーバールート定義: `apps/server/src/routes/**/*.ts`, `apps/server/src/features/datasets/routes/**/*.ts`
- クライアント呼び出し: `apps/client/src/lib/api-client.ts`, `apps/client/src/**/*.tsx`, `apps/client/src/**/*.ts`

## SQLite 移行状況

更新日: 2026-06-08

凡例:

- `完了`: standalone SQLite 有効時に SQLite repository を参照する
- `部分`: 主要な現行 UI 経路は SQLite 化済みだが、同一 route group 内に Prisma 経路または 501 が残る
- `501`: standalone SQLite では明示的に未実装レスポンスを返す
- `未移行`: standalone SQLite でも Prisma/service 経路のまま
- `削除`: dead route / dead wrapper として削除済み

| 領域 | 状態 | SQLite 化済み | 未完了・保留 |
| --- | --- | --- | --- |
| datasets | 完了 | `GET /datasets`, `GET /datasets/:id`, `POST /datasets`, `PUT /datasets/:id`, `DELETE /datasets/:id`, `GET /datasets/:id/overview`, protection/auth/default 系, `POST /datasets/:id/refresh-all` | なし |
| authors | 完了 | `GET /authors`, `GET /authors/search` | なし |
| tags | 完了 | `GET /tags`, `GET /tags/management`, `GET /tags/search`, `GET /datasets/:dataSetId/tags/search`, `POST /tags`, `PUT /tags/:id`, `POST /tags/merge`, `POST /tags/tag-stack`, `GET /tags/:id/stacks`, `DELETE /tags/:id` | なし |
| stacks | 部分 | `GET /stacks/paginated`, `GET /stacks/:id`, `GET /stacks/favorites/list`, `GET /stacks/search/autotag`, `GET /stacks/download-originals`, `GET /datasets/:dataSetId/stacks/:id`, `GET /datasets/:dataSetId/stacks/:id/similar`, `GET /datasets/:dataSetId/collections/:collectionId/similar`, dataset-scoped stack update/delete/tags/author/favorite/like, `POST /datasets/:dataSetId/stacks/:id/regenerate-preview`, `POST /stacks/:id/aggregate-tags`, `POST /stacks/:id/refresh-thumbnail`, `POST /stacks/bulk/tags`, `PUT /stacks/bulk/author`, `PUT /stacks/bulk/media-type`, `PUT /stacks/bulk/favorite`, `POST /stacks/bulk/refresh-thumbnails`, `POST /stacks/merge`, `DELETE /stacks/bulk/remove`, `POST /stacks/:id/like`, `PUT /stacks/:id/favorite`, `POST /stacks/:id/tags`, `DELETE /stacks/:id/tags/:tag`, `PUT /stacks/:id/author`, `DELETE /stacks/:id` | upload / URL import / stack asset追加、dataset-scoped stack search は未移行 |
| dataset assets | 完了 | `GET /datasets/:dataSetId/stacks/:id/assets`, `PUT /datasets/:dataSetId/stacks/:id/assets/:assetId/meta` | なし |
| assets-lite | 完了 | `DELETE /assets/:assetId`, `POST /assets/:assetId/separate`, `PUT /assets/:assetId/order`, `PUT /assets/:assetId/favorite`, `POST /assets/:assetId/like` | なし |
| collections | 部分 | `GET /collections`, `GET /collections/:id`, `POST /collections`, `PUT /collections/:id`, `DELETE /collections/:id`, stack add/remove/bulk/reorder, `GET /collections/:id/stacks`, `GET /collections/:id/smart-stacks`, `GET /stacks/:id/collections` | smart-stacks は検索/タグ/作者/fav/liked/mediaType を SQLite stack query に変換。colorFilter は colors API 移行時に精度合わせ |
| collection-folders | 完了 | `GET /collection-folders`, `GET /collection-folders/tree`, `GET /collection-folders/:id`, `POST /collection-folders`, `PUT /collection-folders/:id`, `DELETE /collection-folders/:id`, reorder, move | なし |
| activities | 完了 | `GET /activities`, `GET /activities/likes`, `GET /activities/likes/yearly`, `DELETE /activities/likes/:id` | なし |
| navigation-pins | 完了 | `GET /navigation-pins/dataset/:dataSetId`, `POST /navigation-pins`, `PUT /navigation-pins/:id`, `DELETE /navigation-pins/:id`, `PUT /navigation-pins/order` | root helper は案内レスポンスのみ |
| auto-tags | 部分 | `GET /auto-tags/statistics/:datasetId`, `GET /auto-tags/statistics/:datasetId/strict`, mappings list/create/update/delete | `GET /auto-tags/joytag/health` は外部 JoyTag health のまま |
| colors | 部分 | `POST /colors/search`, `POST /colors/search-multi`, `POST /colors/filter`, `POST /colors/stacks/:stackId/update-colors`, `POST /colors/datasets/:datasetId/update-all-colors`, `GET /colors/stats` | standalone では export/import 済みの `dominant_colors_json` を利用。画像ファイルからの再抽出は upload / refresh pipeline 側で再設計 |
| upload/defaults | 未移行 | なし | 起動設定 UI へ統合するか要判断 |
| dead APIs | 削除 | `routes/pictures.ts`, `PictureService`, 未マウント `features/datasets/routes/*`, client の embedding / AI analysis / 存在しない asset meta fallback wrapper | なし |

直近の検証:

- `exports/imported-reference-check.sqlite` を参照して `GET /api/v1/stacks/paginated?dataSetId=1&limit=3&offset=0` が `total: 100` を返すことを確認。
- `GET /api/v1/stacks/81?dataSetId=1`, `GET /api/v1/datasets/1/stacks/81/assets`, tag filter 付き stack list を確認。
- `/tmp/caramel-board-stack-write-check.sqlite` のコピーDBで stack/asset favorite, like, asset meta, order, stack tag add/remove, author update, asset delete, stack delete を確認。
- `exports/imported-reference-check.sqlite` を参照して collections list/detail/stacks, folder tree, navigation pins を確認。
- `/tmp/caramel-board-library-write-check.sqlite` のコピーDBで collection/folder/pin の create/update/reorder/delete、collection stack add/bulk/remove/reorder を確認。
- `exports/imported-reference-check.sqlite` を参照して activities grouped/recent/yearly likes と favorites list を確認。
- `/tmp/caramel-board-activity-write-check.sqlite` のコピーDBで like activity delete と liked decrement を確認。
- `exports/imported-reference-check.sqlite` を参照して colors stats/search/search-multi/filter/update-all-colors を確認。
- colors stack update は既存 asset colors を集約して stack colors を更新する実装。検証時に `exports/imported-reference-check.sqlite` の stack 79 を更新済み。
- `/tmp/caramel-board-autotag-write-check.sqlite` のコピーDBで auto-tag statistics(raw/aggregate)/strict, mappings list/create/update/delete, stack auto-tag search, stack aggregate-tags, tag stacks を確認。
- `/tmp/caramel-board-stack-maintenance-check.sqlite` のコピーDBで asset separate, thumbnail refresh, bulk tags/author/media-type/favorite/refresh/remove, stack merge を確認。
- `/tmp/caramel-board-refresh-all-check.sqlite` のコピーDBで dataset refresh-all が 100 stacks / colors 99 / autotags 100 を処理することを確認。
- `/tmp/caramel-board-download-check.sqlite` のコピーDBで `GET /api/v1/stacks/download-originals` の single asset / single stack / multi asset zip を確認。
- `/tmp/caramel-board-dataset-scoped-check.sqlite` のコピーDBで dataset-scoped stack detail, stack similar, collection similar, regenerate-preview, tags/search を確認。
- `/tmp/caramel-board-dataset-crud-check.sqlite` のコピーDBで dataset-scoped stack update, tag add/remove, author update, favorite, like, delete を確認。

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
