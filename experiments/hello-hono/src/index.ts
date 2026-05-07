import { Hono } from "hono";
import { html } from "hono/html";

type Message = { id: number; text: string; created_at: string };

const app = new Hono<{ Bindings: Env }>();

const listMessages = (db: D1Database) =>
	db
		.prepare("SELECT id, text, created_at FROM messages ORDER BY id")
		.all<Message>();

const listImages = (bucket: R2Bucket) => bucket.list();

app.get("/", async (c) => {
	const [messages, images] = await Promise.all([
		listMessages(c.env.DB),
		listImages(c.env.BUCKET),
	]);
	return c.html(html`<!doctype html>
<html lang="ja">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>hello-hono</title>
		<style>
			body { font-family: system-ui, sans-serif; max-width: 48rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.6; }
			code { background: #f4f4f4; padding: 0.1em 0.3em; border-radius: 3px; }
			.msg { padding: 0.5rem 0.75rem; border-left: 3px solid #ccc; margin: 0.5rem 0; }
			.msg time { font-size: 0.8em; color: #888; display: block; }
			.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.75rem; margin: 1rem 0; }
			.gallery figure { margin: 0; }
			.gallery img { width: 100%; height: 140px; object-fit: cover; border-radius: 6px; display: block; }
			.gallery figcaption { font-size: 0.75em; color: #666; margin-top: 0.25rem; }
		</style>
	</head>
	<body>
		<h1>hello, hono on workers 👋</h1>

		<h2>D1 messages</h2>
		${messages.results.length === 0
			? html`<p><em>(no rows yet)</em></p>`
			: messages.results.map(
				(m) => html`<div class="msg">
					<div>${m.text}</div>
					<time>${m.created_at} (id=${m.id})</time>
				</div>`,
			)}

		<h2>R2 images</h2>
		${images.objects.length === 0
			? html`<p><em>(bucket is empty)</em></p>`
			: html`<div class="gallery">
				${images.objects.map(
					(o) => html`<figure>
						<img src="/images/${o.key}" alt="${o.key}" loading="lazy" />
						<figcaption>${o.key} — ${(o.size / 1024).toFixed(1)} KB</figcaption>
					</figure>`,
				)}
			</div>`}

		<hr />
		<ul>
			<li><a href="/api/messages">/api/messages</a> — D1 rows as JSON</li>
			<li><a href="/api/images">/api/images</a> — R2 object list as JSON</li>
			<li><a href="/api/uuid">/api/uuid</a> — random UUID</li>
		</ul>
	</body>
</html>`);
});

app.get("/api/messages", async (c) => {
	const { results } = await listMessages(c.env.DB);
	return c.json(results);
});

app.get("/api/images", async (c) => {
	const { objects } = await listImages(c.env.BUCKET);
	return c.json(
		objects.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded })),
	);
});

app.get("/images/:key{.+}", async (c) => {
	const key = c.req.param("key");
	const obj = await c.env.BUCKET.get(key);
	if (!obj) return c.notFound();

	const headers = new Headers();
	obj.writeHttpMetadata(headers);
	headers.set("etag", obj.httpEtag);
	headers.set("cache-control", "public, max-age=3600");
	return new Response(obj.body, { headers });
});

app.get("/api/uuid", (c) => c.text(crypto.randomUUID()));

export default app;
