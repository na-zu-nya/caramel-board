# CLI / Docker 版インストールガイド - macOS

CLI / Docker 版は `release/v1.0.8` をチェックポイントとして凍結しました。現在の mainline では macOS 向け Docker セットアップを提供していません。

通常利用は Desktop 版を利用してください。

- Desktop 版: [GitHub Releases](https://github.com/na-zu-nya/caramel-board/releases)

既存の Docker 版を継続利用する場合は、チェックポイントブランチへ切り替えてください。

```bash
git fetch origin release/v1.0.8
git checkout release/v1.0.8
./setup.sh
./serve.sh prod
```

`./serve.sh update` は mainline では廃止済みです。Docker 版として継続利用する場合は `release/v1.0.8` のチェックポイントへ固定してください。
