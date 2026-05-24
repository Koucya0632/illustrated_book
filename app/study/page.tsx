import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import StudyClient from "./StudyClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "間隔複習 · Study" };

export default async function StudyPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/signin?next=/study");
  return <StudyClient />;
}
