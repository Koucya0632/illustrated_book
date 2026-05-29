"use client";

// Draft model: edits change a local draft; nothing takes effect until "保存"
// (which persists then reloads so server-rendered language/scale apply too).
import Link from "next/link";
import { useEffect, useState } from "react";
import Mascot from "@/components/tuji/Mascot";
import { useSettings } from "@/components/SettingsProvider";
import { useT } from "@/components/I18n";
import { ACCENT_OPTIONS, DAILY_GOAL_MAX, DAILY_GOAL_MIN, type UserSettings } from "@/lib/settings";
import { LOCALES } from "@/lib/i18n";
import { categories } from "@/lib/categories";

type SecId = "learn" | "ui" | "data" | "about";

const SETTINGS_KEYS: (keyof UserSettings)[] = [
  "dailyGoal",
  "accent",
  "showZh",
  "studyCategory",
  "uiLang",
  "fontSize",
];

export default function SettingsClient({
  profile,
}: {
  profile: { username: string; email: string; joined: string };
}) {
  const t = useT();
  const settings = useSettings();
  const [sec, setSec] = useState<SecId>("learn");
  const [draft, setDraft] = useState<UserSettings>(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(settings), [settings]);

  const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const dirty = SETTINGS_KEYS.some((k) => draft[k] !== settings[k]);

  const NAV: { id: SecId; l: string }[] = [
    { id: "learn", l: t("tab.learn") },
    { id: "ui", l: t("tab.ui") },
    { id: "data", l: t("tab.data") },
    { id: "about", l: t("tab.about") },
  ];

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await fetch("/api/users/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
    } catch {
      /* ignore — reload will reflect whatever persisted */
    }
    window.location.reload();
  }

  function clearCache() {
    if (!confirm(t("set.clearConfirm"))) return;
    try {
      localStorage.removeItem("eepd-progress-v1");
      localStorage.removeItem("eepd-session-id");
    } catch {
      /* ignore */
    }
    window.location.reload();
  }

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
          aria-label={t("common.back")}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg text-tuji-ink shadow-soft"
        >
          ←
        </Link>
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">
            {t("set.personal")}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-tuji-ink">{t("set.title")}</h1>
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
            {t("set.profileSub", { email: profile.email, joined: profile.joined })}
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-xl bg-tuji-yellow/30 px-4 py-2.5 text-xs font-semibold text-tuji-ink2">
        {t("set.banner")}
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
            <SetCard title={t("tab.learn")}>
              <NumberRow
                label={t("set.dailyGoal")}
                desc={t("set.dailyGoalDesc", { min: DAILY_GOAL_MIN, max: DAILY_GOAL_MAX })}
                unit={t("set.unitWords")}
                value={draft.dailyGoal}
                min={DAILY_GOAL_MIN}
                max={DAILY_GOAL_MAX}
                onChange={(n) => set("dailyGoal", n)}
              />
              <SetRow
                label={t("set.accent")}
                options={[
                  { value: "us", label: t("set.accentUS") },
                  { value: "uk", label: t("set.accentUK") },
                ]}
                current={draft.accent}
                onSelect={(v) => set("accent", v as UserSettings["accent"])}
              />
              <SetRow
                label={t("set.studyTheme")}
                desc={t("set.studyThemeDesc")}
                options={[
                  { value: "all", label: t("set.notSelected") },
                  ...categories.map((c) => ({ value: c.id, label: c.nameZh })),
                ]}
                current={draft.studyCategory}
                onSelect={(v) => set("studyCategory", v)}
              />
              <SetRow
                label={t("set.showZh")}
                desc={t("set.showZhDesc")}
                toggle={draft.showZh}
                onToggle={() => set("showZh", !draft.showZh)}
                last
              />
            </SetCard>
          )}
          {sec === "ui" && (
            <SetCard title={t("tab.ui")}>
              <SetRow
                label={t("set.uiLang")}
                options={LOCALES.map((l) => ({ value: l.value, label: l.label }))}
                current={draft.uiLang}
                onSelect={(v) => set("uiLang", v as UserSettings["uiLang"])}
              />
              <SetRow
                label={t("set.fontSize")}
                options={[
                  { value: "sm", label: t("set.fontSm") },
                  { value: "md", label: t("set.fontMd") },
                  { value: "lg", label: t("set.fontLg") },
                ]}
                current={draft.fontSize}
                onSelect={(v) => set("fontSize", v as UserSettings["fontSize"])}
                last
              />
            </SetCard>
          )}
          {sec === "data" && (
            <SetCard title={t("tab.data")}>
              <SetRow
                label={t("set.clearCache")}
                desc={t("set.clearCacheDesc")}
                buttonLabel={t("set.clearBtn")}
                onButtonClick={clearCache}
                last
              />
            </SetCard>
          )}
          {sec === "about" && (
            <SetCard title={t("tab.about")}>
              <SetRow label={t("set.version")} value="1.4.0 (2026)" />
              <SetRow label={t("set.terms")} type="chevron" />
              <SetRow label={t("set.privacy")} type="chevron" />
              <SetRow label={t("set.contact")} value="hello@tuji.app" last />
            </SetCard>
          )}

          {/* Save bar */}
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-2xl bg-tuji-teal px-6 py-3 text-sm font-extrabold text-white shadow-soft transition hover:brightness-105 disabled:opacity-40"
            >
              {saving ? t("set.saving") : t("set.save")}
            </button>
            {dirty && !saving && (
              <span className="text-xs font-semibold text-tuji-coral">{t("set.unsaved")}</span>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <button onClick={logout} className="rounded-2xl bg-tuji-coral px-6 py-3 text-sm font-extrabold text-white shadow-soft">
              {t("set.logout")}
            </button>
            <button
              onClick={() => alert(t("set.deleteNotImpl"))}
              className="rounded-2xl border border-tuji-ink/15 px-6 py-3 text-sm font-extrabold text-tuji-ink3"
            >
              {t("set.deleteAccount")}
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
  unit,
  value,
  min,
  max,
  onChange,
  last,
}: {
  label: string;
  desc?: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  last?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = () => {
    const parsed = Math.round(Number(text));
    const clamped = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
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
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="w-16 rounded-lg bg-tuji-bg px-3 py-1.5 text-right text-xs font-bold text-tuji-ink outline-none focus:ring-2 focus:ring-tuji-teal"
        />
        <span className="text-xs font-bold text-tuji-ink3">{unit}</span>
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
  buttonLabel,
  onButtonClick,
  last,
}: {
  label: string;
  desc?: string;
  value?: string;
  type?: "value" | "chevron";
  toggle?: boolean;
  onToggle?: () => void;
  options?: { value: string; label: string }[];
  current?: string;
  onSelect?: (value: string) => void;
  buttonLabel?: string;
  onButtonClick?: () => void;
  last?: boolean;
}) {
  const isToggle = toggle !== undefined;
  const isSelect = !!options && !!onSelect;
  const isButton = !!buttonLabel && !!onButtonClick;
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
      ) : isSelect ? (
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
      ) : isButton ? (
        <button
          onClick={onButtonClick}
          className="shrink-0 rounded-lg bg-tuji-tealS px-3.5 py-1.5 text-xs font-extrabold text-tuji-teal"
        >
          {buttonLabel}
        </button>
      ) : type === "chevron" ? (
        <span className="shrink-0 text-lg text-tuji-ink4">›</span>
      ) : (
        <span className="shrink-0 text-[13px] font-semibold text-tuji-ink3">{value}</span>
      )}
    </div>
  );
}
