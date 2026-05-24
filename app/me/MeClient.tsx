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
      className="px-4 py-2 rounded-full bg-white text-rose-500 shadow-card hover:shadow-lg self-start"
    >
      登出
    </button>
  );
}
