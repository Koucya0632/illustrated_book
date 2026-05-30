"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCategories } from "@/components/CategoriesProvider";
import type {
  CEFRLevel,
  CategoryId,
  Definition,
  Example,
  RelationType,
  Word,
  WordRelation,
  WordStatus,
} from "@/types";

type Mode = "create" | "edit";

const CEFR_LEVELS: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const RELATION_TYPES: { value: RelationType; label: string }[] = [
  { value: "synonym", label: "同義 synonym" },
  { value: "antonym", label: "反義 antonym" },
  { value: "hypernym", label: "上位 hypernym" },
  { value: "hyponym", label: "下位 hyponym" },
  { value: "confusing", label: "易混淆 confusing" },
  { value: "see-also", label: "相關 see-also" },
];
const COMMON_LANGUAGES = [
  { code: "zh", label: "中文 zh" },
  { code: "ja", label: "日文 ja" },
  { code: "en", label: "English en" },
];

function makeExample(en = "", zh = "", sortOrder = 0): Example {
  return { en, zh, translations: { zh }, sortOrder };
}

const empty: Word = {
  id: "",
  word: "",
  alsoKnownAs: [],
  category: "kitchen" as CategoryId,
  partOfSpeech: "noun",
  pronunciation: "",
  audioUrl: undefined,
  imageUrl: "",
  cefrLevel: undefined,
  status: "published",
  definitions: [{ language: "zh", definition: "", sortOrder: 0 }],
  chinese: "",
  collocations: [],
  examples: [makeExample()],
  tags: [],
  relations: [],
  note: "",
};

