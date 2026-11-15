// The publish plan: a reviewed, content-addressed description of one release.
// prepare.ts writes it; publish.ts refuses to run unless it still verifies.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { publicObjectUrl } from "../../storage/public-objects";

// Plans are JSON written by prepare.ts and read back from disk; their nested
// shape is checked here rather than trusted from a type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PublishPlan = any;

/** The shared publisher's own code. A plan pins these files, so the code
 * that applies a plan is the code that was there when it was reviewed. */
export const PUBLISHER_SOURCES = [
  "lib/catalogue/publish/plan.ts",
  "lib/catalogue/publish/database.ts",
  "lib/catalogue/publish/storage.ts",
  "lib/catalogue/publish/publish.ts",
  "scripts/publish-release.ts",
] as const;

export const publisherSourceKey = (file: string) => `publisher:${file}`;

export function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

export function digest(value: unknown): string {
  return sha256(JSON.stringify(canonical(value)));
}

export function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** The digest covers everything except the fields set at preparation time. */
export function planContent(plan: PublishPlan) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { planDigest, createdAt, status, databasePreflight, storageTarget, ...content } = plan;
  return content;
}

/** Refuse a plan whose content, pinned sources, publisher code or local media
 * changed since it was prepared. Returns the plan file's hash and word ids. */
export function verifyPreparedPlan(plan: PublishPlan, planBytes: Buffer, root: string) {
  if (plan.planDigest !== digest(planContent(plan))) {
    throw new Error("publish plan content digest changed");
  }
  if (
    plan.schemaVersion !== 1 ||
    typeof plan.series !== "string" ||
    plan.category?.id !== plan.series ||
    plan.productionWriteAllowed !== false ||
    !plan.sources || !plan.category?.image ||
    plan.summary?.words !== plan.entries?.length ||
    plan.summary?.examples !== plan.entries?.length * 2 ||
    plan.summary?.wordImages !== plan.entries?.length ||
    plan.summary?.categoryImages !== 1 ||
    plan.summary?.audioClips !== plan.entries?.length * 9 ||
    plan.summary?.storageObjects !== plan.summary.wordImages + plan.summary.categoryImages + plan.summary.audioClips ||
    !Array.isArray(plan.entries) ||
    plan.entries.length === 0
  ) {
    throw new Error(`invalid or incomplete ${plan.series ?? "release"} publish plan`);
  }
  for (const file of PUBLISHER_SOURCES) {
    if (plan.sources[publisherSourceKey(file)]?.file !== file) {
      throw new Error(`publish plan does not pin the publisher source ${file}`);
    }
  }
  for (const source of Object.values(plan.sources) as { file: string; sha256: string }[]) {
    if (sha256(fs.readFileSync(path.resolve(root, source.file))) !== source.sha256) {
      throw new Error(`${source.file}: reviewed source changed after planning`);
    }
  }
  const ids = new Set<string>();
  const artifacts = new Set<string>();
  if (plan.category.image.url !== publicObjectUrl("word-images", plan.category.image.storagePath) ||
      plan.category.imageUrl !== plan.category.image.url) {
    throw new Error("category image URL differs from the physical Storage target");
  }
  const categoryBytes = fs.readFileSync(path.resolve(root, plan.category.image.localFile));
  if (categoryBytes.length !== plan.category.image.bytes || sha256(categoryBytes) !== plan.category.image.contentSha256) {
    throw new Error("category image bytes no longer match the plan");
  }
  artifacts.add(`${plan.category.image.bucket}|${plan.category.image.storagePath}|category|image`);
  for (const item of plan.entries) {
    const id = item.word?.id;
    if (!id || ids.has(id)) throw new Error(`duplicate or empty word ID: ${id}`);
    if (item.word.category !== plan.series) throw new Error(`${id}: primary topic is not ${plan.series}`);
    ids.add(id);
    const media = [
      item.image,
      ...item.headwordAudio,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...item.examples.flatMap((example: any) => example.audio),
    ];
    for (const artifact of media) {
      const bytes = fs.readFileSync(path.resolve(root, artifact.localFile));
      if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.contentSha256) {
        throw new Error(`${artifact.localFile}: local bytes no longer match the plan`);
      }
      const key = `${artifact.bucket}|${artifact.storagePath}|${artifact.ownerKey ?? id}|${artifact.locale ?? "image"}`;
      if (artifacts.has(key)) throw new Error(`duplicate planned artifact: ${key}`);
      artifacts.add(key);
    }
  }
  if (artifacts.size !== plan.summary.storageObjects) {
    throw new Error(`expected ${plan.summary.storageObjects} artifacts, found ${artifacts.size}`);
  }
  return { planSha256: sha256(planBytes), ids };
}
