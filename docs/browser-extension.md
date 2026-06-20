# Browser Extension

Caramel Board のブラウザ拡張は、Chrome Manifest V3 で動作します。
表示言語はChromeの言語設定に従い、日本語と英語に対応します。

公開用のプライバシーポリシーは [ブラウザ拡張プライバシーポリシー](./browser-extension-privacy-policy.md) を使います。

## 対応範囲

- 右クリックした画像を拡張側で取得し、Caramel Boardへアップロードする
- 右クリックした動画は、`http` / `https` の直URLだけ対象にする
- `blob:`、HLS/DASH、DRM、YouTubeやniconicoなどのストリーミングプレイヤーは対象外
- 拡張側取得に失敗した場合のみ、既存のURL取り込みAPIにフォールバックする

## 使い方

1. Chromeで `chrome://extensions` を開く
2. デベロッパーモードを有効にする
3. 「パッケージ化されていない拡張機能を読み込む」から `apps/chrome-extension` を選ぶ
4. 拡張の設定画面でAPI URLを確認する
5. Caramel Board の「一般設定」で Clipper 連携キーを発行する
6. 発行されたキーを拡張の設定画面に貼り付ける
7. 「保存」または「接続を確認」を実行する

Desktop版の既定URLは `http://127.0.0.1:6777` です。
開発サーバ単体の既定URLは `http://127.0.0.1:6766` です。
公開版 Chrome 拡張のOriginは `chrome-extension://hmbbjgdimepjnnpbedcdhidcfhgllcjo` です。
このOriginは既定で許可されます。
開発中の未パッケージ拡張や独自のWebフロントエンドから直接APIを呼ぶ場合は、`CARAMEL_CORS_ORIGINS` に許可するOriginをカンマ区切りで指定します。
APIの書き込み系リクエストは、信頼していないブラウザOriginからのアクセスを拒否します。

## 認証

Clipper から API を呼び出すには、Caramel Board 側で発行した Clipper 連携キーが必要です。
連携キーはサーバ側の設定ファイルに base64url で保存されます。

Basic Authを有効にしている場合は、Clipper 連携キーとは別に、拡張の設定画面にユーザー名とパスワードを設定します。
保護済みライブラリは、設定画面のライブラリ一覧からパスワード認証します。
Clipper 連携キーが設定されている場合、設定保存時・接続確認時・Clipper 連携キーの貼り付け保存時にライブラリ一覧を自動更新します。
必要な場合は「ライブラリ更新」ボタンで手動更新もできます。

## 実装メモ

右クリックメニューは `image` / `video` コンテキストに限定しています。
メニューは `http` / `https` の対象URLにだけ表示されるため、`blob:` 動画には表示されません。
画像と直URL動画を拡張側でBlob取得するため、`http://*/*` / `https://*/*` の `host_permissions` を静的に要求します。
実行時の権限要求は、右クリック後の非同期処理でユーザー操作扱いが失われやすいため使っていません。
追加結果はOS通知ではなく、右クリックされたタブに一時的に注入するページ内トーストで表示します。
成功時は元画像のサムネイルを表示し、スタックIDを取得できた場合はクリックで該当スタックを別タブで開きます。
content scriptは常駐せず、操作時だけ `chrome.scripting.executeScript` で注入します。
