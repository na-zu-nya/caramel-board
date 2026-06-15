# PDF 取り込み

Caramel Board は、PDF をサーバー側でページ画像に変換して取り込む。

PDF ファイルが入力された場合、Poppler の `pdftocairo` を外部プロセスとして呼び出し、各ページを 350dpi の JPEG にラスタライズする。生成された JPEG は通常のページアイテムとしてスタックへ追加される。

## できること

- 新規スタック作成時に PDF をアップロードできる。
- 既存スタックへ PDF を追加できる。
- PDF の各ページは `p001`, `p002` のようなページ画像として追加される。
- スタックの `mediaType` はアップロード時に指定された値を維持する。PDF だからといって `comic` へ固定しない。
- PDF 原本は保存され、スタック単位の original download に含まれる。

## 必要な外部ツール

PDF のラスタライズには Poppler の `pdftocairo` が必要。

Desktop 配布物には Poppler を同梱しない。アプリは server が動いている環境にある `pdftocairo` を探して実行する。

標準 Docker イメージには `poppler-utils` を含める。Docker で動かしている場合、ホスト OS にインストールした `pdftocairo` はコンテナ内の server からは見えないため、コンテナ内の `pdftocairo` を使う。

探索順は次の通り。

1. `PDF_RASTERIZER_PATH`
2. PATH 上の `pdftocairo`
3. PATH 上の `pdftocairo.exe`
4. OS ごとの代表的なインストール先

代表的な候補:

- macOS: `/opt/homebrew/bin/pdftocairo`, `/usr/local/bin/pdftocairo`
- Linux: `/usr/bin/pdftocairo`
- Windows: `%APPDATA%\Caramel Board\tools\poppler\Library\bin\pdftocairo.exe`, `%APPDATA%\Caramel Board\tools\poppler\bin\pdftocairo.exe`, `%LOCALAPPDATA%\Caramel Board\tools\poppler\Library\bin\pdftocairo.exe`, `%LOCALAPPDATA%\Caramel Board\tools\poppler\bin\pdftocairo.exe`, PATH 上の `pdftocairo.exe`, 一般的なシステム配置

自動検出できない場所に置く場合は、`PDF_RASTERIZER_PATH` に実行ファイルのフルパスを設定する。

```bash
PDF_RASTERIZER_PATH=/opt/homebrew/bin/pdftocairo
```

Windows の例:

```powershell
$env:PDF_RASTERIZER_PATH = "$env:APPDATA\Caramel Board\tools\poppler\Library\bin\pdftocairo.exe"
```

## インストール例

OS ごとの詳細手順は次を参照する。

- Windows: [Desktop 版 外部ツールセットアップ - Windows](./desktop-tools-windows.md)
- macOS: [Desktop 版 外部ツールセットアップ - macOS](./desktop-tools-macos.md)

macOS:

```bash
brew install poppler
pdftocairo -v
```

Debian / Ubuntu:

```bash
sudo apt-get update
sudo apt-get install poppler-utils
pdftocairo -v
```

Windows:

- Poppler for Windows の配布物をインストールし、`pdftocairo.exe` を PATH に追加するか、設定画面から選択する。
- PATH に追加しない場合は、`PDF_RASTERIZER_PATH` へ `pdftocairo.exe` のフルパスを設定する。
- `%APPDATA%\Caramel Board\tools\poppler\Library\bin\pdftocairo.exe` に配置すると Desktop 版の検出候補に入る。
- MSYS2 を使う場合は、Poppler パッケージを入れたうえで `C:\msys64\ucrt64\bin\pdftocairo.exe` などを参照する。

## 実行形態ごとの注意

### スタンドアロン / ローカル Node / Desktop

server と同じ OS に Poppler をインストールする。PATH に入っていれば自動検出される。PATH に入れない場合は `PDF_RASTERIZER_PATH` を設定する。

Desktop 配布物には Poppler を同梱しない。macOS では Homebrew の `poppler`、Windows では Poppler for Windows などで `pdftocairo` を用意する。

Desktop の初回セットアップでは Poppler を検出し、見つかった `pdftocairo` を選択できる。あとで設定画面の `Poppler` から変更することもできる。

### Docker

