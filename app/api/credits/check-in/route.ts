import { handleCreditRequest } from "@/lib/credits/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleCreditRequest(request, "check_in");
}
