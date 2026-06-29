import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import AtlasClient from "./AtlasClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "自制圖鑑 · Tuji" };

export default async function AtlasPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/signin?next=/atlas");
  return <AtlasClient />;
}
