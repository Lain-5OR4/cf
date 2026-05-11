import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

const setupSchema = async () => {
	await env.DB.prepare(
		"CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, caption TEXT NOT NULL DEFAULT '', posted_on TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
	).run();
	await env.DB.prepare(
		"CREATE TABLE IF NOT EXISTS post_images (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, r2_key TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0, width INTEGER, height INTEGER)",
	).run();
};

const seedTwoPosts = async () => {
	await env.DB.prepare("DELETE FROM post_images").run();
	await env.DB.prepare("DELETE FROM posts").run();
	await env.DB.batch([
		env.DB.prepare(
			"INSERT INTO posts (id, caption, posted_on) VALUES (1, 'old post', '2026-05-08')",
		),
		env.DB.prepare(
			"INSERT INTO posts (id, caption, posted_on) VALUES (2, 'newer carousel post', '2026-05-10')",
		),
		env.DB.prepare(
			"INSERT INTO post_images (post_id, r2_key, sort_order) VALUES (1, 'posts/1/0-aaa.jpg', 0)",
		),
		env.DB.prepare(
			"INSERT INTO post_images (post_id, r2_key, sort_order) VALUES (2, 'posts/2/0-bbb.jpg', 0)",
		),
		env.DB.prepare(
			"INSERT INTO post_images (post_id, r2_key, sort_order) VALUES (2, 'posts/2/1-ccc.jpg', 1)",
		),
	]);
	await env.BUCKET.put("posts/1/0-aaa.jpg", JPEG_BYTES, {
		httpMetadata: { contentType: "image/jpeg" },
	});
	await env.BUCKET.put("posts/2/0-bbb.jpg", JPEG_BYTES, {
		httpMetadata: { contentType: "image/jpeg" },
	});
	await env.BUCKET.put("posts/2/1-ccc.jpg", JPEG_BYTES, {
		httpMetadata: { contentType: "image/jpeg" },
	});
};

beforeAll(async () => {
	await setupSchema();
	await seedTwoPosts();
});

