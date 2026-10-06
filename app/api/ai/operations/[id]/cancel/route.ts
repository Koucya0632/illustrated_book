import { handleAiRequest } from "@/lib/ai-operations/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  return handleAiRequest(request, "cancel", (await props.params).id);
}
