import assert from "node:assert/strict";
import test from "node:test";
import { readLimitedJson, RequestBodyTooLargeError } from "../lib/request-body";

test("limited JSON reader accepts a bounded body", async () => {
  const req = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ ok: true }),
  });
  assert.deepEqual(await readLimitedJson(req, 64), { ok: true });
});

test("limited JSON reader stops an oversized streamed body", async () => {
  const req = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ value: "x".repeat(128) }),
  });
  await assert.rejects(() => readLimitedJson(req, 32), RequestBodyTooLargeError);
});

test("declared oversized content is rejected before reading", async () => {
  const req = new Request("https://example.test", {
    method: "POST",
    headers: { "content-length": "9000" },
    body: "{}",
  });
  await assert.rejects(() => readLimitedJson(req, 4096), RequestBodyTooLargeError);
});
