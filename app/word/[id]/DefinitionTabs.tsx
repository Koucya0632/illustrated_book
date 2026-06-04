"use client";

import { useState } from "react";

interface Tab {
  key: string;
  label: string;
  content: React.ReactNode;
}

export default function DefinitionTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  if (tabs.length === 0) return null;
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="overflow-hidden rounded-[22px] bg-white shadow-soft">
      <div role="tablist" className="flex border-b border-tuji-ink/5">
        {tabs.map((t) => {
          const isActive = t.key === current.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={`flex-1 px-3 py-3 text-[13px] font-extrabold transition ${
                isActive
                  ? "border-b-2 border-tuji-teal text-tuji-ink"
                  : "border-b-2 border-transparent text-tuji-ink3 hover:text-tuji-ink2"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="p-4">{current.content}</div>
    </div>
  );
}
