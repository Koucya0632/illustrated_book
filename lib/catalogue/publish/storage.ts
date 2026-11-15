// The shared publisher's Storage side. Objects are content-addressed and
// written only when absent; every byte is downloaded and hashed back before
// the database transaction may reference it.

import fs from "node:fs";
import path from "node:path";
import { WORD_IMAGE_CONTENT_TYPE } from "../../word-image-encode";
import { publicObjectUrl } from "../../storage/public-objects";
import {
  listPublicObjects,
  putPublicObject,
  writeBackend,
} from "../../storage/public-writer";
import { sha256, type PublishPlan } from "./plan";

export type ReleaseBucket = "word-images" | "word-audio";

export interface StorageObjectPlan {
  key: string;
  bucket: ReleaseBucket;
  storagePath: string;
  url: string;
  localFile: string;
  bytes: number;
  contentSha256: string;
  mimeType: string;
  existedBefore: boolean;
  uploadedByRun: boolean;
  uploadIntent: boolean;
  verified: boolean;
}

/** What the publisher needs from object storage. */
export type StoragePort = {
  /** Every object path in a bucket. */
  list(bucket: ReleaseBucket): Promise<string[]>;
  /** Create an object that must not exist yet; returns its public URL. */
  put(bucket: ReleaseBucket, storagePath: string, bytes: Buffer, contentType: string): Promise<string>;
  /** Download a public URL, bypassing caches. */
  fetch(url: string): Promise<{ status: number; contentType: string | null; bytes: Buffer }>;
};

/** Production Storage: the configured public writer and the public CDN. */
export function liveStoragePort(): StoragePort {
  return {
    list: (bucket) => listPublicObjects(bucket, ""),
    put: (bucket, storagePath, bytes, contentType) =>
      putPublicObject(bucket, storagePath, bytes, { contentType, upsert: false, requireAbsent: true }),
    async fetch(url) {
      const response = await fetch(url, { cache: "no-store" });
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        bytes: Buffer.from(await response.arrayBuffer()),
      };
    },
  };
}

/** Identity of the physical Storage target, without credentials. A plan and
 * an apply manifest record it; a run against another target is refused. */
export function storageTarget(env: NodeJS.ProcessEnv = process.env) {
  const backend = env.R2_ACCOUNT_ID ? "r2" : "unconfigured";
  return {
    backend,
    bucket: env.R2_BUCKET ?? null,
    endpoint: env.R2_ENDPOINT ?? null,
    publicBase: env.NEXT_PUBLIC_ASSET_BASE_URL ?? null,
    fingerprint: currentStorageTargetFingerprint(env, backend === "r2" ? "r2" : "supabase"),
  };
}

export function currentStorageTargetFingerprint(
  env: NodeJS.ProcessEnv = process.env,
  backend: "r2" | "supabase" = writeBackend(),
): string {
  const identity = backend === "r2"
    ? {
        backend,
        accountId: env.R2_ACCOUNT_ID ?? "",
        bucket: env.R2_BUCKET ?? "",
        endpoint: env.R2_ENDPOINT ?? "",
        publicBase: env.NEXT_PUBLIC_ASSET_BASE_URL ?? "",
      }
    : {
        backend,
        supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      };
  return sha256(JSON.stringify(identity)).slice(0, 12);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function buildStorageObjects(plan: PublishPlan, exampleIds: Record<string, string>): StorageObjectPlan[] {
  const objects: StorageObjectPlan[] = [];
  const add = (artifact: any, concretePath: string) => {
    objects.push({
      key: `${artifact.bucket}|${concretePath}`,
      bucket: artifact.bucket,
      storagePath: concretePath,
      url: publicObjectUrl(artifact.bucket, concretePath),
      localFile: artifact.localFile,
      bytes: artifact.bytes,
      contentSha256: artifact.contentSha256,
      mimeType: artifact.mimeType,
      existedBefore: false,
      uploadedByRun: false,
      uploadIntent: false,
      verified: false,
    });
  };
  add(plan.category.image, plan.category.image.storagePath);
  for (const item of plan.entries) {
    add(item.image, item.image.storagePath);
    for (const audio of item.headwordAudio) add(audio, audio.storagePath);
    for (const example of item.examples) {
      const exampleId = exampleIds[example.ownerKey];
      if (!exampleId) throw new Error(`${example.ownerKey}: unresolved example ID`);
      for (const audio of example.audio) {
        add(audio, audio.storagePath.replace("{exampleId}", exampleId));
      }
    }
  }
  if (objects.length !== plan.summary.storageObjects ||
      new Set(objects.map(({ key }) => key)).size !== plan.summary.storageObjects) {
    throw new Error("resolved Storage object plan is incomplete or duplicated");
  }
  return objects;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function verifyRemoteObject(storage: StoragePort, object: StorageObjectPlan) {
  const response = await storage.fetch(object.url);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${object.key}: remote HTTP ${response.status}`);
  }
  const contentType = response.contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== object.mimeType) {
    throw new Error(`${object.key}: remote content type ${contentType ?? "missing"} differs from ${object.mimeType}`);
  }
  if (response.bytes.length !== object.bytes || sha256(response.bytes) !== object.contentSha256) {
    throw new Error(`${object.key}: remote bytes do not match the local artifact`);
  }
}

export async function verifyAllRemoteObjects(storage: StoragePort, objects: StorageObjectPlan[]) {
  for (let index = 0; index < objects.length; index += 20) {
    await Promise.all(objects.slice(index, index + 20).map((object) => verifyRemoteObject(storage, object)));
  }
}

/** Upload every planned object that is absent, journaling intent before each
 * write and success after it, so an interrupted run resumes exactly. */
export async function stageStorage(
  storage: StoragePort,
  root: string,
  manifest: { status: string; updatedAt: string; storageObjects: StorageObjectPlan[] },
  journal: () => void,
  log: (line: string) => void,
) {
  const existingByBucket = new Map<ReleaseBucket, Set<string>>([
    ["word-images", new Set(await storage.list("word-images"))],
    ["word-audio", new Set(await storage.list("word-audio"))],
  ]);
  manifest.status = "uploading";
  manifest.updatedAt = new Date().toISOString();
  journal();
  for (const [index, object] of manifest.storageObjects.entries()) {
    if (object.verified) {
      await verifyRemoteObject(storage, object);
      continue;
    }
    const existing = existingByBucket.get(object.bucket)!.has(object.storagePath);
    if (existing) {
      await verifyRemoteObject(storage, object);
      // An earlier interrupted attempt may have completed the PUT after it
      // journaled intent but before it journaled success.
      if (object.uploadIntent) object.uploadedByRun = true;
      else object.existedBefore = true;
    } else {
      const localBytes = fs.readFileSync(path.resolve(root, object.localFile));
      object.existedBefore = false;
      object.uploadIntent = true;
      manifest.updatedAt = new Date().toISOString();
      journal();
      const url = await storage.put(
        object.bucket,
        object.storagePath,
        localBytes,
        object.bucket === "word-images" ? WORD_IMAGE_CONTENT_TYPE : object.mimeType,
      );
      if (url !== object.url) throw new Error(`${object.key}: writer returned an unexpected URL`);
      object.uploadedByRun = true;
      await verifyRemoteObject(storage, object);
    }
    object.verified = true;
    manifest.updatedAt = new Date().toISOString();
    journal();
    if ((index + 1) % 25 === 0 || index + 1 === manifest.storageObjects.length) {
      log(`Storage ${index + 1}/${manifest.storageObjects.length}`);
    }
  }
  manifest.status = "uploaded";
  manifest.updatedAt = new Date().toISOString();
  journal();
}