標準の Docker 構成では、runtime image に `poppler-utils` をインストールするため、追加設定なしで `pdftocairo` を利用できる。

独自 Docker image を使う場合は、運用側で次のどちらかを選ぶ。

- `poppler-utils` などを含むカスタム runtime image を作る。
- Docker では PDF 取り込みを使わず、Poppler を利用できるスタンドアロン / ローカル Node / Desktop 環境で取り込む。

Docker であっても、ホスト OS に入れた `pdftocairo` はコンテナ内から直接使えない。

## 環境変数

| 変数 | 目的 | 既定値 |
| --- | --- | --- |
| `PDF_RASTERIZER_PATH` | `pdftocairo` の実行ファイルパスを明示する | 未設定 |
| `PDF_RASTERIZER_TIMEOUT_MS` | 1 ファイルのラスタライズ待ち時間 | `600000` |

`PDF_RASTERIZER_TIMEOUT_MS` はミリ秒で指定する。大きい PDF でタイムアウトする場合に増やす。

## 保存仕様

PDF 原本は dataset ごとに内容ハッシュで保存する。

```text
library/{dataSetId}/originals/{prefix}/{hash}.pdf
```

ページ画像は通常の asset として保存する。

```text
library/{dataSetId}/assets/{prefix}/{pageStorageHash}.jpg
```

同じ PDF を再度追加した場合でも、ページアイテムはその取り込みごとに追加できる。ページ画像の実体は取り込み ID とページ番号から作った保存用ハッシュを使うため、白紙ページなど同じ画像内容が複数あっても DB の `file` 一意制約にぶつからない。

## メタデータ

各ページ asset の `meta` には、元 PDF とページ番号を追跡するための情報を入れる。

```json
{
  "sourcePdfHash": "PDF内容のsha256",
  "sourcePdfImportId": "取り込みごとのUUID",
  "sourcePdfPage": 1,
  "rasterDpi": 350
}
```

stack の `meta` には PDF 原本の情報を入れる。

```json
{
  "sourceType": "pdf",
  "sourcePdf": {
    "file": "library/1/originals/ab/abcdef....pdf",
    "originalName": "document.pdf",
    "size": 123456,
    "hash": "PDF内容のsha256",
    "mimeType": "application/pdf",
    "pageCount": 12,
    "rasterDpi": 350,
    "importId": "取り込みごとのUUID",
    "createdAt": "2026-06-14T00:00:00.000Z"
  },
  "sourcePdfs": [
    {
      "file": "library/1/originals/ab/abcdef....pdf",
      "originalName": "document.pdf",
      "size": 123456,
      "hash": "PDF内容のsha256",
      "mimeType": "application/pdf",
      "pageCount": 12,
      "rasterDpi": 350,
      "importId": "取り込みごとのUUID",
      "createdAt": "2026-06-14T00:00:00.000Z"
    }
  ]
}
```

`sourcePdfs` は、同じスタックへ複数の PDF を追加した場合の原本一覧として使う。

## ダウンロード仕様

`download-originals` で stack を指定した場合、ZIP には次が入る。

- ラスタライズ後のページ JPEG
- 保存済みの PDF 原本

asset だけを指定した場合は、その asset の JPEG が対象になる。PDF 原本は stack に紐づく情報として扱うため、PDF 原本も含めたい場合は stack 単位でダウンロードする。

## エラー時の扱い

`pdftocairo` が見つからない場合、PDF 取り込み API は 400 を返す。

エラーメッセージ例:

```text
PDFのラスタライズには Poppler の pdftocairo が必要です。PDF_RASTERIZER_PATH を設定するか、pdftocairo をPATHに追加してください。
```

Poppler が PDF を処理できない場合やタイムアウトした場合も、PDF 処理エラーとして 400 を返す。

## ライセンスと配布の注意

この機能は Poppler を外部コマンドとして呼び出す前提で実装している。

Docker image には Debian パッケージの `poppler-utils` を含める。Desktop 配布物には Poppler を同梱しない。

Poppler の実行ファイルや関連ライブラリを再配布する場合は、Poppler 側のライセンス表記、再配布条件、ソース提供条件を確認して満たすこと。この文書は法的助言ではない。
