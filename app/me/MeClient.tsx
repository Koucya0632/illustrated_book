"use client";

import { createClient } from "@/lib/supabase/client";
import { useT } from "@/components/I18n";

export default function MeClient() {
  const t = useT();
  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }
  return (
    <button
      onClick={logout}
      className="rounded-[18px] bg-white px-5 py-3 text-sm font-extrabold text-tuji-coral shadow-soft transition hover:shadow-card"
    >
      {t("set.logout")}
    </button>
  );
}
