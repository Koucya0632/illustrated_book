import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { userCreditConfig } from "@/lib/credits/policy";
import { createAdminCreditGrants } from "@/lib/credits/admin-grants";
import { createAdminCreditGrantsHandler } from "@/lib/credits/admin-grants-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handler = createAdminCreditGrantsHandler({
  authorized: async () => verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value),
  environment: userId => userCreditConfig(userId).environment,
  grants: () => {
    const sql = getSql();
    if (!sql) throw new Error("database unavailable");
    return createAdminCreditGrants(sql);
  },
  reportError: () => console.error("[credit-grants] request failed"),
});
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  return handler(request, (await props.params).id);
}
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  return handler(request, (await props.params).id);
}
