import { handleStoryRequest } from "@/lib/assistant/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A story takes 5–17 s in samples; the model call times out at 40 s and retries once.
export const maxDuration = 90;
/** The places, situations and levels, the price range and the balance. `?uiLanguage=` labels them. */
export function GET(request: Request) { return handleStoryRequest(request, "offer"); }
export function POST(request: Request) { return handleStoryRequest(request, "write"); }
