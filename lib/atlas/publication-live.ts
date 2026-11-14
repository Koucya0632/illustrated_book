// Production wiring for the 物見 publication lifecycle (lib/atlas/publication.ts):
// the pooled database client, the public bucket, and the machine gate.

import "server-only";
import { getSql } from "../db";
import { createAtlasPublication, type AtlasPublication } from "./publication";
import { publishAtlasShareImage, removeAtlasPublicObjects } from "./storage";
import { screenAtlasItem } from "./submit-pipeline";

/** Reports before a non-high-risk reason pulls an item back (`ATLAS_REPORT_ESCALATE_AT`, default 3). */
function reportEscalationThreshold(): number {
  const raw = process.env.ATLAS_REPORT_ESCALATE_AT;
  const n = raw === undefined || raw === "" ? 3 : Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 3;
}

let cached: AtlasPublication | null = null;

export function atlasPublication(): AtlasPublication {
  if (cached) return cached;
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured");
  cached = createAtlasPublication(sql, {
    screen: screenAtlasItem,
    publishShareImage: publishAtlasShareImage,
    removePublicObjects: removeAtlasPublicObjects,
    escalateAt: reportEscalationThreshold(),
  });
  return cached;
}
