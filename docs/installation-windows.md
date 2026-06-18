# CLI / Docker 版インストールガイド - Windows

## 必要なソフトウェアの準備

### Windows Terminalのインストール

- Microsoft Storeを開いて、 `Windows Terminal` を検索し、インストールしてください

### WSL2のインストール

1. 有効化します

- Windowsキーを入力して `PowerShell` を検索します
- **管理者として実行する** をクリック
- 以下のコマンドを1行ずつ、PowerShellに貼り付けて実行(Enter)します (#から始まるコメントは無視でOK)

```powershell
# WSL機能を有効化
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

# 仮想マシンプラットフォームを有効化
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

# Hyper-Vを有効化（Windows 11 Proの場合）
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All

# 再起動
Restart-Computer
```

2. WSL2をデフォルト化します

```powershell
# WSL2をデフォルトバージョンに設定
wsl --set-default-version 2

# WSLカーネルの更新（必要な場合）
wsl --update
```

3. Ubuntuをインストール

```powershell
# 利用可能なディストリビューションを確認
wsl --list --online

# Ubuntu最新版をインストール
wsl --install -d Ubuntu

# インストールが完了したら、Ubuntuを起動して、ユーザー名とパスワードを設定します
wsl

# 終了する場合は exit と入力してEnter
```

※ 作成時のパスワードを覚えておいてください

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

- アプリを置きたいフォルダに移動します
  - 後にそのフォルダの中にcaramel-boardフォルダが作成されます
  - 場所はどこでもいいので、最初から外部SSDとかに設置するのもありです
- フォルダの空白を右クリックして、 Windows Terminal を開きます
- gitコマンドでCaramelBoardをクローンします。

```powershell
git clone https://github.com/na-zu-nya/caramel-board.git caramel-board
```

フォルダにcaramel-boardフォルダが作成されていれば成功です

### セットアップ

- Docker Desktopを起動しておきます(今後、CaramelBoardを起動するときは、Docker Desktopを起動しておいてください)
- setup.bat をダブルクリックで実行します
- 案内に従って設定します
  - 初回起動時、Ubuntuのパスワードを求められた場合は、WSL2インストール時に設定したパスワードを入力します(パスワードは表示されませんが入力されているので、打ち込んだらEnterで進めます) 
  - 質問されたら選択肢を数字で入力+Enterで進めます
  - データの保存場所はこの設定で変更できます
    - デフォルトでは、アプリのフォルダ内に data/assets フォルダが作成され、そこに保存されます
    - 別の場所に保存したい場合は、フルパスで指定します (例: D:\CaramelBoardData)
  - 初回実行時は途中ダウンロード中などで待ち時間止まってるように見えることもあります。
  - ちょっと時間がかかりますが、忍耐強く待ちます
- セットアップが完了したら自動的に終了します

### 起動・運用

#### アプリの起動

- serve.bat をダブルクリックで実行することで、サービスが立ち上がります
- API Ready と表示されたら立ち上がり完了です (Terminalは最小化して維持してください。また画面上でコピーをするときは、コマンドではなく右クリックで行ってください)
- 立ち上がった後は、
  - http://localhost:6766
  - http://<ローカルIP>:6766
- でアクセスできます。

#### アプリの停止

- stop.bat をダブルクリックで実行することで、サービスが停止します

#### アプリの更新(gitでダウンロードした場合のみ)

- update.bat をダブルクリックで実行することで、アプリを最新に更新します
- 更新時は自動的に `backups` フォルダへ `pre-update-db-YYYYMMDD-HHMMSS.sql` というDBバックアップを作成します

#### DBバックアップ

- backup.bat をダブルクリックで実行することで、DBバックアップを作成します
- バックアップは `backups` フォルダに `caramel-board-db-YYYYMMDD-HHMMSS.sql` という名前で保存されます

#### 他の端末からアクセスする

- 設定 > ネットワーク > イーサネット > ネットワークプロパティを開き、IPv4アドレスを確認します
- 現在のPCで http://<IPアドレス>:6766 にアクセスできることを確認します
- プロパティから、ネットワークプロファイルを「パブリック」から「プライベート」に変更します
- Windowsキー を押して `Windows Defender ファイアウォール` を検索して開きます
  - 左のメニューから `詳細設定` をクリックします
  - 左のメニューから `受信の規則` をクリックします
  - 右のメニューから `新しい規則...` をクリックします
  - 規則の種類で `ポート` を選択して `次へ`
- 特定のローカルポートに `6766` と入力して `次へ`
  - 接続を許可する を選択して `次へ`
  - ドメイン、プライベート にチェックを入れて `次へ`
  - 名前に `CaramelBoard` と入力して `完了`
- 他の端末から http://<IPアドレス>:6766 にアクセスできることを確認します
