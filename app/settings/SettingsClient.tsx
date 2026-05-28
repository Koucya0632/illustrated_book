"use client";

// Visual-only settings. None of these toggles persist yet — see TUJI_TODO.md.
// Only "登出" is wired (Supabase sign-out).
import Link from "next/link";
import { useState } from "react";
import Mascot from "@/components/tuji/Mascot";

type SecId = "learn" | "notify" | "ui" | "data" | "about";

const NAV: { id: SecId; l: string; icon: string }[] = [
  { id: "learn", l: "學習", icon: "🎯" },
  { id: "notify", l: "通知", icon: "🔔" },
  { id: "ui", l: "介面", icon: "🎨" },
  { id: "data", l: "資料", icon: "☁" },
  { id: "about", l: "關於", icon: "ℹ" },
];

export default function SettingsClient({
  profile,
}: {
  profile: { username: string; email: string; joined: string };
}) {
  const [sec, setSec] = useState<SecId>("learn");
  const [t, setT] = useState({
    autoplay: true,
    showZh: true,
    autoLevel: false,
    push: true,
    daily: true,
    streak: true,
    weekly: false,
    cloud: true,
  });
  const tog = (k: keyof typeof t) => setT((s) => ({ ...s, [k]: !s[k] }));

  async function logout() {
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-6 sm:px-7">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/me"
          aria-label="返回"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg text-tuji-ink shadow-soft"
        >
          ←
        </Link>
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">個人</div>
          <h1 className="text-2xl font-extrabold tracking-tight text-tuji-ink">設定</h1>
        </div>
      </div>

      {/* Profile card */}
      <div className="relative mb-5 flex items-center gap-4 overflow-hidden rounded-[18px] bg-tuji-ink p-4 text-white">
        <div className="pointer-events-none absolute right-8 top-3 text-sm text-tuji-yellow/65">✦</div>
        <div className="flex h-16 w-16 shrink-0 items-end justify-center overflow-hidden rounded-2xl bg-tuji-teal">
          <Mascot pose="face" size={60} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-extrabold">{profile.username}</div>
          <div className="truncate text-xs text-white/70">
            {profile.email} · 加入於 {profile.joined}
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-xl bg-tuji-yellow/30 px-4 py-2.5 text-xs font-semibold text-tuji-ink2">
        ⚠ 目前設定僅供預覽，尚未儲存到帳號（見 TUJI_TODO.md）。
      </div>

      <div className="flex flex-col gap-5 sm:flex-row">
        {/* Sub-nav */}
        <aside className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:w-44 sm:shrink-0 sm:flex-col sm:px-0">
          {NAV.map((it) => (
            <button
              key={it.id}
              onClick={() => setSec(it.id)}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition ${
                sec === it.id ? "bg-tuji-tealS font-extrabold text-tuji-teal" : "font-semibold text-tuji-ink2 hover:bg-white"
              }`}
            >
              <span className="w-4 text-center">{it.icon}</span>
              {it.l}
            </button>
          ))}
        </aside>

        {/* Section content */}
        <div className="min-w-0 flex-1">
          {sec === "learn" && (
            <SetCard title="學習" icon="🎯" tint="#D4ECEC">
              <SetRow label="每日目標" desc="每天要複習的單字量" value="12 個字" type="select" />
              <SetRow label="提醒時間" desc="什麼時候推播" value="21:00" type="select" />
              <SetRow label="發音口音" value="美式英語" type="select" />
              <SetRow label="自動播放發音" desc="出現新字時直接念出來" toggle={t.autoplay} onToggle={() => tog("autoplay")} />
              <SetRow label="顯示中文翻譯" toggle={t.showZh} onToggle={() => tog("showZh")} />
              <SetRow label="難度自動調整" desc="根據答題狀況調整題型" toggle={t.autoLevel} onToggle={() => tog("autoLevel")} last />
            </SetCard>
          )}
          {sec === "notify" && (
            <SetCard title="通知" icon="🔔" tint="#FFF4D6">
              <SetRow label="推播通知" toggle={t.push} onToggle={() => tog("push")} />
              <SetRow label="每日複習提醒" desc="21:00 提醒今天的字" toggle={t.daily} onToggle={() => tog("daily")} />
              <SetRow label="連勝即將中斷" desc="距離斷掉前 2 小時通知" toggle={t.streak} onToggle={() => tog("streak")} />
              <SetRow label="Email 週報" toggle={t.weekly} onToggle={() => tog("weekly")} last />
            </SetCard>
          )}
          {sec === "ui" && (
            <SetCard title="介面" icon="🎨" tint="#F6E6F0">
              <SetRow label="介面語言" value="繁體中文" type="select" />
              <SetRow label="字級" value="標準" type="select" />
              <SetRow label="深色模式" value="自動 (跟隨系統)" type="select" />
              <SetRow label="Tuji 出現頻率" desc="黑貓多久跳出來說話" value="常駐" type="select" last />
            </SetCard>
          )}
          {sec === "data" && (
            <SetCard title="資料" icon="☁" tint="#E8F1FB">
              <SetRow label="雲端同步" desc="最後同步 今天 09:42" toggle={t.cloud} onToggle={() => tog("cloud")} />
              <SetRow label="匯出單字" desc="下載為 CSV / Anki .apkg" value="匯出" type="button" />
              <SetRow label="清除快取" desc="目前佔用 142 MB" value="清除" type="button" last />
            </SetCard>
          )}
          {sec === "about" && (
            <SetCard title="關於" icon="ℹ" tint="#F0EDE5">
              <SetRow label="版本" value="1.4.0 (2026)" />
              <SetRow label="使用條款" type="chevron" />
              <SetRow label="隱私政策" type="chevron" />
              <SetRow label="聯絡我們" value="hello@tuji.app" last />
            </SetCard>
          )}

          <div className="mt-5 flex flex-wrap gap-2.5">
            <button onClick={logout} className="rounded-2xl bg-tuji-coral px-6 py-3 text-sm font-extrabold text-white shadow-soft">
              登出
            </button>
            <button
              onClick={() => alert("刪除帳號功能尚未實作（見 TUJI_TODO.md）。")}
              className="rounded-2xl border border-tuji-ink/15 px-6 py-3 text-sm font-extrabold text-tuji-ink3"
            >
              刪除帳號
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SetCard({ title, icon, tint, children }: { title: string; icon: string; tint: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[15px]" style={{ background: tint }}>
          {icon}
        </span>
        <h2 className="text-base font-extrabold tracking-tight text-tuji-ink">{title}</h2>
      </div>
      <div className="overflow-hidden rounded-[16px] bg-white shadow-soft">{children}</div>
    </section>
  );
}

function SetRow({
  label,
  desc,
  value,
  type = "value",
  toggle,
  onToggle,
  last,
}: {
  label: string;
  desc?: string;
  value?: string;
  type?: "value" | "select" | "button" | "chevron" | "toggle";
  toggle?: boolean;
  onToggle?: () => void;
  last?: boolean;
}) {
  const isToggle = type === "toggle" || toggle !== undefined;
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3.5 ${last ? "" : "border-b border-black/5"}`}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-tuji-ink">{label}</div>
        {desc && <div className="mt-0.5 text-[11px] text-tuji-ink3">{desc}</div>}
      </div>
      {isToggle ? (
        <button
          onClick={onToggle}
          aria-pressed={toggle}
          className="relative h-6 w-11 shrink-0 rounded-full transition"
          style={{ background: toggle ? "#4FAE6F" : "#D9D6CC" }}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
            style={{ left: toggle ? 22 : 2 }}
          />
        </button>
      ) : type === "select" ? (
        <span className="shrink-0 rounded-lg bg-tuji-bg px-3 py-1.5 text-xs font-bold text-tuji-ink">{value} ▾</span>
      ) : type === "button" ? (
        <span className="shrink-0 rounded-lg bg-tuji-tealS px-3.5 py-1.5 text-xs font-extrabold text-tuji-teal">{value}</span>
      ) : type === "chevron" ? (
        <span className="shrink-0 text-lg text-tuji-ink4">›</span>
      ) : (
        <span className="shrink-0 text-[13px] font-semibold text-tuji-ink3">{value}</span>
      )}
    </div>
  );
}
