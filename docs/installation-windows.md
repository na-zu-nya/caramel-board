# インストレーションガイド - Windows

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

- Windows Terminalを開いて、インストールしたいフォルダに移動します。
- gitコマンドでCaramelBoardをクローンします。

例: 自分のフォルダ直下に app フォルダを作ってインストールする場合($はコピペしないでね)
- appフォルダを作成して移動
- 右クリックして Windows Terminal を開くと便利です
```powershell
git clone https://github.com/na-zu-nya/caramel-board.git caramel-board
```

- appフォルダにcaramel-boardフォルダが作成されていれば成功です

### セットアップ

- Windows Terminalで、caramel-boardフォルダに移動して、 setup.bat を実行します。(ダブルクリックでOK)
- 案内に従って設定します
  - 初回起動時、Ubuntuのパスワードを求められた場合は、WSL2インストール時に設定したパスワードを入力します(パスワードは表示されませんが入力されているので、打ち込んだらEnterで進めます) 
  - 質問されたら選択肢を数字で入力+Enterで進めます 
  - 途中ダウンロード中などで待ち時間止まってるように見えることもあります。
  - ちょっと時間がかかりますが、忍耐強く待ちます

### 起動・運用
#### アプリの起動

- Windows Terminalで、caramel-boardフォルダに移動して、 serve.batを実行します。(ダブルクリックでOK)

#### 他の端末からアクセスする

- 設定 > ネットワーク > イーサネット > ネットワークプロパティを開き、IPv4アドレスを確認します
- プロパティから、ネットワークプロファイルを「パブリック」から「プライベート」に変更します
- ブラウザで、以下のURLにアクセスします
- http://<IPアドレス>:9000
