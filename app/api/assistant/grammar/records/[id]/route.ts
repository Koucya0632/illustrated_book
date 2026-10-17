import { handleGrammarRequest } from "@/lib/assistant/grammar/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return handleGrammarRequest(request, "read", (await context.params).id); }
export async function PATCH(request: Request, context: Context) { return handleGrammarRequest(request, "favorite", (await context.params).id); }
export async function DELETE(request: Request, context: Context) { return handleGrammarRequest(request, "delete", (await context.params).id); }
