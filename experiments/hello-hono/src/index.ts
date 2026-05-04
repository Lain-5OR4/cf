import { Hono } from "hono";
import { html } from "hono/html";

type Message = { id: number; text: string; created_at: string };

const app = new Hono<{ Bindings: Env }>();

const listMessages = (db: D1Database) =>
	db
		.prepare("SELECT id, text, created_at FROM messages ORDER BY id")
		.all<Message>();

app.get("/", async (c) => {
	const { results } = await listMessages(c.env.DB);
	return c.html(html`<!doctype html>
<html lang="ja">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>hello-hono</title>
		<style>
			body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.6; }
			code { background: #f4f4f4; padding: 0.1em 0.3em; border-radius: 3px; }
			.msg { padding: 0.5rem 0.75rem; border-left: 3px solid #ccc; margin: 0.5rem 0; }
			.msg time { font-size: 0.8em; color: #888; display: block; }
		</style>
	</head>
	<body>
		<h1>hello, hono on workers 👋</h1>
		<p>D1 から取ってきた messages:</p>
		${results.length === 0
			? html`<p><em>(no rows yet)</em></p>`
			: results.map(
				(m) => html`<div class="msg">
					<div>${m.text}</div>
					<time>${m.created_at} (id=${m.id})</time>
				</div>`,
			)}
		<hr />
		<ul>
			<li><a href="/api/messages">/api/messages</a> — JSON</li>
			<li><a href="/api/uuid">/api/uuid</a> — random UUID</li>
		</ul>
	</body>
</html>`);
});

app.get("/api/messages", async (c) => {
	const { results } = await listMessages(c.env.DB);
	return c.json(results);
});

app.get("/api/uuid", (c) => c.text(crypto.randomUUID()));

export default app;
