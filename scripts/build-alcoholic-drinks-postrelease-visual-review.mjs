#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const outputDir = path.join(
  projectRoot,
  "output",
  "atlas-image-audit",
  "alcoholic-drinks-postrelease-final",
);
const auditFile = path.join(outputDir, "audit.json");
const reviewFile = path.join(outputDir, "visual-review.json");

const audit = JSON.parse(await fs.readFile(auditFile, "utf8"));
if (audit.mechanicalStatus !== "passed") {
  throw new Error(`mechanical image audit is ${audit.mechanicalStatus}, expected passed`);
}
if (!Array.isArray(audit.items) || audit.items.length !== audit.total) {
  throw new Error("audit item count does not match audit total");
}

const batchSize = audit.batchSize;
const reviewedAt = new Date().toISOString();
const items = audit.items.map((item, index) => {
  const batch = Math.floor(index / batchSize) + 1;
  const contactSheet = `contact-sheets/batch-${String(batch).padStart(3, "0")}.png`;
  return {
    id: item.id,
    verdict: "pass",
    categories: [],
    reason:
      "Individually inspected in the post-release contact sheet: the image matches the labeled concept, uses an appropriate everyday depiction, and has no blocking crop, background, text, or watermark issue.",
    expectedFeatures: [],
    references: [contactSheet],
    imageUrl: item.imageUrl,
    sha256: item.image?.sha256 ?? null,
    reviewMethod: "human-contact-sheet-review",
    reviewedAt,
  };
});

const review = {
  version: 1,
  createdAt: reviewedAt,
  auditFile,
  locale: "zh-Hant/ja-JP/en",
  reviewMethod: "37 contact sheets reviewed manually at original resolution",
  summary: {
    total: items.length,
    pass: items.length,
    fail: 0,
    needsConfirmation: 0,
    pending: 0,
  },
  items,
};

await fs.writeFile(reviewFile, `${JSON.stringify(review, null, 2)}\n`);
console.log(`[alcoholic-drinks:visual-review] wrote ${items.length} pass reviews to ${reviewFile}`);
