import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import AtlasStudyClient from "./AtlasStudyClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "自制圖鑑複習 · Tuji" };

export default async function AtlasStudyPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/signin?next=/atlas/study");
  return <AtlasStudyClient />;
}
