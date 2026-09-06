// TEMPORARY smoke endpoint — used by tuji-ios W1 to verify the Bearer
// header path in `lib/supabase/middleware.ts`. Delete once iOS APIClient
// is verified against `/api/users/me`.
//
// Usage:
//   curl -H "Authorization: Bearer <supabase_access_token>" \
//        https://tuji.app/api/_test/whoami
//   → {"userId":"<uuid>","source":"bearer"}
//
//   curl https://tuji.app/api/_test/whoami
//   → {"userId":null,"source":"none"}

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { USER_ID_HEADER } from "@/lib/supabase/middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserIdFast();
  const headerId = (await headers()).get(USER_ID_HEADER);
  const auth = (await headers()).get("authorization");

  return NextResponse.json({
    userId,
    source: userId
      ? auth?.toLowerCase().startsWith("bearer ")
        ? "bearer"
        : "cookie"
      : "none",
    // Debug only — confirms middleware piped the id through the request header.
    headerWasSet: Boolean(headerId),
  });
}
