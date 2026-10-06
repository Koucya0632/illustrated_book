import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { userCreditConfig } from "@/lib/credits/policy";
import { createRefundReview } from "@/lib/credits/refund-review";
import { createRefundReviewHandler } from "@/lib/credits/refund-review-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handler = createRefundReviewHandler({
  authorized: async () => verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value),
  environment: userId => userCreditConfig(userId).environment,
  review: () => {
    const sql = getSql();
    if (!sql) throw new Error("database unavailable");
    return createRefundReview(sql);
  },
  reportError: () => console.error("[credit-refunds] request failed"),
});
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  return handler(request, (await props.params).id);
}
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  return handler(request, (await props.params).id);
}
