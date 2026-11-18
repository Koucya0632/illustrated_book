import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { putPublicObject } from "../lib/storage/public-writer";
import { stageStorage, type StorageObjectPlan, type StoragePort } from "../lib/catalogue/publish/storage";

// This exercises the real SDK request path against a deliberately limited,
// local S3-shaped server. It does not establish Cloudflare R2 behaviour.
test("S3 writer sends create-only conditions and does not overwrite on a competing upload", async () => {
  const objects = new Map<string, Buffer>();
  const observed: { path: string; condition: string | undefined }[] = [];
  const server = http.createServer(async (req, res) => {
    if (req.method === "HEAD") { res.writeHead(200).end(); return; }
    if (req.method !== "PUT") { res.writeHead(405).end(); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const key = new URL(req.url!, "http://localhost").pathname;
    const condition = req.headers["if-none-match"];
    observed.push({ path: key, condition: Array.isArray(condition) ? condition[0] : condition });
    if (condition === "*" && objects.has(key)) {
      res.writeHead(412, { "content-type": "application/xml" }).end("<Error><Code>PreconditionFailed</Code></Error>"); return;
    }
    objects.set(key, Buffer.concat(chunks));
    res.writeHead(200, { etag: '"local-test"' }).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const keys = ["NEXT_PUBLIC_ASSET_BASE_URL", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_ENDPOINT", "R2_FORCE_PATH_STYLE"] as const;
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { NEXT_PUBLIC_ASSET_BASE_URL: "https://assets.example.invalid", R2_ACCOUNT_ID: "local", R2_ACCESS_KEY_ID: "local", R2_SECRET_ACCESS_KEY: "local-secret", R2_BUCKET: "test-bucket", R2_ENDPOINT: `http://127.0.0.1:${address.port}`, R2_FORCE_PATH_STYLE: "true" });
  try {
    const results = await Promise.allSettled([
      putPublicObject("word-images", "australia/test.webp", Buffer.from("first"), { contentType: "image/webp", requireAbsent: true }),
      putPublicObject("word-images", "australia/test.webp", Buffer.from("second"), { contentType: "image/webp", requireAbsent: true }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    assert.deepEqual(observed.map((r) => r.condition), ["*", "*"]);
    assert.ok(observed.every((r) => r.path === "/test-bucket/word-images/australia/test.webp"));
    const winningBytes = objects.get(observed[0].path)!;
    assert.ok(["first", "second"].includes(winningBytes.toString()));

    // Use the actual SDK-generated 412 error with the shared publisher, not
    // a hand-crafted exception. The server/listing are deliberately local.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tuji-s3-wire-"));
    try {
      fs.writeFileSync(path.join(dir, "asset.webp"), winningBytes);
      const object: StorageObjectPlan = { key: "word-images|australia/test.webp", bucket: "word-images", storagePath: "australia/test.webp", url: "https://assets.example.invalid/word-images/australia/test.webp", localFile: "asset.webp", bytes: winningBytes.length, contentSha256: createHash("sha256").update(winningBytes).digest("hex"), mimeType: "image/webp", existedBefore: false, uploadedByRun: false, uploadIntent: false, verified: false };
      const storage: StoragePort = {
        async list() { return []; },
        put(bucket, file, bytes, contentType) { return putPublicObject(bucket, file, bytes, { contentType, requireAbsent: true }); },
        async fetch() { return { status: 200, contentType: "image/webp", bytes: objects.get(observed[0].path)! }; },
      };
      await stageStorage(storage, dir, { status: "prepared", updatedAt: "", storageObjects: [object] }, () => {}, () => {});
      assert.equal(object.verified, true);
      assert.equal(object.existedBefore, true);
      assert.equal(object.uploadedByRun, false);
      assert.equal(observed.at(-1)?.condition, "*");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } finally {
    for (const key of keys) prior[key] === undefined ? delete process.env[key] : process.env[key] = prior[key];
    server.close();
    await once(server, "close");
  }
});
