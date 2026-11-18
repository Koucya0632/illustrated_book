/** Local preview only. This module does not upload, edit the allowlist, or
 * authorize activation. Review and verify every remote asset before release. */
import fs from "node:fs";
import { publicObjectUrl } from "../../storage/public-objects";
import { verifyAustralianPlan } from "./australia-gates";
import type { prepareAustralianPlan } from "./australia-plan";
import type { AustralianWordVariants } from "../../australian-word-variants";

type Plan = ReturnType<typeof prepareAustralianPlan>;
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

/** Build candidate full variants for the 19 new words and shared Opal card.
 * The other existing regional images need a separate image-only design, so
 * this preview must never be represented as the complete release allowlist. */
export function previewAustralianFullVariants(plan: Plan): AustralianWordVariants {
  verifyAustralianPlan(plan);
  const pkg = JSON.parse(fs.readFileSync(plan.sourcePins.reviewPackage.file, "utf8"));
  const output: AustralianWordVariants = {};
  // Source JSON is validated and hash-pinned by verifyAustralianPlan.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const add = (candidate: any, imageOwner: string) => {
    const id: string = candidate.id;
    check(!(id in output), `${id}: duplicate variant`);
    const objectUrl = (owner: string, role: string, locale?: string) => {
      const matches = plan.artifacts.filter((a) => a.owner === owner && a.role === role && a.locale === locale);
      check(matches.length === 1, `${owner}:${role}:${locale ?? "image"}: artifact missing or duplicated`);
      return publicObjectUrl(matches[0].bucket, matches[0].proposedStoragePath);
    };
    const audio = (role: string) => Object.fromEntries(["en-US", "en-GB", "en-AU", "ja-JP"].map((locale) => [locale, objectUrl(id, role, locale)]));
    output[id] = {
      visibility: candidate.visibility,
      headword: candidate.word,
      pronunciation: candidate.pronunciation,
      imageUrl: objectUrl(imageOwner, "image"),
      gloss: candidate.gloss,
      explanation: candidate.explanation,
      englishDefinition: candidate.explanation.en,
      audioUrls: audio("headword"),
      examples: candidate.examples.map((e: { en: string; zh: string; ja: string; level: string }, slot: number) => ({
        en: e.en, zh: e.zh, translations: { zh: e.zh, ja: e.ja }, sortOrder: slot,
        cefrLevel: e.level, audioUrls: audio(`example-${slot}`), mentionedWordIds: [id],
      })),
    };
  };
  for (const row of pkg.wordEntries) add(row.candidate, row.id);
  add(pkg.opalRegionalCandidate.candidate, "transit-ic-card-au");
  check(Object.keys(output).length === plan.newWordIds.length + 1 && plan.newWordIds.every((id) => output[id]), "incomplete candidate preview");
  return output;
}

/** Map reviewed candidate identities to the corresponding existing cards.
 * Opal is a full text/image/audio variant and is deliberately excluded here. */
export function previewAustralianImageVariants(plan: Plan): Record<string, string> {
  verifyAustralianPlan(plan);
  const mapping: Record<string, string> = {
    "route-map": "route-map-au",
    "student-id-card": "student-id-card-au",
    "menu": "menu-au",
  };
  const result: Record<string, string> = {};
  for (const [id, owner] of Object.entries(mapping)) {
    check(!plan.reservedIds.includes(id) && plan.regionalCandidateIds.includes(owner), `${id}: unrecognized image owner`);
    const matches = plan.artifacts.filter((asset) => asset.owner === owner && asset.role === "image" && asset.bucket === "word-images");
    check(matches.length === 1, `${owner}: image missing or duplicated`);
    result[id] = publicObjectUrl(matches[0].bucket, matches[0].proposedStoragePath);
  }
  return result;
}
