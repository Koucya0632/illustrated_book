import { handleCreditRequest } from "@/lib/credits/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleCreditRequest(request, "ledger");
}
