import { handleAiRequest } from "@/lib/ai-operations/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Room for the after() run that follows the response (worker timeout is 40s).
export const maxDuration = 60;
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  return handleAiRequest(request, "confirm", (await props.params).id);
}
