import { getCurrentUserBundle } from "@/lib/current-user";
import { getActivityHeatmap, getStudyStreak } from "@/lib/users-db";
import ProgressClient from "./ProgressClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "我的進度 · Tuji" };

export default async function ProgressPage() {
  const bundle = await getCurrentUserBundle();
  const [streak, heatmap] = bundle
    ? await Promise.all([getStudyStreak(bundle.user.id), getActivityHeatmap(bundle.user.id)])
    : [null, null];
  return (
    <ProgressClient
      streak={
        streak
          ? { current: streak.current, longest: streak.longest, totalDays: streak.totalDays }
          : null
      }
      heatmap={heatmap}
    />
  );
}
