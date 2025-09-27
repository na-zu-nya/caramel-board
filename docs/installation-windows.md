# インストレーションガイド - Windows

## 必要なソフトウェアの準備

### Gitのインストール

- https://gitforwindows.org からGitをダウンロードしてインストールします。
- 全部の設定はそのまま Next で進めてください。

### Docker Desktopのインストール

- Microsoft Storeを開いて、 `Docker Desktop` を検索し、インストールしてください
- インストールが完了したら、Docker Desktopを起動し、設定を行います。
  - サインインはSkipしても構いません
  - 初回起動時に、WSL2のインストール・更新を求められた場合は、指示に従って、Terminalを起動してインストールしてください

## CaramelBoardのセットアップ

### アプリのダウンロード

- Windows Terminalを開いて、インストールしたいフォルダに移動します。
- gitコマンドでCaramelBoardをクローンします。

例: 自分のフォルダ直下に app フォルダを作ってインストールする場合($はコピペしないでね)
```bash
$ cd %HOMEPATH%
$ mkdir app
$ cd app

$ git clone https://github.com/na-zu-nya/caramel-board.git caramel-board
```

- appフォルダにcaramel-boardフォルダが作成されていれば成功です

### セットアップ

- Windows Terminalで、caramel-boardフォルダに移動して、 setup.bat を実行します。(ダブルクリックでOK)
- 案内に従って設定します
  - 選択肢を数字で入力+Enterで進めます 
  - ちょっと時間がかかりますが、終わるまで待ちます

### 起動・運用
#### アプリの起動

- Windows Terminalで、caramel-boardフォルダに移動して、 serve.batを実行します。(ダブルクリックでOK)

#### 他の端末からアクセスする

- 設定 > ネットワーク > イーサネット > ネットワークプロパティを開き、IPv4アドレスを確認します
- プロパティから、ネットワークプロファイルを「パブリック」から「プライベート」に変更します
- ブラウザで、以下のURLにアクセスします
- http://<IPアドレス>:9000
