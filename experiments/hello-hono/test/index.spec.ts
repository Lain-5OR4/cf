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
});

describe("hello-hono", () => {
	it("GET / returns HTML with messages from D1", async () => {
		const res = await SELF.fetch("http://example.com/");
		expect(res.headers.get("content-type")).toMatch(/text\/html/);
		const body = await res.text();
		expect(body).toContain("hello, hono on workers");
		expect(body).toContain("test row 1");
		expect(body).toContain("test row 2");
	});

	it("GET /api/messages returns rows from D1", async () => {
		const res = await SELF.fetch("http://example.com/api/messages");
		const rows = (await res.json()) as Array<{ text: string }>;
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.text)).toEqual(["test row 1", "test row 2"]);
	});

	it("GET /api/uuid returns a UUID", async () => {
		const res = await SELF.fetch("http://example.com/api/uuid");
		expect(await res.text()).toMatch(
			/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/,
		);
	});
});
