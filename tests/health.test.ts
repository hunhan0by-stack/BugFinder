import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET } from "@/app/api/health/route";

describe("health endpoint", () => {
  it("returns a small JSON payload without secrets", async () => {
    const started = Date.now();
    const response = await GET();
    const elapsed = Date.now() - started;
    assert.equal(response.status, 200);
    assert.ok(elapsed < 2_000);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.status, "ok");
    assert.equal(typeof body.version, "string");
    assert.equal(typeof body.environment, "string");
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes("password"), false);
    assert.equal(serialized.includes("token"), false);
    assert.equal(serialized.includes("Authorization"), false);
    assert.equal("secret" in body, false);
    assert.equal("filesystem" in body, false);
    assert.equal("playwright" in body, false);
  });
});
