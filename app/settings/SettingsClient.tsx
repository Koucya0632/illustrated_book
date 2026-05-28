"use client";

// 學習 settings (每日目標 / 發音口音 / 顯示中文翻譯) persist to the account via
// useSettingsActions().update. 介面/資料 rows are still preview-only.
import Link from "next/link";
import { useEffect, useState } from "react";
import Mascot from "@/components/tuji/Mascot";
import { useSettings, useSettingsActions } from "@/components/SettingsProvider";
import { ACCENT_OPTIONS, DAILY_GOAL_MAX, DAILY_GOAL_MIN } from "@/lib/settings";
import { categories } from "@/lib/categories";

type SecId = "learn" | "ui" | "data" | "about";

const NAV: { id: SecId; l: string }[] = [
  { id: "learn", l: "學習" },
  { id: "ui", l: "介面" },
  { id: "data", l: "資料" },
  { id: "about", l: "關於" },
];

export default function SettingsClient({
  profile,
}: {
  profile: { username: string; email: string; joined: string };
}) {
  const [sec, setSec] = useState<SecId>("learn");
  const settings = useSettings();
  const { update } = useSettingsActions();

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
        學習設定會儲存到你的帳號；介面 / 資料 仍為預覽。
      </div>

      <div className="flex flex-col gap-5 sm:flex-row">
        {/* Sub-nav */}
        <aside className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:w-44 sm:shrink-0 sm:flex-col sm:px-0">
          {NAV.map((it) => (
            <button
              key={it.id}
              onClick={() => setSec(it.id)}
              className={`shrink-0 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                sec === it.id ? "bg-tuji-tealS font-extrabold text-tuji-teal" : "font-semibold text-tuji-ink2 hover:bg-white"
              }`}
            >
              {it.l}
            </button>
          ))}
        </aside>

        {/* Section content */}
        <div className="min-w-0 flex-1">
          {sec === "learn" && (
            <SetCard title="學習">
              <NumberRow
                label="每日目標"
                desc={`每天要複習的單字量（${DAILY_GOAL_MIN}–${DAILY_GOAL_MAX}）`}
                value={settings.dailyGoal}
                min={DAILY_GOAL_MIN}
                max={DAILY_GOAL_MAX}
                onCommit={(n) => update({ dailyGoal: n })}
              />
              <SetRow
                label="發音口音"
                options={ACCENT_OPTIONS.map((a) => ({ value: a.value, label: a.label }))}
                current={settings.accent}
                onSelect={(v) => update({ accent: v as "us" | "uk" })}
              />
              <SetRow
                label="學習主題"
                desc="選一個主題，主頁今日任務才會出現"
                options={[
                  { value: "all", label: "（未選擇）" },
                  ...categories.map((c) => ({ value: c.id, label: c.nameZh })),
                ]}
                current={settings.studyCategory}
                onSelect={(v) => update({ studyCategory: v })}
              />
              <SetRow
                label="顯示中文翻譯"
                desc="瀏覽與複習時是否顯示中文"
                toggle={settings.showZh}
                onToggle={() => update({ showZh: !settings.showZh })}
                last
              />
            </SetCard>
          )}
          {sec === "ui" && (
            <SetCard title="介面">
              <SetRow label="介面語言" value="繁體中文" type="select" />
              <SetRow label="字級" value="標準" type="select" last />
            </SetCard>
          )}
          {sec === "data" && (
            <SetCard title="資料">
              <SetRow label="清除快取" desc="目前佔用 142 MB" value="清除" type="button" last />
            </SetCard>
          )}
          {sec === "about" && (
            <SetCard title="關於">
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

function NumberRow({
  label,
  desc,
  value,
  min,
  max,
  onCommit,
  last,
}: {
  label: string;
  desc?: string;
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  last?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = Math.round(Number(draft));
    const clamped = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3.5 ${last ? "" : "border-b border-black/5"}`}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-tuji-ink">{label}</div>
        {desc && <div className="mt-0.5 text-[11px] text-tuji-ink3">{desc}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="w-16 rounded-lg bg-tuji-bg px-3 py-1.5 text-right text-xs font-bold text-tuji-ink outline-none focus:ring-2 focus:ring-tuji-teal"
        />
        <span className="text-xs font-bold text-tuji-ink3">個字</span>
      </div>
    </div>
  );
}

function SetCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-base font-extrabold tracking-tight text-tuji-ink">{title}</h2>
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
  options,
  current,
  onSelect,
  last,
}: {
  label: string;
  desc?: string;
  value?: string;
  type?: "value" | "select" | "button" | "chevron";
  toggle?: boolean;
  onToggle?: () => void;
  // functional native select
  options?: { value: string; label: string }[];
  current?: string;
  onSelect?: (value: string) => void;
  last?: boolean;
}) {
  const isToggle = toggle !== undefined;
  const isFunctionalSelect = !!options && !!onSelect;
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
      ) : isFunctionalSelect ? (
        <select
          value={current}
          onChange={(e) => onSelect!(e.target.value)}
          className="shrink-0 rounded-lg bg-tuji-bg px-3 py-1.5 text-xs font-bold text-tuji-ink outline-none focus:ring-2 focus:ring-tuji-teal"
        >
          {options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
