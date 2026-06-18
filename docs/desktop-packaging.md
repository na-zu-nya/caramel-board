# Desktop パッケージング手順

作成日: 2026-06-10

## 目的

Caramel Board Desktop を、開発環境に Node.js / uv / Git / repository 一式がなくても起動できる配布物として検証する。

## バージョン更新

アプリの表示バージョン、Tauri 設定、Cargo package、npm workspace、Windows installer の内部 version は root `package.json` を基準にする。

```sh
npm run sync:version
```

リリース前に root `package.json` の `version` を更新してから、このコマンドで関連ファイルへ反映する。

## ローカルでの macOS パッケージ作成

```sh
npm run -w @caramelboard/desktop build:app
```

このコマンドは次を実行する。

- server/client を production build する
- 配布対象 OS/CPU 向けの Node.js runtime を取得して `apps/desktop/resources/runtime/node` に配置する
- 配布対象 OS/CPU 向けの uv runtime を取得して `apps/desktop/resources/runtime/uv` に配置する
- `apps/server/dist`、Prisma schema、migration/export/import scripts を `apps/desktop/resources/server` に配置する
- server runtime に必要な production dependencies を OS ネイティブ込みで install する
- packaged resource として `server` / `client` / `runtime` / `migration` / `integrations` を Tauri bundle に含める

macOS arm64 で確認済みの出力先:

- `apps/desktop/src-tauri/target/release/bundle/macos/Caramel Board.app`
- `apps/desktop/src-tauri/target/release/bundle/dmg/Caramel Board_1.0.0-beta.4_aarch64.dmg`

## Windows パッケージ作成

Windows 配布物は、Windows 実機または Windows CI 上で作成する。Prisma / sharp などの native dependency と Node runtime が OS ごとに異なるため、macOS から Windows 用 package を作らない。

手元の Windows で作る場合:

```powershell
npm ci
npm run -w @caramelboard/desktop build:app
```

GitHub Actions で作る場合、`Desktop Package` workflow が macOS / Windows の配布物を作成する。

手動検証の場合:

1. `Desktop Package` workflow を手動実行する
2. `caramel-board-desktop-macOS` または `caramel-board-desktop-Windows` artifact を取得する
3. `.dmg`、`.msi`、`.exe` を検証機にコピーする

GitHub Release を作る場合:

1. root `package.json` の `version` を更新して `npm run sync:version` を実行する
2. `v1.0.0-beta.2` のように version と一致する tag を作成して push する
3. `Desktop Package` workflow が完了すると、同じ tag の GitHub Release に `.dmg`、`.msi`、`.exe` が添付される

## 別 PC 検証チェックリスト

検証機には Node.js / PostgreSQL / Git / uv が入っていない状態を基本にする。Node.js と uv はアプリに同梱される。

1. アプリをインストールして起動する
2. 設定画面が表示される
3. SQLite DB path と Library path を設定する
4. Caramel Board を起動する
5. `ブラウザで開く` から Web UI が表示される
6. Library 一覧、Stack 詳細、Asset 表示が動く
7. アプリから停止した後、設定ポートへアクセスできなくなる
8. アプリ終了後に server process が残らない
9. GIF/動画設定で `ffmpeg` の検出候補が表示される、または参照ボタンで選択できる
10. `Poppler` 設定で `pdftocairo` の検出候補が表示される、または参照ボタンで選択できる
11. Windows では終了時にタスクトレイ常駐と終了操作の挙動を確認する
12. macOS では Dock 起動後、終了するまで常駐し、設定ウィンドウを再表示できることを確認する

## 2026-06-10 のローカル確認結果

macOS arm64 で `.app` と `.dmg` の生成を確認した。

同梱 resource は `.app/Contents/Resources` 直下に次の構造で配置される。

- `runtime/node/bin/node`
- `runtime/uv/uv`
- `server/dist/entry.node.mjs`
- `server/node_modules`
- `client/dist/index.html`
- `migration/scripts`
- `integrations/joytag`

`.app` 内の Node runtime と server dist だけを使ったスモークテストでは、次を確認した。

- `GET /api/v1/health`: 200
- `GET /api/v1/datasets`: 200
- `GET /`: 200

検証に使った package サイズ:

- `.app`: 約 540 MB
- `.dmg`: 約 176 MB
