import { Hono } from "hono";
import { html } from "hono/html";

type Post = { id: number; caption: string; posted_on: string };
type ImageRow = { post_id: number; r2_key: string; sort_order: number };
type PostWithImages = Post & { images: string[] };

const app = new Hono<{ Bindings: Env }>();

const mergeImages = (posts: Post[], images: ImageRow[]): PostWithImages[] => {
	const byPost = new Map<number, string[]>();
	for (const r of images) {
		const arr = byPost.get(r.post_id);
		if (arr) arr.push(r.r2_key);
		else byPost.set(r.post_id, [r.r2_key]);
	}
	return posts.map((p) => ({ ...p, images: byPost.get(p.id) ?? [] }));
};

const getRecentPosts = async (
	db: D1Database,
	limit = 50,
): Promise<PostWithImages[]> => {
	const [posts, images] = await Promise.all([
		db
			.prepare(
				"SELECT id, caption, posted_on FROM posts ORDER BY posted_on DESC, id DESC LIMIT ?",
			)
			.bind(limit)
			.all<Post>(),
		db
			.prepare(
				"SELECT post_id, r2_key, sort_order FROM post_images ORDER BY post_id, sort_order",
			)
			.all<ImageRow>(),
	]);
	return mergeImages(posts.results, images.results);
};

const getPost = async (
	db: D1Database,
	id: number,
): Promise<PostWithImages | null> => {
	const post = await db
		.prepare("SELECT id, caption, posted_on FROM posts WHERE id = ?")
		.bind(id)
		.first<Post>();
	if (!post) return null;
	const imgs = await db
		.prepare(
			"SELECT post_id, r2_key, sort_order FROM post_images WHERE post_id = ? ORDER BY sort_order",
		)
		.bind(id)
		.all<ImageRow>();
	return { ...post, images: imgs.results.map((r) => r.r2_key) };
};

const PAGE_STYLES = `
:root { color-scheme: light dark; }
body { font-family: system-ui, sans-serif; max-width: 38rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
h1 { font-size: 1.4rem; margin: 0 0 2rem; }
h1 a { color: inherit; text-decoration: none; }
.post { margin: 0 0 3rem; }
.post header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem; font-size: 0.85em; color: #888; }
.post header a { color: inherit; text-decoration: none; }
.post .caption { margin: 0.75rem 0 0; white-space: pre-wrap; }
.carousel { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: 4px; border-radius: 6px; background: #f4f4f4; -webkit-overflow-scrolling: touch; }
.carousel img { flex: 0 0 100%; scroll-snap-align: start; width: 100%; max-height: 80vh; object-fit: contain; display: block; }
.empty { color: #888; font-style: italic; }
footer { margin: 4rem 0 2rem; font-size: 0.85em; color: #888; text-align: center; }
footer a { color: inherit; }
`;

const layout = (opts: {
	title: string;
	description?: string;
	ogImage?: string;
	ogUrl?: string;
	body: ReturnType<typeof html>;
}) => html`<!doctype html>
<html lang="ja">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>${opts.title}</title>
		${opts.description
			? html`<meta name="description" content="${opts.description}" />`
			: ""}
		<meta property="og:title" content="${opts.title}" />
		${opts.description
			? html`<meta property="og:description" content="${opts.description}" />`
			: ""}
		${opts.ogImage
			? html`<meta property="og:image" content="${opts.ogImage}" />`
			: ""}
		${opts.ogUrl ? html`<meta property="og:url" content="${opts.ogUrl}" />` : ""}
		<meta property="og:type" content="${opts.ogImage ? "article" : "website"}" />
		<meta name="twitter:card" content="summary_large_image" />
		<style>${PAGE_STYLES}</style>
	</head>
	<body>
		<h1><a href="/">photo-diary</a></h1>
		${opts.body}
		<footer><a href="/api/posts">JSON</a></footer>
	</body>
</html>`;

const renderPost = (p: PostWithImages) => html`<article class="post">
	<header>
		<time>${p.posted_on}</time>
		<a href="/post/${p.id}">#${p.id}</a>
	</header>
	${p.images.length > 0
		? html`<div class="carousel">
			${p.images.map(
				(key, i) => html`<img
					src="/images/${key}"
					alt="${p.caption} (${i + 1}/${p.images.length})"
					loading="lazy"
				/>`,
			)}
		</div>`
		: ""}
	${p.caption ? html`<p class="caption">${p.caption}</p>` : ""}
</article>`;

app.get("/", async (c) => {
	const posts = await getRecentPosts(c.env.DB);
	c.header("Cache-Control", "public, max-age=60, s-maxage=300");
	return c.html(
		layout({
			title: "photo-diary",
			description: "個人の写真日記",
			body:
				posts.length === 0
					? html`<p class="empty">(no posts yet)</p>`
					: html`${posts.map(renderPost)}`,
		}),
	);
});

app.get("/post/:id{[0-9]+}", async (c) => {
	const id = Number(c.req.param("id"));
	const post = await getPost(c.env.DB, id);
	if (!post) return c.notFound();

	const origin = new URL(c.req.url).origin;
	const ogImage = post.images[0]
		? `${origin}/images/${post.images[0]}`
		: undefined;
	const ogUrl = `${origin}/post/${post.id}`;
	const description = post.caption || `posted on ${post.posted_on}`;
	const title = post.caption
		? `${post.caption.slice(0, 60)} — photo-diary`
		: `#${post.id} — photo-diary`;

	c.header("Cache-Control", "public, max-age=60, s-maxage=300");
	return c.html(
		layout({ title, description, ogImage, ogUrl, body: renderPost(post) }),
	);
});

app.get("/api/posts", async (c) => {
	const posts = await getRecentPosts(c.env.DB);
	return c.json(posts);
});

app.get("/images/:key{.+}", async (c) => {
	const key = c.req.param("key");
	const obj = await c.env.BUCKET.get(key);
	if (!obj) return c.notFound();

	const headers = new Headers();
	obj.writeHttpMetadata(headers);
	headers.set("etag", obj.httpEtag);
	headers.set("cache-control", "public, max-age=31536000, immutable");
	return new Response(obj.body, { headers });
});

export default app;
