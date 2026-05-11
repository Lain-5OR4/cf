import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

beforeAll(async () => {
	await env.DB.prepare(
		"CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, caption TEXT NOT NULL DEFAULT '', posted_on TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
	).run();
	await env.DB.prepare(
		"CREATE TABLE IF NOT EXISTS post_images (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, r2_key TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0, width INTEGER, height INTEGER)",
	).run();
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
});

describe("photo-diary Phase 1", () => {
	it("GET / lists posts in posted_on DESC order with image URLs", async () => {
		const res = await SELF.fetch("http://example.com/");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("newer carousel post");
		expect(body).toContain("old post");
		// newer should appear before older in the HTML
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
		const p2 = posts.find((p) => p.id === 2);
		expect(p2?.images).toEqual(["posts/2/0-bbb.jpg", "posts/2/1-ccc.jpg"]);
		const p1 = posts.find((p) => p.id === 1);
		expect(p1?.images).toEqual(["posts/1/0-aaa.jpg"]);
	});
});
