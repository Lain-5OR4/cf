import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) =>
	c.html(`<!doctype html>
<html lang="ja">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>hello-hono</title>
		<style>
			body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.6; }
			code { background: #f4f4f4; padding: 0.1em 0.3em; border-radius: 3px; }
		</style>
	</head>
	<body>
		<h1>hello, hono on workers 👋</h1>
		<p>これは Cloudflare Workers 上で動く Hono アプリです。</p>
		<ul>
			<li><a href="/api/hello">/api/hello</a> — JSON</li>
			<li><a href="/api/uuid">/api/uuid</a> — random UUID</li>
		</ul>
	</body>
</html>`),
);

app.get("/api/hello", (c) => c.json({ message: "Hello, World!" }));
app.get("/api/uuid", (c) => c.text(crypto.randomUUID()));

export default app;
