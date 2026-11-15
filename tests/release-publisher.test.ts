import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { CATALOGUE_RELEASES } from "../lib/catalogue/releases";
import { conventionalDescriptor, publishDescriptor } from "../lib/catalogue/publish/descriptor";
import {
  digest,
  planContent,
  PUBLISHER_SOURCES,
  publisherSourceKey,
  verifyPreparedPlan,
} from "../lib/catalogue/publish/plan";
import { prepareReleasePlan } from "../lib/catalogue/publish/prepare";
import { buildReleaseFixture, FIXTURE_ASSET_BASE, hasFfmpeg } from "./helpers/release-fixture";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const storageTarget = { backend: "r2", fingerprint: "fixture-store" };

test("a release's files follow the 2026-10 layout, derived from its id", () => {
  const descriptor = conventionalDescriptor("kitchen-tools-2026-12", "kitchen-tools");
  assert.equal(descriptor.files.candidates, "data/kitchen-tools-series-2026-12.json");
  assert.equal(descriptor.files.spans, "data/example-spans-kitchen-tools-2026-12.json");
  assert.equal(descriptor.files.canonicalImages, "lib/image-urls.json");
  assert.equal(descriptor.files.audioFrameVerification, "output/kitchen-tools-audio-candidates/mp3-frames-report.json");
  assert.equal(descriptor.prepDirectory, "output/kitchen-tools-publish-prep");
  assert.throws(() => conventionalDescriptor("kitchen-tools", "kitchen-tools"), /<topic>-<yyyy>-<mm>/);
});

test("every release shipped so far keeps its own frozen publisher", () => {
  for (const release of CATALOGUE_RELEASES) {
    assert.throws(() => publishDescriptor(release.id), /frozen publisher/, release.id);
  }
});

test("a plan made by a frozen publisher is refused: it does not pin the shared publisher's code", () => {
  process.env.NEXT_PUBLIC_ASSET_BASE_URL = "https://img.nexflow.team";
  const file = path.join(root, "docs/releases/dental-clinic-publish-plan-c945b3100fcdbdbfd30258fc2a92114f7e9bad63b81461401ea233ba520bf9de.json");
  const bytes = fs.readFileSync(file);
  assert.throws(
    () => verifyPreparedPlan(JSON.parse(bytes.toString("utf8")), bytes, root),
    /does not pin the publisher source lib\/catalogue\/publish\/plan\.ts/,
  );
});

test("a prepared plan pins its reviewed inputs and the publisher's own code", { skip: !hasFfmpeg() }, async () => {
  const fixture = await buildReleaseFixture(root);
  try {
    const plan = await prepareReleasePlan(fixture.descriptor, { root, storageTarget });
    const bytes = Buffer.from(JSON.stringify(plan));
    assert.equal(verifyPreparedPlan(plan, bytes, root).ids.size, 2);
    for (const file of PUBLISHER_SOURCES) {
      assert.equal(plan.sources[publisherSourceKey(file)].file, file);
    }
    assert.equal(plan.summary.storageObjects, 1 + 2 + 18);
    assert.ok(plan.category.image.url.startsWith(FIXTURE_ASSET_BASE));

    // A plan prepared under different publisher code no longer verifies, even
    // with a self-consistent digest.
    const stale = structuredClone(plan);
    stale.sources[publisherSourceKey("lib/catalogue/publish/database.ts")].sha256 = "0".repeat(64);
    stale.planDigest = digest(planContent(stale));
    assert.throws(
      () => verifyPreparedPlan(stale, Buffer.from(JSON.stringify(stale)), root),
      /lib\/catalogue\/publish\/database\.ts: reviewed source changed after planning/,
    );

    // Any edit to the plan itself breaks its digest.
    const edited = structuredClone(plan);
    edited.entries[0].word.word = "edited";
    assert.throws(() => verifyPreparedPlan(edited, Buffer.from(JSON.stringify(edited)), root), /content digest changed/);

    // An edited reviewed input after planning is refused.
    const candidates = path.join(root, fixture.descriptor.files.candidates);
    fs.appendFileSync(candidates, "\n");
    assert.throws(() => verifyPreparedPlan(plan, bytes, root), /reviewed source changed after planning/);
  } finally {
    fixture.cleanup();
  }
});

test("preparation refuses an example whose review is stale", { skip: !hasFfmpeg() }, async () => {
  const fixture = await buildReleaseFixture(root);
  try {
    const file = path.join(root, fixture.descriptor.files.candidates);
    const candidate = JSON.parse(fs.readFileSync(file, "utf8"));
    candidate.entries[0].examples[1].zh = "審稿之後才改的翻譯。";
    fs.writeFileSync(file, JSON.stringify(candidate, null, 2));
    await assert.rejects(
      prepareReleasePlan(fixture.descriptor, { root, storageTarget }),
      /:1: example review is missing or stale/,
    );
  } finally {
    fixture.cleanup();
  }
});
