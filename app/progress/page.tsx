import { getCurrentUserBundle } from "@/lib/current-user";
import { getActivityHeatmap, getSettings, getStudyStreak } from "@/lib/users-db";
import ProgressClient from "./ProgressClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "我的進度 · Tuji" };

export default async function ProgressPage() {
  const bundle = await getCurrentUserBundle();
  const settings = bundle ? await getSettings(bundle.user.id) : null;
  const targetLanguage = settings?.learningDirection === "zh-ja" ? "ja" : "en";
  const [streak, heatmap] = bundle
    ? await Promise.all([
        getStudyStreak(bundle.user.id, "Asia/Taipei", targetLanguage),
        getActivityHeatmap(bundle.user.id, "Asia/Taipei", targetLanguage),
      ])
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