export default function WordForm({
  mode,
  initial,
}: {
  mode: Mode;
  initial?: Word;
}) {
  const router = useRouter();
  const categories = useCategories();
  const [w, setW] = useState<Word>(initial ?? empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);

  async function handleEnrich() {
    if (mode !== "edit" || !initial) return;
    setError(null);
    setEnriching(true);
    try {
      const res = await fetch(`/api/admin/words/${encodeURIComponent(initial.id)}/enrich`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "enrich failed");
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "enrich failed");
      setEnriching(false);
    }
  }

  function set<K extends keyof Word>(key: K, value: Word[K]) {
    setW((prev) => ({ ...prev, [key]: value }));
  }

  function setListString(key: "alsoKnownAs" | "collocations" | "tags", value: string) {
    const arr = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    set(key, arr as Word[typeof key]);
  }

  // ----- definitions -----
  function updateDef(i: number, patch: Partial<Definition>) {
    set("definitions", w.definitions.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function addDef() {
    set("definitions", [
      ...w.definitions,
      { language: "zh", definition: "", sortOrder: w.definitions.length },
    ]);
  }
  function removeDef(i: number) {
    if (w.definitions.length <= 1) return;
    set("definitions", w.definitions.filter((_, idx) => idx !== i));
  }

  // ----- examples (multilingual translations) -----
  function updateExample(i: number, patch: Partial<Example>) {
    const next = w.examples.map((ex, idx) => (idx === i ? { ...ex, ...patch } : ex));
    set("examples", next);
  }
  function updateExampleTranslation(i: number, lang: string, value: string) {
    const next = w.examples.map((ex, idx) => {
      if (idx !== i) return ex;
      const translations = { ...ex.translations, [lang]: value };
      // Keep the convenience `zh` field in sync when zh is the one being edited.
      const zh = lang === "zh" ? value : ex.zh;
      return { ...ex, translations, zh };
    });
    set("examples", next);
  }
  function addExample() {
    set("examples", [...w.examples, makeExample("", "", w.examples.length)]);
  }
  function removeExample(i: number) {
    if (w.examples.length <= 1) return;
    set("examples", w.examples.filter((_, idx) => idx !== i));
  }

  // ----- relations (typed) -----
  function updateRel(i: number, patch: Partial<WordRelation>) {
    set("relations", w.relations.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRel() {
    set("relations", [...w.relations, { wordId: "", type: "see-also" }]);
  }
  function removeRel(i: number) {
    set("relations", w.relations.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const url = mode === "create"
        ? "/api/admin/words"
        : `/api/admin/words/${encodeURIComponent(initial!.id)}`;
      const method = mode === "create" ? "POST" : "PATCH";
      // Project relations down to the legacy fields so the validator + the
      // legacy storage columns are also populated.
      const seeAlso = w.relations.filter((r) => r.type === "see-also").map((r) => r.wordId);
      const confusing = w.relations
        .filter((r) => r.type === "confusing")
        .map((r) => ({ word: r.wordId, note: r.note ?? "" }));
      // Make sure the legacy `chinese` mirror is the first zh definition (the
      // server still requires it until Phase 3 drops the column).
      const zhDef = w.definitions.find((d) => d.language === "zh")?.definition ?? "";
      const cleaned: Word = {
        ...w,
        chinese: zhDef,
        note: w.note?.trim() || undefined,
        audioUrl: w.audioUrl?.trim() || undefined,
        relatedWords: seeAlso,
        confusingWords: confusing,
      };
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cleaned),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "save failed");
      }
      router.push("/admin/words");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <p className="text-sm bg-rose-50 text-rose-700 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="id (kebab-case, 唯一)" required>
          <input
            value={w.id}
            onChange={(e) => set("id", e.target.value)}
            disabled={mode === "edit"}
            placeholder="例如 fridge / coffee-table"
            className="w-full rounded-lg bg-white px-3 py-2 outline-none border border-black/10 focus:ring-2 ring-sky-accent disabled:bg-cream"
          />
        </Field>
        <Field label="分類" required>
          <select
            value={w.category}
            onChange={(e) => set("category", e.target.value as CategoryId)}
            className={INPUT}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name} · {c.nameZh}
              </option>
            ))}
          </select>
        </Field>
        <Field label="英文" required>
          <input value={w.word} onChange={(e) => set("word", e.target.value)} className={INPUT} />
        </Field>
        <Field label="詞性" required>
          <input value={w.partOfSpeech} onChange={(e) => set("partOfSpeech", e.target.value)} className={INPUT} placeholder="noun, verb, adjective..." />
        </Field>
        <Field label="音標 (IPA)" required>
          <input value={w.pronunciation} onChange={(e) => set("pronunciation", e.target.value)} className={INPUT} placeholder="/frɪdʒ/" />
        </Field>
        <Field label="發音音檔 URL (選填)">
          <input
            value={w.audioUrl ?? ""}
            onChange={(e) => set("audioUrl", e.target.value)}
            className={INPUT}
            placeholder="https://...mp3"
          />
        </Field>
        <Field label="圖片 URL" required>
          <ImageField
            wordId={w.id}
            imageUrl={w.imageUrl}
            onChange={(url) => set("imageUrl", url)}
          />
        </Field>
        <Field label="難度 (CEFR)">
          <select
            value={w.cefrLevel ?? ""}
            onChange={(e) => set("cefrLevel", (e.target.value || undefined) as CEFRLevel | undefined)}
            className={INPUT}
          >
            <option value="">— 未指定 —</option>
            {CEFR_LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="狀態" required>
          <select
            value={w.status}
            onChange={(e) => set("status", e.target.value as WordStatus)}
            className={INPUT}
          >
            <option value="published">published（公開）</option>
            <option value="draft">draft（草稿，不公開）</option>
            <option value="archived">archived（封存，不公開）</option>
          </select>
        </Field>
        <Field label="同義 / 別稱 (逗號分隔)">
          <input
            defaultValue={(w.alsoKnownAs ?? []).join(", ")}
            onBlur={(e) => setListString("alsoKnownAs", e.target.value)}
            className={INPUT}
            placeholder="refrigerator, ice box"
          />
        </Field>
        <Field label="搭配詞 (逗號分隔)">
          <input
            defaultValue={(w.collocations ?? []).join(", ")}
            onBlur={(e) => setListString("collocations", e.target.value)}
            className={INPUT}
            placeholder="open the fridge, put in the fridge"
          />
        </Field>
        <Field label="tags (逗號分隔 slug)">
          <input
            defaultValue={w.tags.join(", ")}
            onBlur={(e) => setListString("tags", e.target.value)}
            className={INPUT}
            placeholder="formal, slang, business"
          />
        </Field>
      </div>

      <Field label="備註（顯示在詳情頁的小提示）">
        <textarea
          value={w.note ?? ""}
          onChange={(e) => set("note", e.target.value)}
          rows={2}
          className={INPUT + " resize-y"}
          placeholder="例如：thyme 的 th 不發音。"
        />
      </Field>

      <fieldset className="space-y-3">
        <legend className="font-semibold text-ink">定義（多語言）</legend>
        {w.definitions.map((d, i) => (
          <div key={i} className="grid sm:grid-cols-12 gap-2 bg-cream rounded-lg p-3 items-center">
            <select
              value={d.language}
              onChange={(e) => updateDef(i, { language: e.target.value })}
              className={INPUT + " sm:col-span-2"}
            >
              {COMMON_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <input
              value={d.definition}
              onChange={(e) => updateDef(i, { definition: e.target.value })}
              placeholder="意思"
              className={INPUT + " sm:col-span-7"}
            />
            <select
              value={d.cefrLevel ?? ""}
              onChange={(e) =>
                updateDef(i, { cefrLevel: (e.target.value || undefined) as CEFRLevel | undefined })
              }
              className={INPUT + " sm:col-span-2"}
            >
              <option value="">CEFR—</option>
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeDef(i)}
              className="text-xs text-rose-500 hover:underline sm:col-span-1"
              disabled={w.definitions.length <= 1}
            >
              移除
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addDef}
          className="text-sm text-sky-accent hover:underline"
        >
          + 加一條定義
        </button>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold text-ink">例句</legend>
        {w.examples.map((ex, i) => (
          <div key={i} className="space-y-2 bg-cream rounded-lg p-3">
            <input
              value={ex.en}
              onChange={(e) => updateExample(i, { en: e.target.value })}
              placeholder="English example"
              className={INPUT}
            />
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                中文翻譯
                <input
                  value={ex.translations.zh ?? ""}
                  onChange={(e) => updateExampleTranslation(i, "zh", e.target.value)}
                  className={INPUT + " mt-1"}
                />
              </label>
              <label className="text-xs text-muted">
                日文翻譯（選填）
                <input
                  value={ex.translations.ja ?? ""}
                  onChange={(e) => updateExampleTranslation(i, "ja", e.target.value)}
                  className={INPUT + " mt-1"}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => removeExample(i)}
              className="text-xs text-rose-500 hover:underline"
              disabled={w.examples.length <= 1}
            >
              移除這句
            </button>
          </div>
        ))}
        <button type="button" onClick={addExample} className="text-sm text-sky-accent hover:underline">
          + 加一句例句
        </button>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold text-ink">關聯字 (同義 / 反義 / 易混 / 相關)</legend>
        {w.relations.length === 0 && (
          <p className="text-xs text-muted">尚未加入關聯。</p>
        )}
        {w.relations.map((r, i) => (
          <div key={i} className="grid sm:grid-cols-12 gap-2 bg-cream rounded-lg p-3 items-center">
            <select
              value={r.type}
              onChange={(e) => updateRel(i, { type: e.target.value as RelationType })}
              className={INPUT + " sm:col-span-3"}
            >
              {RELATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              value={r.wordId}
              onChange={(e) => updateRel(i, { wordId: e.target.value })}
              placeholder="word id 或 概念字"
              className={INPUT + " sm:col-span-3"}
            />
            <input
              value={r.note ?? ""}
              onChange={(e) => updateRel(i, { note: e.target.value })}
              placeholder="附註（如「比較正式」）"
              className={INPUT + " sm:col-span-5"}
            />
            <button
              type="button"
              onClick={() => removeRel(i)}
              className="text-xs text-rose-500 hover:underline sm:col-span-1"
            >
              移除
            </button>
          </div>
        ))}
        <button type="button" onClick={addRel} className="text-sm text-sky-accent hover:underline">
          + 加一個關聯
        </button>
      </fieldset>

      <div className="flex items-center gap-3 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-3 rounded-full bg-sky-accent text-white font-medium shadow-card hover:bg-sky-accent/90 disabled:opacity-50"
        >
          {saving ? "儲存中..." : mode === "create" ? "建立" : "儲存變更"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/words")}
          className="px-5 py-3 rounded-full bg-white text-ink shadow-card hover:shadow-lg"
        >
          取消
        </button>
        {mode === "edit" && (
          <button
            type="button"
            onClick={handleEnrich}
            disabled={enriching || saving}
            className="ml-auto px-5 py-3 rounded-full bg-white text-ink shadow-card hover:shadow-lg disabled:opacity-50"
          >
            {enriching ? "生成中..." : "AI 生成補齊"}
          </button>
        )}
      </div>
    </form>
  );
}

const INPUT =
  "w-full rounded-lg bg-white px-3 py-2 outline-none border border-black/10 focus:ring-2 ring-sky-accent";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm text-ink font-medium">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ImageField({
  wordId,
  imageUrl,
  onChange,
}: {
  wordId: string;
  imageUrl: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-uploading the same file
    if (!file) return;
    if (!wordId || !/^[a-z0-9-]+$/.test(wordId)) {
      setUploadErr("先填好 id（kebab-case）再上傳");
      return;
    }
    setUploadErr(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.set("id", wordId);
      body.set("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `upload failed (${res.status})`);
      // Cache-bust so the preview reflects the new image immediately.
      onChange(j.url + `?v=${Date.now()}`);
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        value={imageUrl}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT}
        placeholder="貼上 URL，或下方上傳檔案"
      />
      <div className="flex items-center gap-3">
        <label className="text-xs px-3 py-1.5 rounded-full bg-white shadow-soft hover:shadow-card cursor-pointer">
          {uploading ? "上傳中…" : "📤 上傳圖片"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleFile}
            disabled={uploading}
          />
        </label>
        {imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageUrl}
            alt="preview"
            className="w-12 h-12 rounded object-cover bg-cream"
          />
        )}
      </div>
      {uploadErr && (
        <p className="text-xs text-rose-600 bg-rose-50 rounded px-2 py-1">{uploadErr}</p>
      )}
    </div>
  );
}
