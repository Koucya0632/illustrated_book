"use client";

// Tiny CSV download button. Takes already-fetched rows and turns them into a
// blob URL on click — we don't open a new API for this, since the data is
// already on the page.

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Quote if it contains comma, double-quote, or newline. Double up embedded
  // quotes per RFC 4180.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function CsvButton({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}) {
  function download() {
    const csv = [headers, ...rows]
      .map((r) => r.map(escapeCell).join(","))
      .join("\r\n");
    // BOM so Excel on Windows reads UTF-8 correctly (中文 columns).
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  return (
    <button
      onClick={download}
      type="button"
      className="text-xs text-muted hover:text-sky-accent px-2 py-1 rounded hover:bg-sky-soft"
      title="下載 CSV"
    >
      ⬇ CSV
    </button>
  );
}
