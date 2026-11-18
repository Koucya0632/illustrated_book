import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { stageStorage, type StorageObjectPlan, type StoragePort } from "../lib/catalogue/publish/storage";

test("create-only conflict reconciles identical remote bytes without claiming ownership", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tuji-storage-reconcile-"));
  try {
    const bytes = Buffer.from("planned image");
    fs.writeFileSync(path.join(dir, "image.webp"), bytes);
    const object: StorageObjectPlan = { key: "word-images|au/image.webp", bucket: "word-images", storagePath: "au/image.webp", url: "https://assets.invalid/au/image.webp", localFile: "image.webp", bytes: bytes.length, contentSha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/webp", existedBefore: false, uploadedByRun: false, uploadIntent: false, verified: false };
    let remote = bytes;
    const storage: StoragePort = {
      async list() { return []; }, // The competing object appeared after the listing.
      async put() { throw Object.assign(new Error("conflict"), { $metadata: { httpStatusCode: 412 } }); },
      async fetch() { return { status: 200, contentType: "image/webp", bytes: remote }; },
    };
    const manifest = { status: "prepared", updatedAt: "", storageObjects: [object] };
    await stageStorage(storage, dir, manifest, () => {}, () => {});
    assert.equal(manifest.status, "uploaded");
    assert.equal(object.verified, true);
    assert.equal(object.existedBefore, true);
    assert.equal(object.uploadedByRun, false);

    object.verified = false;
    object.existedBefore = false;
    storage.list = async (bucket) => bucket === "word-images" ? [object.storagePath] : [];
    await stageStorage(storage, dir, manifest, () => {}, () => {});
    assert.equal(object.existedBefore, true, "upload intent is not proof of ownership");
    assert.equal(object.uploadedByRun, false);

    object.verified = false;
    storage.list = async () => [];
    remote = Buffer.from("wrong image!!");
    await assert.rejects(stageStorage(storage, dir, manifest, () => {}, () => {}), /remote bytes do not match/);
    assert.equal(object.verified, false);
    storage.put = async () => { throw Object.assign(new Error("denied"), { $metadata: { httpStatusCode: 403 } }); };
    await assert.rejects(stageStorage(storage, dir, manifest, () => {}, () => {}), /denied/);
    fs.writeFileSync(path.join(dir, "image.webp"), "changed on disk");
    let puts = 0;
    storage.put = async () => { puts++; return object.url; };
    await assert.rejects(stageStorage(storage, dir, manifest, () => {}, () => {}), /local artifact changed before upload/);
    assert.equal(puts, 0, "changed local content must never be uploaded under its old hash");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
