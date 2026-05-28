import { getCurrentUserBundle } from "@/lib/current-user";
import { getStudyStreak } from "@/lib/users-db";
import ProgressClient from "./ProgressClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "我的進度 · Tuji" };

export default async function ProgressPage() {
  const bundle = await getCurrentUserBundle();
  const streak = bundle ? await getStudyStreak(bundle.user.id) : null;
  return (
    <ProgressClient
      streak={
        streak
          ? { current: streak.current, longest: streak.longest, totalDays: streak.totalDays }
          : null
      }
    />
  );
}
