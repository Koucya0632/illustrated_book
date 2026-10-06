import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import AtlasClient from "./AtlasClient";
import CreditAtlasClient from "./CreditAtlasClient";
import { usesCreditBilling } from "@/lib/credits/legacy-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "自制圖鑑 · Tuji" };

export default async function AtlasPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/signin?next=/atlas");
  return await usesCreditBilling(userId) ? <CreditAtlasClient key={userId} userId={userId} /> : <AtlasClient />;
}
