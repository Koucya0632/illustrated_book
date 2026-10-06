import { getCurrentUserIdFast } from "@/lib/current-user";
import { deliverCreditPurchase } from "@/lib/credits/store-server";
import { creditStoreError } from "@/lib/credits/store-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const userId = await getCurrentUserIdFast();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin !== null && origin !== new URL(request.url).origin)) {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  if (Number(request.headers.get("content-length")) > 40000 || !request.body) return Response.json({ error: "invalid_credit_transaction" }, { status: 400, headers });
  const reader = request.body.getReader(), decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 40000) { await reader.cancel(); throw new Error("body too large"); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch { return Response.json({ error: "invalid_credit_transaction" }, { status: 400, headers }); }
  finally { reader.releaseLock(); }
  let signed: string;
  try {
    const body = JSON.parse(text);
    if (Object.keys(body).length !== 1 || typeof body.signedTransaction !== "string" || !body.signedTransaction) throw new Error("invalid body");
    signed = body.signedTransaction;
  } catch { return Response.json({ error: "invalid_credit_transaction" }, { status: 400, headers }); }
  try { return Response.json(await deliverCreditPurchase(userId, signed), { headers }); }
  catch (error) { return creditStoreError(error); }
}
