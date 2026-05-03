# cf — Cloudflare 実験リポジトリ

Cloudflare の各プロダクトを触って試すための実験用モノレポ。
各実験は `experiments/<name>/` 配下の独立したディレクトリに置く(各々が自分の `package.json` / `wrangler.toml` を持つ)。

## ディレクトリ構成

```
cf/
├── experiments/
│   └── <name>/        # 各実験ごとに独立したディレクトリ
└── README.md
```

## 触りたいもの (チェックリスト)

- [ ] Workers (Hono / 素の fetch handler)
- [ ] Pages (静的サイト + Functions)
- [ ] D1 (SQLite)
- [ ] KV (key-value)
- [ ] R2 (object storage)
- [ ] Durable Objects
- [ ] Queues
- [ ] Workers AI
- [ ] Vectorize
- [ ] Cron Triggers
- [ ] Workflows

## 新しい実験を始める

`experiments/<name>/` を作り、その中で初期化:

```sh
cd experiments/<name>
bunx wrangler init   # or: npm create cloudflare@latest .
```

ローカル実行:

```sh
bunx wrangler dev
```

デプロイ:

```sh
bunx wrangler deploy
```

## 認証

```sh
bunx wrangler login
```

シークレットは `.dev.vars` (ローカル) と `wrangler secret put` (本番) を使う。
両方とも gitignore 済み。
