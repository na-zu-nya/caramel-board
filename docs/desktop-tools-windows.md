# Desktop 版 外部ツールセットアップ - Windows

Caramel Board Desktop 版で使う外部ツールの導入手順です。

| 機能 | 導入するもの |
| --- | --- |
| GIF・動画プレビュー | FFmpeg |
| PDF 取り込み | Poppler |
| 自動タグ付け・類似画像検索 | AutoTag |
| AutoTag の GPU 高速化 | NVIDIA ドライバー / CUDA Toolkit |

## ツール置き場を作る

エクスプローラーのアドレスバーに次の文字列を貼り付けて、Enter を押します。

```text
%APPDATA%\Caramel Board
```

開いたフォルダの中に `tools` フォルダを作ります。

```text
Caramel Board
   └─ tools
```

## FFmpeg

1. [gyan.dev FFmpeg builds](https://www.gyan.dev/ffmpeg/builds/) を開きます。
2. `release builds` の `ffmpeg-release-essentials.zip` をダウンロードします。
3. zip を右クリックして `すべて展開` を選びます。
4. 展開された `ffmpeg-...-essentials_build` フォルダを開きます。
5. `bin` フォルダが入っている階層を `ffmpeg` に名前変更します。
6. `ffmpeg` フォルダを `%APPDATA%\Caramel Board\tools` に移動します。

最終配置:

```text
%APPDATA%
└─ Caramel Board
   └─ tools
      └─ ffmpeg
         └─ bin
            └─ ffmpeg.exe
```

Caramel Board で設定します。

1. Caramel Board Desktop を開きます。
2. 設定画面の `メディア処理` を開きます。
3. 再検出ボタンを押します。
4. 候補に出ない場合は、フォルダアイコンから `ffmpeg.exe` を選びます。

選ぶファイル:

```text
%APPDATA%\Caramel Board\tools\ffmpeg\bin\ffmpeg.exe
```

## Poppler

1. [poppler-windows Release 26.02.0-0](https://github.com/oschwartz10612/poppler-windows/releases/tag/v26.02.0-0) を開きます。
2. `Assets` の `Release-26.02.0-0.zip` をダウンロードします。
3. zip を右クリックして `すべて展開` を選びます。
4. 展開された `poppler-26.02.0` フォルダを `poppler` に名前変更します。
5. `poppler` フォルダを `%APPDATA%\Caramel Board\tools` に移動します。

最終配置:

```text
%APPDATA%
└─ Caramel Board
   └─ tools
      └─ poppler
         └─ Library
            └─ bin
               └─ pdftocairo.exe
```

Caramel Board で設定します。

1. Caramel Board Desktop を開きます。
2. 設定画面の `Poppler` を開きます。
3. 再検出ボタンを押します。
4. 候補に出ない場合は、フォルダアイコンから `pdftocairo.exe` を選びます。

選ぶファイル:

```text
%APPDATA%\Caramel Board\tools\poppler\Library\bin\pdftocairo.exe
```

## AutoTag

1. Caramel Board Desktop を開きます。
2. 設定画面の `自動タグ` を開きます。
3. `モデルをインストール` を押します。
4. ダウンロード容量を確認して、インストールを開始します。

## CUDA / GPU

AutoTag は CPU でも利用できます。NVIDIA GPU でタグ生成する場合は、Caramel Board Desktop の `自動タグ` 設定で `GPUでタグを生成する` を有効にします。

この項目は、利用できる NVIDIA GPU が検出された場合だけ選択できます。選択できない場合は、まず NVIDIA ドライバーを更新してください。

1. [NVIDIA Driver Downloads](https://www.nvidia.com/Download/index.aspx) から GPU に合うドライバーをインストールします。
2. Windows を再起動します。
3. Caramel Board Desktop を開き直します。
4. `自動タグ` 設定で `状態を確認` を押します。
5. `GPUでタグを生成する` が選択可能になったらチェックを入れます。

通常の利用では CUDA Toolkit の手動インストールは不要です。GPU 実行時に必要な PyTorch は、AutoTag の起動時に Caramel Board が CUDA 対応版を選択します。
