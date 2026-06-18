# CLI / Docker 版セットアップ

このページは、Docker Compose とスクリプトで Caramel Board を起動する CLI / Docker 版の手順です。Desktop 版を使う場合は、[GitHub Releases](https://github.com/na-zu-nya/caramel-board/releases) からインストーラーを取得してください。

## 対象

CLI / Docker 版は、既存の Docker 環境を運用している場合や、開発・検証のためにコンテナ構成を直接扱いたい場合に使います。通常利用では Desktop 版を推奨します。

## Windows / macOS

Windows と macOS は、OS ごとの準備手順を確認してください。

- Windows: [CLI / Docker 版インストールガイド - Windows](./installation-windows.md)
- macOS: [CLI / Docker 版インストールガイド - macOS](./installation-macos.md)

## Linux クイックスタート

### 必要なソフトウェア

- Docker Engine と docker compose plugin
- Git
- Python 3（3.10 以上推奨）

`huggingface-hub` を利用するため、pip が利用可能な状態にします。

### リポジトリの取得

```bash
git clone https://github.com/na-zu-nya/caramel-board.git caramel-board
cd caramel-board
```

### 初期セットアップ

```bash
chmod +x setup.sh serve.sh scripts/*.sh
python3 -m pip install --upgrade pip
python3 -m pip install huggingface-hub
./setup.sh
```

`./setup.sh` の途中で保存先やオプションについて質問されます。画面の案内に従って選択してください。

## 起動と停止

```bash
# 本番モードで起動
./serve.sh prod

# 開発モードで起動
./serve.sh dev

# サービスの停止
./serve.sh stop
```

起動後は `http://localhost:6766` または `http://<ホストIP>:6766` からアクセスできます。

## 更新

```bash
./serve.sh update
```

最新の変更を取り込んで再ビルドし、必要に応じて再起動します。更新前には `backups/pre-update-db-YYYYMMDD-HHMMSS.sql` が自動作成されます。

## バックアップ

### DB バックアップ

```bash
./serve.sh backup
```

バックアップファイルは `backups/caramel-board-db-YYYYMMDD-HHMMSS.sql` に作成されます。保存先を指定したい場合は、パスを渡します。

```bash
./serve.sh backup backups/my-backup.sql
./serve.sh backup backups/my-backup.sql.gz
```

`npm run db:backup` でも同じ処理を実行できます。

## ストレージ

推奨の既定値は次の通りです。

- 画像・動画（コンテナ内の `/app/data`）: リポジトリの `./data/assets`
- PostgreSQL データ: リポジトリの `./data/postgres`

保存先は `docker-compose.local.yml` で上書きできます。このファイルが存在する場合、`./serve.sh` が自動で読み込みます。

```yaml
services:
  app:
    environment:
      - FILES_STORAGE=/app/data
    volumes:
      - ./data/assets:/app/data
  postgres:
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
```

権限エラーが出る場合は、ホスト側ディレクトリの所有権とパーミッションを確認してください。

## トラブルシューティング

- 6766 番ポートを他のサービスが使っている場合は、`docker-compose.yml` の `ports` 設定を変更して `./serve.sh` を再実行します。
- PostgreSQL 5432 が使用中の場合は、開発用の `docker-compose.dev.yml` の `ports` を変更します。
- JoyTag に接続できない場合は、`JOYTAG_SERVER_URL` を確認します。
- PDF を取り込めない場合は、Docker image に含まれる `pdftocairo` が利用できるか確認します。
- ストレージ権限エラーが出る場合は、ホスト側ディレクトリの所有権とパーミッションを修正します。
