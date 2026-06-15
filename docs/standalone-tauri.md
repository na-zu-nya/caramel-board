# Tauri スタンドアロン化メモ

作成日: 2026-06-08

## 方針

`apps/desktop` を Tauri の薄いホストアプリとして追加する。

- 左サイドバー: `General` / `Media` / `Poppler` / `AutoTag` / `Migration` のナビゲーション
- 右ペイン: 選択中カテゴリの設定項目
- 右上固定操作: Caramel Board の起動 / 停止、ブラウザで開く
- 内部起動プロセス: 既存 Node server を standalone SQLite 設定で起動する
- client: `apps/client/dist` を server の `STATIC_ROOT` として配信する
- Web client はアプリ内 iframe ではなく、Caramel Board 起動後にブラウザで開く
- DB / Files / Network / Basic Auth は `General` に集約する
- 自動タグは `AutoTag` に分離し、通常は準備・ON/OFF・状態確認だけで扱えるようにする
- 旧 Docker 版からの移行は `Migration` として独立させ、`General` の DB 設定からも誘導する

## 現時点の起動準備

```sh
npm run desktop:prepare
npm run desktop:dev
```

`desktop:prepare` は server と client を build する。Tauri launcher から Start すると、次の環境変数で server を起動する。

- `PORT`
- `HOST`
- `STANDALONE_SQLITE_PATH`
- `SQLITE_DB_PATH`
- `FILES_STORAGE`
- `STATIC_ROOT`
- `CARAMEL_ALLOW_EXTERNAL`
- `CARAMEL_BASIC_AUTH_ENABLED`
- `CARAMEL_BASIC_AUTH_USERNAME`
- `CARAMEL_BASIC_AUTH_PASSWORD`
- `CARAMEL_UI_LANGUAGE`
- `PDF_RASTERIZER_PATH`

## 今回入れた設定項目

- 起動 / 停止
- ブラウザで開く
- `General`
  - SQLite DB path
  - SQLite DB の移動
  - DB import / export
  - ライブラリパス
  - ライブラリフォルダの移動
  - 言語設定
  - 外部通信許可
  - Basic 認証
- `Migration`
  - 旧 Docker 版からの移行
- `AutoTag`
  - 自動タグのON/OFF
  - 準備状態の確認
  - JoyTagコード、Hugging Faceモデル、Python依存のインストール
  - 詳細設定として保存先、ポート、しきい値を変更可能
- `Media`
  - FFmpeg 実行ファイルの検出・選択
- `Poppler`
  - Poppler `pdftocairo` 実行ファイルの検出・選択

設定は保存ボタンを置かず、変更操作のたびに自動保存する。Caramel Board 起動中は、参照先の不整合を避けるため設定変更・DB import/export・DB移動・ライブラリ移動・Docker 移行を無効化する。

自動タグがONの場合、Caramel Board 起動時にローカルの JoyTag サービスも起動し、server へ `JOYTAG_SERVER_URL` を渡す。停止時やウィンドウを閉じた時は、Caramel Board と自動タグサービスの両方を停止する。

言語設定は英語と日本語に対応する。Desktop UI は即時に表示を切り替え、Caramel Board 起動時には `CARAMEL_UI_LANGUAGE` として Web client に渡す。Web client は standalone 経由で配信される場合、この値を既定言語として `localStorage` と `html lang` に反映する。

## 旧 Docker 版からの移行

Desktop UI の `Docker Migration` から、旧 Docker 版が起動してアクセスできる状態かを自動検出し、旧 PostgreSQL 環境を export して standalone SQLite DB へ import できる。

通常操作では「旧 Docker 版を起動し、移行元アセットフォルダを確認してから移行」を基本導線にする。旧 PostgreSQL 接続先は自動検出する。移行元アセットフォルダは自動検出結果を初期値として表示し、ユーザーが移行前に選び直せるようにする。

次の項目は詳細設定として折りたたむ。

- `PostgreSQL DATABASE_URL`: 自動検出できない場合の旧 Docker PostgreSQL 接続先
- `Dataset ID`: 特定 dataset のみ移行する場合に指定
- `Verify file references`: export/import 時にファイル参照を検証する

`Library path` は standalone 側のファイルストレージルートで、`library/1/...` を内包する親ディレクトリを指定する。

## 自動タグ

AutoTag のインストール導線は、通常ユーザー向けに次の流れにする。

1. `自動タグはインストールされていません` と表示する
2. `モデルをインストール` から説明ダイアログを表示する
3. JoyTag、事前学習済みモデル、取り込んだ画像の自動タグ付け・類似画像検索に使えること、ローカル処理、画像が外部転送・学習利用されないことを説明する
4. モデルのメタデータを取得し、ダウンロード容量を確認する
5. ユーザー確認後、バックグラウンドでダウンロードする
6. 完了後、自動タグを自動で有効化する

AutoTag のインストールでは次を自動実行する。

- アプリ同梱の `uv` 実行環境確認
- `fpgaminer/joytag` の取得
- Hugging Face `fancyfeast/joytag` のモデル取得
- JoyTag ブリッジ実行に必要な Python 依存の事前解決

モデルは初回インストール時にダウンロードする。Hugging Face の `fancyfeast/joytag` から、実行に必要な `model.safetensors`、`top_tags.txt`、`config.json` を取得する。画面には Hugging Face のメタデータから取得した容量を表示する。取得できない場合は概算値を使う。

JoyTag ブリッジは `JOYTAG_REPO_DIR` を見て `Models.py` を読み込む。これにより、ブリッジスクリプト自体は `integrations/joytag/joytag_server.py` に置いたまま、JoyTag 本体をアプリデータ配下に保存できる。

## 次工程

配布用 build では、`apps/desktop/scripts/prepare-package-resources.mjs` が server/client/runtime を `apps/desktop/resources` に集約し、Tauri bundle resources として同梱する。

Rust 側は、配布物では `app.path().resource_dir()` から `server` / `client` / `runtime/node` を参照し、開発中は repo 内の `apps/server` / `apps/client` へフォールバックする。これにより、インストール済みアプリではユーザー環境の `node` に依存せず、同梱 Node runtime で `server/dist/entry.node.mjs` を起動する。

AutoTag は配布物では `runtime/uv` を優先して使い、開発中のみ system `uv` にフォールバックする。AutoTag の起動に失敗しても Caramel Board 本体 server の起動は継続する。

Poppler は Desktop 配布物へ同梱しない。初回セットアップと設定画面の `Poppler` で `pdftocairo` を検出・選択し、server 起動時に `PDF_RASTERIZER_PATH` として渡す。

OS ごとの native dependency があるため、Windows 配布物は Windows 実機または Windows CI で作成する。詳しい作成・検証手順は `docs/desktop-packaging.md` を参照する。
