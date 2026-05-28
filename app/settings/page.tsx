import { redirect } from "next/navigation";
import { getCurrentUserBundle } from "@/lib/current-user";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "設定 · Tuji" };

export default async function SettingsPage() {
  const bundle = await getCurrentUserBundle();
  if (!bundle) redirect("/signin?next=/settings");
  return (
    <SettingsClient
      profile={{
        username: bundle.user.username,
        email: bundle.user.email,
        joined: new Date(bundle.user.createdAt).toLocaleDateString("zh-TW"),
      }}
    />
  );
}
