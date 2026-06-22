# CLI / Docker 版セットアップ

CLI / Docker 版は `release/v1.0.8` をチェックポイントとして凍結しました。現在の mainline は Desktop / SQLite 版の開発ラインで、Docker Compose での運用ファイルは含みません。

通常利用は [GitHub Releases](https://github.com/na-zu-nya/caramel-board/releases) から Desktop 版をインストールしてください。

## 旧 Docker 版を継続利用する場合

既存の Docker 版を起動・バックアップしたい場合は、チェックポイントブランチへ切り替えてください。

```bash
git fetch origin release/v1.0.8
git checkout release/v1.0.8
./serve.sh prod
```

Windows の `setup.bat` / `serve.bat` / `update.bat` も mainline では実行処理を持ちません。旧 Docker 版で必要な場合は、同じく `release/v1.0.8` に切り替えてから利用してください。

## Desktop 版へ移行する場合

1. 旧 Docker 版を `release/v1.0.8` で起動します。
2. Desktop 版をインストールします。
3. 初回セットアップの「以前の版から引き継ぐ」、または Settings の「Docker版からの移行」を実行します。

移行機能は、起動中の旧 Docker / PostgreSQL 環境からデータを書き出し、Desktop 版の SQLite データストアへ取り込みます。

## 更新について

`./serve.sh update` は廃止しました。Docker 版として継続利用する場合は mainline へ更新せず、`release/v1.0.8` のチェックポイントへ固定してください。
