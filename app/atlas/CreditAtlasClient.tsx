"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { CreditBalance } from "@/lib/credits/wallet";
import { creditErrorMessage, acceptanceRejected, type CreditOperation, type CreditCatalog } from "@/lib/credits/client-contracts";

interface Photo { id: string; imageUrl: string; thumbUrl: string }
interface Offer { id: string; points: number; targetLanguage: "en" | "ja"; feature: string; expiresAt: string }
interface Pending { quoteId: string; key: string }
class RequestError extends Error {
  constructor(public code: string, public status: number) { super(creditErrorMessage(code)); }
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, cache: "no-store" });
  const result = await res.json();
  if (!res.ok) throw new RequestError(result.error ?? "credits_unavailable", res.status);
  return result;
}
const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const button = "rounded-xl bg-tuji-teal px-4 py-3 font-bold text-white disabled:opacity-40";
const secondary = "rounded-xl border border-tuji-tealS px-4 py-3 font-bold disabled:opacity-40";
const active = (op: CreditOperation) => ["reserved", "running", "reconciling"].includes(op.state) ||
  (op.state === "committed" && ["pending", "running", "reconciling"].includes(op.fulfillmentState));

export default function CreditAtlasClient({ userId }: { userId: string }) {
  const [wallet, setWallet] = useState<CreditBalance | null>(null);
  const [catalog, setCatalog] = useState<CreditCatalog | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]), [photo, setPhoto] = useState<Photo | null>(null);
  const [operations, setOperations] = useState<CreditOperation[]>([]), [operation, setOperation] = useState<CreditOperation | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null), [pending, setPending] = useState<Pending | null>(null);
  const [language, setLanguage] = useState<"en" | "ja">("en");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const storageKey = catalog ? `tuji:credit-accept:${userId}:${catalog.environment}` : null;
  function updateWallet(next: CreditBalance) {
    setWallet(old => old && old.environment === next.environment && BigInt(old.walletVersion) > BigInt(next.walletVersion) ? old : next);
  }
  async function load() {
    const config = await api<CreditCatalog>("/api/credits/catalog"); setCatalog(config);
    const stored = localStorage.getItem(`tuji:credit-accept:${userId}:${config.environment}`);
    if (stored) {
      try { const p = JSON.parse(stored); if (typeof p.quoteId === "string" && typeof p.key === "string") setPending(p); }
      catch { /* A corrupt local draft has no authority over the wallet. */ }
    }
    const results = await Promise.allSettled([
      api<CreditBalance>("/api/credits/wallet").then(updateWallet),
      api<{ images: Photo[] }>("/api/atlas/images").then(r => { setPhotos(r.images); setPhoto(old => old ?? r.images[0] ?? null); }),
      api<{ operations: CreditOperation[] }>("/api/ai/operations").then(r => { setOperations(r.operations); setOperation(old => old ?? r.operations.find(active) ?? r.operations[0] ?? null); }),
    ]);
    const failed = results.find(r => r.status === "rejected");
    if (failed?.status === "rejected" && config.operationsEnabled) throw failed.reason;
  }
  useEffect(() => { load().catch(e => setError(e.message)); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!operation || !active(operation)) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      api<CreditOperation>(`/api/ai/operations/${operation.id}`, { signal: controller.signal }).then(next => {
        setOperation(next); setOperations(old => [next, ...old.filter(o => o.id !== next.id)]);
        if (next.state !== operation.state || next.fulfillmentState !== operation.fulfillmentState) {
          api<CreditBalance>("/api/credits/wallet", { signal: controller.signal }).then(updateWallet).catch(() => {});
        }
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    }, 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [operation?.id, operation?.state, operation?.fulfillmentState]); // eslint-disable-line react-hooks/exhaustive-deps
  async function act(run: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await run(); } catch (e) { setError(e instanceof Error ? e.message : creditErrorMessage("credits_unavailable")); }
    finally { setBusy(false); }
  }
  async function accept() {
    if (!storageKey) return;
    const request = pending ?? (offer ? { quoteId: offer.id, key: crypto.randomUUID() } : null);
    if (!request) return;
    // Keep the same quote and key after a lost response; never repeat a paid action with a new key.
    localStorage.setItem(storageKey, JSON.stringify(request)); setPending(request);
    try {
      const op = await api<CreditOperation>("/api/ai/operations", { ...json({ quoteId: request.quoteId }),
        headers: { "Content-Type": "application/json", "Idempotency-Key": request.key } });
      setOperation(op); setOperations(old => [op, ...old.filter(o => o.id !== op.id)]); setOffer(null);
      localStorage.removeItem(storageKey); setPending(null);
      updateWallet(await api<CreditBalance>("/api/credits/wallet"));
    } catch (e) {
      // An explicit rejected request can be re-quoted; a timeout or 5xx stays pending.
      if (e instanceof RequestError && acceptanceRejected(e.code)) {
        localStorage.removeItem(storageKey); setPending(null); setOffer(null);
      }
      throw e;
    }
  }
  async function cards(itemId: string) {
    await api(`/api/atlas/items/${itemId}/cards`, json({ cardTypes: ["image_recall", "flashcard"] }));
  }
  const status = operation ? ({ reserved: "等待處理", running: "AI 辨識中", reconciling: "正在確認處理結果", committed: "辨識完成", released: "未扣點，已釋放預留" }[operation.state] ?? "同步中") : "";
  return <div className="mx-auto max-w-5xl space-y-5 px-5 py-6 text-tuji-ink">
    <header className="flex items-center justify-between"><h1 className="text-2xl font-extrabold">自製圖鑑</h1><Link href="/atlas/study">開始複習</Link></header>
    <section className="rounded-2xl bg-white p-5 shadow-soft">
      <div className="flex items-center gap-3"><Image src="/icons/credit-can.png" width={52} height={52} alt="" /><div><h2 className="font-bold">罐頭點數</h2><p className="text-2xl font-extrabold">{wallet?.available.toLocaleString() ?? "—"}<span className="ml-2 text-sm font-normal">點可用</span></p></div></div>
      {wallet && <p className="mt-2 text-sm text-tuji-ink3">預留 {wallet.reserved} 點 · 贈點 {wallet.giftAvailable} · 購買點 {wallet.paidAvailable}</p>}
      <p className="mt-3 font-bold">每月免費贈送 1,000 點</p>
      <p className="mt-1 text-sm text-tuji-ink3">免費額度剩餘 {wallet?.monthlyAvailable ?? "—"} 點 · 簽到點 {wallet?.checkInAvailable ?? "—"} 點</p>
      <p className="mt-1 text-sm text-tuji-ink3">每月自動補滿，不累積。簽到點與購買點數不過期。</p>
      {wallet?.reconciliationRequired && <p role="status" className="mt-3">退款點數正在核對，新增 AI 工作暫停。</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className={secondary} disabled={busy || !catalog?.checkInEnabled || !wallet?.benefits.hasLifetime || wallet.benefits.checkedInToday} onClick={() => act(async () => { const r = await api<{ wallet: CreditBalance }>("/api/credits/check-in", json({})); updateWallet(r.wallet); })}>{wallet?.benefits.checkedInToday ? "今天已簽到" : "每日簽到"}</button>
        <button className={secondary} disabled={busy} onClick={() => act(load)}>重新同步</button>
      </div>
      <p className="mt-3 text-sm text-tuji-ink3">每天簽到 10 點，每月最多 300 點。日期依 UTC 計算。加購請使用 iOS App。</p>
      {!catalog?.operationsEnabled && <p className="mt-3">AI 點數功能目前暫停接受新工作。</p>}
    </section>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4">{error}</p>}
    {pending && <section className="rounded-2xl bg-white p-5"><p>上次的扣點確認尚未同步，請重試同一筆操作。</p><button className={`${button} mt-3`} disabled={busy} onClick={() => act(accept)}>重試同步</button></section>}
    <div className="grid gap-5 md:grid-cols-[240px_1fr]">
      <aside className="space-y-3"><label className={`${secondary} block cursor-pointer bg-white text-center`}>上傳照片<input className="sr-only" type="file" accept="image/*" disabled={busy || !!pending || !catalog?.operationsEnabled} onChange={e => {
        const file = e.currentTarget.files?.[0]; e.currentTarget.value = "";
        if (file) act(async () => { const body = new FormData(); body.append("file", file); const r = await api<{ image: Photo }>("/api/ai/images", { method: "POST", body }); setPhoto(r.image); setPhotos(old => [r.image, ...old.filter(p => p.id !== r.image.id)]); setOffer(null); setOperation(null); });
      }} /></label><p className="text-xs text-tuji-ink3">未建卡照片保留 7 天，上傳不扣點。</p>
        <div className="grid grid-cols-2 gap-2">{photos.map(p => <button key={p.id} disabled={busy || !!pending} className={photo?.id === p.id ? "rounded-xl ring-2 ring-tuji-teal" : "rounded-xl"} onClick={() => { setPhoto(p); setOffer(null); setOperation(null); }}><Image src={p.thumbUrl} unoptimized width={100} height={100} className="h-24 w-full rounded-xl object-cover" alt="圖鑑照片" /></button>)}</div>
      </aside>
      <main className="space-y-4 rounded-2xl bg-white p-5 shadow-soft">
        {photo && <Image src={photo.imageUrl} unoptimized width={800} height={600} className="max-h-72 w-full rounded-xl object-contain" alt="選取的照片" />}
        <label className="block">學習語言 <select className="ml-2 rounded-lg border p-2" value={language} disabled={busy || !!pending} onChange={e => { setLanguage(e.target.value as "en" | "ja"); setOffer(null); }}><option value="en">英文</option><option value="ja">日文</option></select></label>
        <div className="flex flex-wrap gap-2">{["primary", "precision"].map(feature => <button key={feature} className={secondary} disabled={!photo || busy || !!pending || !catalog?.operationsEnabled || !!wallet?.reconciliationRequired} onClick={() => act(async () => {
          const q = await api<{ id: string; points: number; expiresAt: string }>("/api/ai/quotes", json({ imageId: photo!.id, feature: `atlas.recognize.${feature}`, targetLanguage: language, glossLanguage: null }));
          setOffer({ ...q, feature, targetLanguage: language });
        })}>{feature === "primary" ? "普通辨識報價" : "高精度辨識報價"}</button>)}</div>
        {offer && <section className="space-y-3 rounded-xl bg-tuji-bg p-4" aria-label="確認扣點"><h2 className="font-bold">{offer.feature === "primary" ? "普通" : "高精度"}辨識 · {offer.points} 點</h2><p>辨識 {offer.targetLanguage === "ja" ? "日文" : "英文"}詞彙，包含一張卡的基本補充。成功交付結果才扣點。</p><button className={button} disabled={busy || !!pending || !wallet || wallet.available < offer.points} onClick={() => act(accept)}>確認使用 {offer.points} 點</button><button className={`${secondary} ml-2`} disabled={busy} onClick={() => setOffer(null)}>取消報價</button></section>}
        {operation && <section className="space-y-3"><p role="status" className="font-bold">{status} · {operation.points} 點</p>
          {operation.state === "reserved" && <button className={secondary} disabled={busy} onClick={() => act(async () => { setOperation(await api(`/api/ai/operations/${operation.id}/cancel`, json({}))); updateWallet(await api("/api/credits/wallet")); })}>取消尚未執行的工作</button>}
          {operation.state === "committed" && !operation.confirmedItemId && operation.result?.candidates.map(c => <button key={c.id} className={`${secondary} block w-full text-left`} disabled={busy} onClick={() => act(async () => {
            const r = await api<{ item: { id: string }; operation: CreditOperation }>(`/api/ai/operations/${operation.id}/confirm`, json({ candidateId: c.id }));
            setOperation(r.operation); await cards(r.item.id);
          })}>{c.label} · {c.zhHant} <span className="float-right">選用並建卡</span></button>)}
          {operation.confirmedItemId && <><p>卡片已保存。{({ pending: "基本補充等待處理", running: "正在補充", reconciling: "正在確認補充結果", completed: "基本補充已完成", compensated: "補充未完成，已按原來源返還點數", superseded: "卡片已變更，原補充已結束" }[operation.fulfillmentState] ?? "")}</p><button className={secondary} disabled={busy} onClick={() => act(() => cards(operation.confirmedItemId!))}>同步複習卡片</button></>}
        </section>}
      </main>
    </div>
    {operations.length > 0 && <section className="rounded-2xl bg-white p-5"><h2 className="mb-3 font-bold">最近的 AI 工作</h2><div className="flex flex-wrap gap-2">{operations.map(o => <button key={o.id} className={secondary} disabled={busy || !!pending} onClick={() => { setOperation(o); setPhoto(photos.find(p => p.id === o.imageId) ?? null); setOffer(null); }}>{o.targetLanguage === "ja" ? "日文" : "英文"} · {o.feature.endsWith("precision") ? "高精度" : "普通"} · {o.points} 點</button>)}</div></section>}
  </div>;
}
