// What every 個人詞表 route needs first: who, which tier under which policy, and
// which learning language the request is about.

import "server-only";
import { NextResponse } from "next/server";
import { getMembershipAccess } from "@/lib/atlas/entitlement";
import { readLearningDirection } from "@/lib/cache-headers";
import { targetLanguageFor } from "@/lib/settings";
import { getSettings } from "@/lib/users-db";
import type { WordListAccess, WordListRefusal } from "./policy";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function wordListAccessFor(userId: string): Promise<WordListAccess> {
  return getMembershipAccess(userId);
}

/** ?learning= wins over the stored setting, as on every direction-scoped read. */
export async function requestLanguage(req: Request, userId: string): Promise<"en" | "ja"> {
  const settings = await getSettings(userId);
  return targetLanguageFor(readLearningDirection(req, settings.learningDirection));
}

export function refusalResponse(r: WordListRefusal) {
  return NextResponse.json({ error: r.error, upgradeTo: r.upgradeTo }, { status: r.status });
}

export function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
