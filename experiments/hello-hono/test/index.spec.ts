import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(async () => {
	await env.DB.prepare(
		"CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
	).run();
	await env.DB.prepare("DELETE FROM messages").run();
	await env.DB.batch([
		env.DB.prepare("INSERT INTO messages (text) VALUES (?)").bind("test row 1"),
		env.DB.prepare("INSERT INTO messages (text) VALUES (?)").bind("test row 2"),
	]);

	await env.BUCKET.put("alpha.jpg", new Uint8Array([0xff, 0xd8, 0xff]), {
		httpMetadata: { contentType: "image/jpeg" },
	});
	await env.BUCKET.put("beta.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
		httpMetadata: { contentType: "image/jpeg" },
	});
});

describe("hello-hono", () => {
	it("GET / returns HTML with messages from D1 and image gallery", async () => {
		const res = await SELF.fetch("http://example.com/");
		expect(res.headers.get("content-type")).toMatch(/text\/html/);
		const body = await res.text();
		expect(body).toContain("hello, hono on workers");
		expect(body).toContain("test row 1");
		expect(body).toContain("/images/alpha.jpg");
		expect(body).toContain("/images/beta.jpg");
	});

	it("GET /api/messages returns rows from D1", async () => {
		const res = await SELF.fetch("http://example.com/api/messages");
		const rows = (await res.json()) as Array<{ text: string }>;
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.text)).toEqual(["test row 1", "test row 2"]);
	});

	it("GET /api/images returns objects from R2", async () => {
		const res = await SELF.fetch("http://example.com/api/images");
		const objs = (await res.json()) as Array<{ key: string; size: number }>;
		expect(objs.map((o) => o.key).sort()).toEqual(["alpha.jpg", "beta.jpg"]);
	});

	it("GET /images/:key serves an image with correct content-type", async () => {
		const res = await SELF.fetch("http://example.com/images/alpha.jpg");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/jpeg");
		const buf = new Uint8Array(await res.arrayBuffer());
		expect(buf).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
	});

	it("GET /images/:key returns 404 for missing keys", async () => {
		const res = await SELF.fetch("http://example.com/images/nonexistent.jpg");
		expect(res.status).toBe(404);
	});

	it("GET /api/uuid returns a UUID", async () => {
		const res = await SELF.fetch("http://example.com/api/uuid");
		expect(await res.text()).toMatch(
			/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/,
		);
	});
});
