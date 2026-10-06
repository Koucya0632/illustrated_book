import assert from "node:assert/strict";
import test from "node:test";
import { uploadFormData } from "../lib/ai-operations/upload-body";

test("upload body bounds chunked requests before multipart parsing", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(20)); }, cancel() { cancelled = true; } });
  const request = new Request("https://tuji.test", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(uploadFormData(request, 30), { message: "invalid_upload" });
  assert.equal(cancelled, true);
});
test("upload body preserves a valid multipart photo and rejects malformed forms", async () => {
  const form = new FormData(); form.append("file", new File(["photo"], "cat.webp", { type: "image/webp" }));
  const result = await uploadFormData(new Request("https://tuji.test", { method: "POST", body: form }));
  assert.equal(await (result.get("file") as File).text(), "photo");
  await assert.rejects(uploadFormData(new Request("https://tuji.test", { method: "POST", body: "bad" })), { message: "invalid_upload" });
});
