import { handleAiRequest } from "@/lib/ai-operations/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  return handleAiRequest(request, "read", (await props.params).id);
}
