import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("hello-hono", () => {
	it("GET / returns HTML", async () => {
		const res = await SELF.fetch("http://example.com/");
		expect(res.headers.get("content-type")).toMatch(/text\/html/);
		expect(await res.text()).toContain("hello, hono on workers");
	});

	it("GET /api/hello returns JSON", async () => {
		const res = await SELF.fetch("http://example.com/api/hello");
		expect(await res.json()).toEqual({ message: "Hello, World!" });
	});

	it("GET /api/uuid returns a UUID", async () => {
		const res = await SELF.fetch("http://example.com/api/uuid");
		expect(await res.text()).toMatch(
			/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/,
		);
	});
});
