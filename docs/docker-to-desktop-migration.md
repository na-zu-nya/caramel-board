# Docker 版から Desktop 版へ移行する

このガイドは、既存の Docker 版 Caramel Board のデータを Desktop 版へ引き継ぐための手順です。

## 対象

- Docker 版 Caramel Board を利用している
- Desktop 版 Caramel Board v1.0.10-beta 以降へ移行する

## 移行前の準備

1. [GitHub Releases](https://github.com/na-zu-nya/caramel-board/releases) から Caramel Board v1.0.10-beta 以降の Desktop 版をダウンロードしてインストールします。
2. 既存の Docker 版 Caramel Board のフォルダを開きます。
3. Docker 版を最新の状態へ更新します。
   - Windows: `update.bat`
   - macOS / Linux: `./serve.sh update`
4. 更新が完了したら、Docker 版を起動します。
   - Windows: `serve.bat`
   - macOS / Linux: `./serve.sh prod`
5. ブラウザで `http://localhost:6766` を開き、Docker 版が表示されることを確認します。

## Desktop 版で引き継ぐ

1. Desktop 版 Caramel Board を起動します。
2. セットアップ画面で「以前の版から引き継ぐ」を選択します。
3. 接続確認が成功することを確認します。
4. アセットフォルダを選択します。
5. 画面の指示に従って移行を進めます。

移行中は Docker 版を起動したままにしてください。

## アセットフォルダの選び方

アセットフォルダには、Docker 版で画像や動画などの実ファイルが保存されているフォルダを選択します。

選択するのは、`1`, `2`, `3` といった番号のフォルダが並んでいる親フォルダです。

例:

```text
assets/
├── 1/
├── 2/
└── 3/
```

この例では `assets` フォルダを選択します。

移行時にアセットファイルはコピーされません。Desktop 版は、ここで選択した既存のアセットフォルダを参照して利用します。

## 移行後

移行が完了したら、Desktop 版でライブラリ、スタック、画像や動画が表示されることを確認します。

移行結果を確認できるまでは、Docker 版のフォルダやデータフォルダは削除しないでください。

## アセットフォルダを移動する

移行後にアセットフォルダを別の場所へ移動したい場合は、Desktop 版が起動していない状態で行います。

1. Desktop 版 Caramel Board を終了します。
2. アセットフォルダを移動先へ移動します。
3. Desktop 版 Caramel Board を起動します。
4. 設定画面でアセットフォルダのパスを移動先に変更します。
5. ライブラリを開き、画像や動画が表示されることを確認します。