describe("photo-diary read path", () => {
	it("GET / lists posts in posted_on DESC order with image URLs", async () => {
		const res = await SELF.fetch("http://example.com/");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("newer carousel post");
		expect(body).toContain("old post");
		expect(body.indexOf("newer carousel post")).toBeLessThan(
			body.indexOf("old post"),
		);
		expect(body).toContain("/images/posts/2/0-bbb.jpg");
		expect(body).toContain("/images/posts/2/1-ccc.jpg");
	});

	it("GET /post/:id renders OGP tags with the first image as og:image", async () => {
		const res = await SELF.fetch("http://example.com/post/2");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('property="og:image"');
		expect(body).toContain("/images/posts/2/0-bbb.jpg");
		expect(body).toContain('property="og:url"');
		expect(body).toContain('content="article"');
		expect(body).toContain('name="twitter:card"');
	});

	it("GET /post/:id returns 404 for unknown id", async () => {
		const res = await SELF.fetch("http://example.com/post/999");
		expect(res.status).toBe(404);
	});

	it("GET /images/:key serves bytes from R2 with immutable cache", async () => {
		const res = await SELF.fetch(
			"http://example.com/images/posts/1/0-aaa.jpg",
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/jpeg");
		expect(res.headers.get("cache-control")).toContain("immutable");
		const bytes = new Uint8Array(await res.arrayBuffer());
		expect(bytes).toEqual(JPEG_BYTES);
	});

	it("GET /images/:key returns 404 for missing keys", async () => {
		const res = await SELF.fetch("http://example.com/images/posts/0/nope.jpg");
		expect(res.status).toBe(404);
	});

	it("GET /api/posts merges images into each post", async () => {
		const res = await SELF.fetch("http://example.com/api/posts");
		const posts = (await res.json()) as Array<{
			id: number;
			caption: string;
			images: string[];
		}>;
		expect(posts).toHaveLength(2);
		expect(posts.find((p) => p.id === 2)?.images).toEqual([
			"posts/2/0-bbb.jpg",
			"posts/2/1-ccc.jpg",
		]);
		expect(posts.find((p) => p.id === 1)?.images).toEqual([
			"posts/1/0-aaa.jpg",
		]);
	});
});

describe("photo-diary admin pages", () => {
	it("GET /admin shows existing posts with delete forms and no-store", async () => {
		const res = await SELF.fetch("http://example.com/admin");
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toContain("no-store");
		const body = await res.text();
		expect(body).toContain("/admin/new");
		expect(body).toContain("newer carousel post");
		expect(body).toContain('action="/admin/posts/2/delete"');
	});

	it("GET /admin/new returns the upload form with the resize script", async () => {
		const res = await SELF.fetch("http://example.com/admin/new");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('id="new-post-form"');
		expect(body).toContain('enctype="multipart/form-data"');
		expect(body).toContain('name="images"');
		expect(body).toContain('name="posted_on"');
		expect(body).toContain("canvas.toBlob"); // resize script present
	});
});

describe("photo-diary write path", () => {
	it("POST /admin/posts creates a post and stores images in R2", async () => {
		const fd = new FormData();
		fd.append("caption", "via multipart");
		fd.append("posted_on", "2026-05-12");
		fd.append("images", new Blob([JPEG_BYTES], { type: "image/jpeg" }), "a.jpg");
		fd.append("images", new Blob([JPEG_BYTES], { type: "image/jpeg" }), "b.png");

		const res = await SELF.fetch("http://example.com/admin/posts", {
			method: "POST",
			body: fd,
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as { ok: boolean; id: number; url: string };
		expect(data.ok).toBe(true);
		expect(data.url).toBe(`/post/${data.id}`);

		// Visible on feed
		const feed = await (await SELF.fetch("http://example.com/")).text();
		expect(feed).toContain("via multipart");

		// 2 R2 objects under posts/<id>/
		const r2 = await env.BUCKET.list({ prefix: `posts/${data.id}/` });
		expect(r2.objects).toHaveLength(2);
		// keys carry sort_order prefixes
		const keys = r2.objects.map((o) => o.key).sort();
		expect(keys[0]).toMatch(new RegExp(`^posts/${data.id}/0-[a-f0-9]{8}\\.jpg$`));
		expect(keys[1]).toMatch(new RegExp(`^posts/${data.id}/1-[a-f0-9]{8}\\.png$`));

		// DB has 2 image rows
		const { results } = await env.DB.prepare(
			"SELECT r2_key, sort_order FROM post_images WHERE post_id = ? ORDER BY sort_order",
		)
			.bind(data.id)
			.all<{ r2_key: string; sort_order: number }>();
		expect(results).toHaveLength(2);
		expect(results[0].sort_order).toBe(0);
		expect(results[1].sort_order).toBe(1);
	});

	it("POST /admin/posts with no images returns 400", async () => {
		const fd = new FormData();
		fd.append("caption", "no files");
		fd.append("posted_on", "2026-05-12");
		const res = await SELF.fetch("http://example.com/admin/posts", {
			method: "POST",
			body: fd,
		});
		expect(res.status).toBe(400);
	});

	it("DELETE /admin/posts/:id removes the post and its R2 objects", async () => {
		// Create one to delete
		const fd = new FormData();
		fd.append("caption", "delete me");
		fd.append("posted_on", "2026-05-12");
		fd.append("images", new Blob([JPEG_BYTES], { type: "image/jpeg" }), "x.jpg");
		const created = (await (
			await SELF.fetch("http://example.com/admin/posts", { method: "POST", body: fd })
		).json()) as { id: number };

		const before = await env.BUCKET.list({ prefix: `posts/${created.id}/` });
		expect(before.objects.length).toBeGreaterThan(0);

		const res = await SELF.fetch(
			`http://example.com/admin/posts/${created.id}`,
			{ method: "DELETE" },
		);
		expect(res.status).toBe(200);

		const after = await env.BUCKET.list({ prefix: `posts/${created.id}/` });
		expect(after.objects).toHaveLength(0);

		const row = await env.DB.prepare("SELECT id FROM posts WHERE id = ?")
			.bind(created.id)
			.first();
		expect(row).toBeNull();
	});

	it("POST /admin/posts/:id/delete (form fallback) redirects to /admin", async () => {
		const fd = new FormData();
		fd.append("caption", "delete via form");
		fd.append("posted_on", "2026-05-12");
		fd.append("images", new Blob([JPEG_BYTES], { type: "image/jpeg" }), "y.jpg");
		const created = (await (
			await SELF.fetch("http://example.com/admin/posts", { method: "POST", body: fd })
		).json()) as { id: number };

		const res = await SELF.fetch(
			`http://example.com/admin/posts/${created.id}/delete`,
			{ method: "POST", redirect: "manual" },
		);
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/admin");

		const row = await env.DB.prepare("SELECT id FROM posts WHERE id = ?")
			.bind(created.id)
			.first();
		expect(row).toBeNull();
	});

	it("DELETE /admin/posts/:id returns 404 for unknown id", async () => {
		const res = await SELF.fetch("http://example.com/admin/posts/9999", {
			method: "DELETE",
		});
		expect(res.status).toBe(404);
	});
});
