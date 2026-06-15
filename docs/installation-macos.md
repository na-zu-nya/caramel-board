# インストレーションガイド - macOS

## 必要なソフトウェアの準備

### Xcode Command Line Tools のインストール

- Spotlight（⌘ + Space）で `Terminal` を検索し、起動します
- 以下のコマンドを実行し、画面の案内に従ってインストールします

```bash
xcode-select --install
```

- インストール後にライセンス確認を求められる場合は、次のコマンドを実行して同意してください

```bash
sudo xcodebuild -license accept
```

### Homebrew のインストール

- Terminal で以下を実行し、Homebrew をセットアップします（途中でパスワード入力が求められます）

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

- インストール完了後、表示される `eval` コマンドを Terminal に貼り付けて実行し、PATH を更新します
- 念のため次のコマンドで診断し、警告があれば案内に従って修正します

```bash
brew doctor
```

### pyenv と Python 3 のセットアップ

1. pyenv をインストールします

   ```bash
   brew install pyenv
   ```

2. シェル起動時に pyenv が読み込まれるよう、設定ファイルを更新します（デフォルトが zsh の場合）

   ```bash
   echo 'eval "$(pyenv init --path)"' >> ~/.zprofile
   echo 'eval "$(pyenv init -)"' >> ~/.zshrc
   exec $SHELL
   ```

3. プロジェクト用に最新安定版の Python 3 をインストールし、グローバルで利用するバージョンを設定します（例では 3.11 系）

   ```bash
   pyenv install 3.11.9
   pyenv global 3.11.9
   python --version
   ```

   `python --version` が設定したバージョンになっていれば成功です

4. プロジェクトで利用する Python パッケージをインストールします

   ```bash
   python -m pip install --upgrade pip
   pip install huggingface-hub
   ```

   追加で必要な依存関係がある場合は、この段階で `pip install <package>` を実行してください

### Docker Desktop または OrbStack のインストール

- いずれか好みの仮想化ツールをインストールしてください
  - [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/)
    - Apple Silicon / Intel それぞれのインストーラを選択し、指示に従ってインストールします
    - 初回起動時にアクセス許可を求められたら許可してください
  - [OrbStack](https://orbstack.dev/)（軽量な Docker & Linux 環境）
    - ダウンロード後、アプリを `/Applications` にドラッグしてインストールします
- インストール後はアプリを起動し、サインインやチュートリアルはスキップして構いません
- 起動時にリソース割り当ての設定が表示されたら、推奨値のままで問題ありません

### Desktop 版で FFmpeg / Poppler / AutoTag を使う場合

Desktop 版で GIF・動画プレビュー、PDF 取り込み、自動タグを使う場合は、[Desktop 版 外部ツールセットアップ - macOS](./desktop-tools-macos.md) を参照してください。

Desktop 版では初回セットアップで FFmpeg / Poppler / AutoTag を設定できます。あとから設定画面の `メディア処理`、`Poppler`、`自動タグ` でも変更できます。

## CaramelBoard のセットアップ

### アプリのダウンロード

- アプリを配置したいフォルダに移動し、Terminal を開きます
- git でリポジトリをクローンします

```bash
git clone https://github.com/na-zu-nya/caramel-board.git caramel-board
```

- `caramel-board` フォルダが作成されていればダウンロード完了です

### セットアップ

1. Docker Desktop / OrbStack を起動しておきます（以後、CaramelBoard を利用する際は常駐させてください）
2. Terminal でプロジェクトへ移動し、スクリプトに実行権限を付与します

   ```bash
   cd caramel-board
   chmod +x setup.sh serve.sh scripts/*.sh
   ```

3. セットアップスクリプトを実行します

   ```bash
   ./setup.sh
   ```

   - 途中で保存先やオプションについて質問されるので、数字を入力して Enter で進めます
   - 初回はイメージのダウンロード等で時間がかかる場合があります。処理が完了するまで待機してください

## 起動・運用

### アプリの起動

- 本番構成で起動する場合

  ```bash
  ./serve.sh
  ```

- ログに `API Ready` などと表示されたら起動完了です。ブラウザで以下にアクセスします
  - http://localhost:6766
  - もしくは、自分のローカル IP アドレスを使って http://<IPアドレス>:6766

### アプリの停止

- 起動中のサービスを停止するには、別の Terminal から次を実行します

```bash
./serve.sh stop
```

### アプリの更新（git で取得した場合）

- リモートの更新を取り込みつつ再ビルドするには、以下を実行します

```bash
./serve.sh update
```

- 実行後に自動でコンテナが停止するので、必要に応じて `./serve.sh prod` などで再起動してください

### 他の端末からアクセスする場合

- 利用中のネットワークで macOS のローカル IP アドレスを確認し、同一ネットワーク内の端末から `http://<IPアドレス>:6766` にアクセスします
- ファイアウォールでアクセスがブロックされる場合は、`システム設定 > ネットワーク > ファイアウォール` から `サービスとポートを追加` し、TCP ポート `6766` を許可してください

---

上記手順で macOS 環境でも Windows 版同様に CaramelBoard を利用できます。トラブルが発生した場合は `./serve.sh stop` で一度サービスを停止し、ログメッセージを確認してから再度起動してください。
