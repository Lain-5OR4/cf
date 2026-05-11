# photo-diary の /admin を Cloudflare Access で守る

`/admin*` 配下(投稿フォーム・投稿一覧・作成/削除エンドポイント)を、Cloudflare Zero Trust の Access Application でロックする手順。`/`、`/post/:id`、`/images/:key`、`/api/posts` は **完全公開** のまま。

Worker のコードには **一切認証ロジックを書かない**。Cloudflare のエッジで JWT 検証されてから Worker に届く。

## 前提

- Worker は workers.dev のサブドメイン or 独自ドメインにデプロイ済み (`bun run deploy`)
- 公開URLを把握している(例: `photo-diary.<account-subdomain>.workers.dev` または `your-domain.com`)
- Cloudflare アカウントに紐づいたメールアドレスを把握している

## ⚠️ 順序が重要

`/admin*` は何のチェックもなくデプロイされた瞬間、URLを知っている誰でも投稿できる。**Access Application を作ってから初めて公開URLを共有する**こと。

開発フローとしては:

1. **先にローカルで Phase 0-2 を完成させる**(`bun run test` がpassする状態)
2. `bun run deploy` で workers.dev にデプロイ
3. **公開する前に**この手順で Access Application を作る
4. 別ブラウザ(未ログイン)で `/admin` を踏んで Cloudflare のログイン画面に出ることを確認
5. 同じブラウザで `/` を踏んで素通しなことを確認
6. ここまで完了したら他人に URL を共有してOK

## 1. Zero Trust ダッシュボードを開く

https://one.dash.cloudflare.com/ → アカウントを選択 → **Zero Trust** に入る。

初回はチーム名(`<team>.cloudflareaccess.com`)を作る必要がある。任意の名前でOK。

## 2. Application を追加

Zero Trust ダッシュボードで:

- 左メニュー: **Access → Applications**
- 右上の **Add an application** をクリック
- **Self-hosted** を選択

## 3. Application 設定

| 項目 | 値 |
|---|---|
| Application name | `photo-diary admin` |
| Session Duration | `24 hours`(任意。短くしたければ短く) |
| Application domain | host: `photo-diary.<account>.workers.dev`、path: `admin*` |

**path は `admin*` または `admin/*`**。先頭の `/` は不要(UIが補完する)。`*` はトレイリングで子パス全部にマッチ。

→ 続けて **Next** で Policy 設定に進む。

## 4. Policy を作成

- Policy name: `me only`
- Action: **Allow**
- Include 条件:
	- Selector: **Emails**
	- Value: `inazumahp@gmail.com`(自分の Cloudflare アカウントに紐づくメール)

複数許可したくなったら同じ Policy 内に追加すればOK。

→ **Next** で次の画面、デフォルトのままで **Add application**。

## 5. Identity Provider

デフォルトの **One-time PIN** が最も楽。指定したメールに毎回6桁コードが届くだけ。

凝りたければ:
- **Google** (個人用 Google アカウント)→ OAuth クライアントを Cloudflare 側で発行する一時的な手順が必要
- **GitHub** → 同上

`Settings → Authentication → Add new` で追加。

## 6. 動作確認

ローカルではなく **本番URL** に対して行う:

```sh
# 公開ページは素通し(Access challenge が無いこと)
curl -sI https://photo-diary.<account>.workers.dev/ | head -3

# /admin は Access のログイン画面にリダイレクトされる
curl -sI https://photo-diary.<account>.workers.dev/admin | head -5
# → Location: https://<team>.cloudflareaccess.com/cdn-cgi/access/... と出ればOK

# /api/posts も素通し(誰でも読める)
curl -sS https://photo-diary.<account>.workers.dev/api/posts | head -c 200
```

ブラウザでは `/admin` を踏んだ瞬間、`<team>.cloudflareaccess.com` のフォームに飛び、メール認証後 `/admin` に戻る。

## ローカル開発 (`wrangler dev`) との関係

`wrangler dev` で起動するローカルサーバーは **Cloudflare のエッジを通らない** ので、Access は **効かない**。`/admin/new` も `/admin/posts` POST も認証なしで叩ける。これは意図通り(開発しやすさ優先)。

「本番でだけロックされる」という挙動を承知の上で使う。

## エッジから何が渡ってくるか(任意)

Access を通過したリクエストには以下のヘッダーが付く:

- `Cf-Access-Authenticated-User-Email` — 認証済みユーザーのメール
- `Cf-Access-Jwt-Assertion` — エッジが署名したJWT(検証可能)

Worker 側で「念のため」これらをチェックするのは可能だが、本リポでは**書かない**方針:

- ヘッダーは Cloudflare のエッジでしか付かない → workers.dev / 独自ドメイン経由でない限り届かない
- bypass するには Access Service Token を発行するなど Cloudflare 側操作が必要
- 「コードで守る」より「Application の path を `admin*` に正しく合わせる」のが本質

将来「もっと厳密にしたい」と感じたら、`hono/jwt` で `Cf-Access-Jwt-Assertion` を team の公開鍵(`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`)で検証する middleware を `/admin` に挟む形になる。今は不要。

## よくある詰まりどころ

| 症状 | 原因 |
|---|---|
| `/admin` を踏んでも素通しで投稿できてしまう | Application の domain/path のミス。`*` を忘れたか、host名が違う |
| 別の Cloudflare アカウントに作ってしまった | Zero Trust は アカウント単位。Worker と同じアカウントで作る |
| ローカル `wrangler dev` でも認証画面が出ない | これは正常。エッジを通らないので Access は作用しない |
| メールに PIN が届かない | スパムフォルダ確認。SPF/受信ルールに引っかかっていないか |
| `Cf-Access-Authenticated-User-Email` が Worker に届かない | 本番URLで叩いてない、または Application が無効化されている |

## カスタムドメインに移行したとき

`<custom-domain>/admin*` で新しい Application を作る(または既存の domain を編集)。workers.dev 用の Application は不要になれば削除でいい。

## 参考

- 公式: https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/
- Access ヘッダー仕様: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/application-token/
- 無料枠: 50 ユーザーまで Zero Trust 無料(2026-05 時点)
