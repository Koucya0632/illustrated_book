"use client";

import { createClient } from "@/lib/supabase/client";

export default function MeClient() {
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
      登出
    </button>
  );
}
