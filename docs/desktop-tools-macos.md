# Desktop 版 外部ツールセットアップ - macOS

Caramel Board Desktop 版で使う外部ツールの導入手順です。

| 機能 | 導入するもの |
| --- | --- |
| GIF・動画プレビュー | FFmpeg |
| PDF 取り込み | Poppler |
| 自動タグ付け・類似画像検索 | AutoTag |

## Homebrew を導入する

FFmpeg と Poppler の導入に Homebrew を使います。

1. Terminal を開きます。
2. Xcode Command Line Tools を導入します。

```bash
xcode-select --install
```

3. [Homebrew](https://brew.sh/ja/) を開きます。
4. ページに表示されているインストール用の 1 行を Terminal に貼り付けて実行します。

## FFmpeg

Terminal で実行します。

```bash
brew install ffmpeg
```

Caramel Board で設定します。

1. Caramel Board Desktop を開きます。
2. 設定画面の `メディア処理` を開きます。
3. 再検出ボタンを押します。
4. 候補に出ない場合は、フォルダアイコンから `ffmpeg` を選びます。

選ぶファイル:

```text
/opt/homebrew/bin/ffmpeg
/usr/local/bin/ffmpeg
```

## Poppler

Terminal で実行します。

```bash
brew install poppler
```

Caramel Board で設定します。

1. Caramel Board Desktop を開きます。
2. 設定画面の `Poppler` を開きます。
3. 再検出ボタンを押します。
4. 候補に出ない場合は、フォルダアイコンから `pdftocairo` を選びます。

選ぶファイル:

```text
/opt/homebrew/bin/pdftocairo
/usr/local/bin/pdftocairo
```

## AutoTag

1. Caramel Board Desktop を開きます。
2. 設定画面の `自動タグ` を開きます。
3. `モデルをインストール` を押します。
4. ダウンロード容量を確認して、インストールを開始します。
