import { Hono } from "hono";
import { html, raw } from "hono/html";

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

const deletePost = async (env: Env, id: number): Promise<boolean> => {
	const { results } = await env.DB.prepare(
		"SELECT r2_key FROM post_images WHERE post_id = ?",
	)
		.bind(id)
		.all<{ r2_key: string }>();
	const post = await env.DB.prepare("SELECT id FROM posts WHERE id = ?")
		.bind(id)
		.first<{ id: number }>();
	if (!post) return false;
	if (results.length > 0) {
		await env.BUCKET.delete(results.map((r) => r.r2_key));
	}
	await env.DB.batch([
		env.DB.prepare("DELETE FROM post_images WHERE post_id = ?").bind(id),
		env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id),
	]);
	return true;
};

const safeExt = (name: string, fallback = "jpg"): string => {
	const m = /\.([a-zA-Z0-9]{1,5})$/.exec(name);
	const ext = m ? m[1].toLowerCase() : fallback;
	const allowed = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
	return allowed.has(ext) ? ext : fallback;
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
.admin-list { list-style: none; padding: 0; }
.admin-list li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.5rem 0; border-bottom: 1px solid #eee; align-items: baseline; }
.admin-list li a { color: inherit; text-decoration: none; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.admin-form { display: grid; gap: 0.75rem; margin: 1.5rem 0; }
.admin-form label { display: grid; gap: 0.25rem; font-size: 0.85em; color: #666; }
.admin-form input, .admin-form textarea { font-family: inherit; font-size: 1rem; padding: 0.4rem 0.5rem; border: 1px solid #ccc; border-radius: 4px; background: transparent; color: inherit; }
.admin-form textarea { min-height: 5em; resize: vertical; }
.admin-form button { padding: 0.5rem 1rem; cursor: pointer; }
#upload-status { font-size: 0.85em; color: #666; min-height: 1.2em; }
footer { margin: 4rem 0 2rem; font-size: 0.85em; color: #888; text-align: center; }
footer a { color: inherit; margin: 0 0.5rem; }
`;

const layout = (opts: {
	title: string;
	description?: string;
	ogImage?: string;
	ogUrl?: string;
	noStore?: boolean;
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
		${opts.noStore ? html`<meta name="robots" content="noindex" />` : ""}
		<style>${PAGE_STYLES}</style>
	</head>
	<body>
		<h1><a href="/">photo-diary</a></h1>
		${opts.body}
		<footer><a href="/api/posts">JSON</a><a href="/admin">admin</a></footer>
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

// Inline script: resize images in-browser to long-edge <= 2048px JPEG, then submit
// as multipart. No upload happens if the user-agent lacks <canvas> support — they
// just see the raw form post error from the server (file too big or unsupported).
const UPLOAD_SCRIPT = `
(function () {
	const MAX_EDGE = 2048;
	const QUALITY = 0.85;
	const form = document.getElementById("new-post-form");
	if (!form) return;
	const status = document.getElementById("upload-status");

	form.addEventListener("submit", async (e) => {
		e.preventDefault();
		const fileInput = form.querySelector('input[type="file"]');
		const files = Array.from(fileInput.files || []);
		if (!files.length) { status.textContent = "select at least one image"; return; }
		const btn = form.querySelector("button[type=submit]");
		btn.disabled = true;
		try {
			status.textContent = "resizing 0/" + files.length;
			const resized = [];
			for (let i = 0; i < files.length; i++) {
				resized.push(await resize(files[i]));
				status.textContent = "resizing " + (i + 1) + "/" + files.length;
			}
			status.textContent = "uploading...";
			const fd = new FormData();
			fd.append("caption", form.caption.value);
			fd.append("posted_on", form.posted_on.value);
			for (const f of resized) fd.append("images", f, f.name);
			const res = await fetch("/admin/posts", { method: "POST", body: fd });
			if (!res.ok) { status.textContent = "upload failed: " + res.status; btn.disabled = false; return; }
			const data = await res.json();
			window.location = data.url || "/admin";
		} catch (err) {
			status.textContent = "error: " + (err && err.message || err);
			btn.disabled = false;
		}
	});

	async function resize(file) {
		const img = await loadImage(file);
		const long = Math.max(img.naturalWidth, img.naturalHeight);
		const scale = Math.min(1, MAX_EDGE / long);
		const w = Math.round(img.naturalWidth * scale);
		const h = Math.round(img.naturalHeight * scale);
		const canvas = document.createElement("canvas");
		canvas.width = w; canvas.height = h;
		canvas.getContext("2d").drawImage(img, 0, 0, w, h);
		const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", QUALITY));
		const name = file.name.replace(/\\.[^.]+$/, "") + ".jpg";
		return new File([blob], name, { type: "image/jpeg" });
	}

	function loadImage(file) {
		return new Promise((resolve, reject) => {
			const url = URL.createObjectURL(file);
			const img = new Image();
			img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
			img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
			img.src = url;
		});
	}
})();
`;

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

app.get("/admin", async (c) => {
	const posts = await getRecentPosts(c.env.DB);
	c.header("Cache-Control", "no-store");
	return c.html(
		layout({
			title: "admin — photo-diary",
			noStore: true,
			body: html`
				<p><a href="/admin/new">+ 新規投稿</a></p>
				${posts.length === 0
					? html`<p class="empty">(まだ投稿なし)</p>`
					: html`<ul class="admin-list">
						${posts.map(
							(p) => html`<li>
								<a href="/post/${p.id}">#${p.id} — ${p.posted_on} — ${p.caption || "(no caption)"} (${p.images.length}枚)</a>
								<form method="POST" action="/admin/posts/${p.id}/delete" onsubmit="return confirm('Delete #${p.id}?')">
									<button type="submit">delete</button>
								</form>
							</li>`,
						)}
					</ul>`}
			`,
		}),
	);
});

app.get("/admin/new", (c) => {
	const today = new Date().toISOString().slice(0, 10);
	c.header("Cache-Control", "no-store");
	return c.html(
		layout({
			title: "new post — photo-diary",
			noStore: true,
			body: html`
				<p><a href="/admin">← admin</a></p>
				<form id="new-post-form" class="admin-form" action="/admin/posts" method="POST" enctype="multipart/form-data">
					<label>images
						<input type="file" name="images" accept="image/*" multiple required />
					</label>
					<label>posted on
						<input type="date" name="posted_on" value="${today}" required />
					</label>
					<label>caption
						<textarea name="caption" placeholder="(optional)"></textarea>
					</label>
					<button type="submit">post</button>
					<div id="upload-status"></div>
				</form>
				<script>${raw(UPLOAD_SCRIPT)}</script>
			`,
		}),
	);
});

app.post("/admin/posts", async (c) => {
	const formData = await c.req.formData();
	const caption = String(formData.get("caption") ?? "").trim();
	const today = new Date().toISOString().slice(0, 10);
	const posted_on = String(formData.get("posted_on") ?? today) || today;
	const files = formData
		.getAll("images")
		.filter((v): v is File => v instanceof File && v.size > 0);
	if (files.length === 0) return c.json({ error: "no images" }, 400);

	const inserted = await c.env.DB.prepare(
		"INSERT INTO posts (caption, posted_on) VALUES (?, ?)",
	)
		.bind(caption, posted_on)
		.run();
	const postId = Number(inserted.meta.last_row_id);

	const imageInserts: D1PreparedStatement[] = [];
	await Promise.all(
		files.map(async (file, i) => {
			const ext = safeExt(file.name);
			const shortHash = crypto.randomUUID().slice(0, 8);
			const key = `posts/${postId}/${i}-${shortHash}.${ext}`;
			await c.env.BUCKET.put(key, await file.arrayBuffer(), {
				httpMetadata: { contentType: file.type || "image/jpeg" },
			});
			imageInserts.push(
				c.env.DB.prepare(
					"INSERT INTO post_images (post_id, r2_key, sort_order) VALUES (?, ?, ?)",
				).bind(postId, key, i),
			);
		}),
	);
	if (imageInserts.length > 0) await c.env.DB.batch(imageInserts);

	return c.json({ ok: true, id: postId, url: `/post/${postId}` });
});

app.delete("/admin/posts/:id{[0-9]+}", async (c) => {
	const id = Number(c.req.param("id"));
	const ok = await deletePost(c.env, id);
	if (!ok) return c.json({ error: "not found" }, 404);
	return c.json({ ok: true });
});

// HTML-form-friendly variant (browsers can't POST DELETE from <form>)
app.post("/admin/posts/:id{[0-9]+}/delete", async (c) => {
	const id = Number(c.req.param("id"));
	const ok = await deletePost(c.env, id);
	if (!ok) return c.notFound();
	return c.redirect("/admin");
});

export default app;
