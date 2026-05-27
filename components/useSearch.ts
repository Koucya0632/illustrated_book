"use client";

import { useEffect, useRef, useState } from "react";
import type { Word } from "@/types";

export interface SearchState {
  results: Word[];
  loading: boolean;
  source: "idle" | "cache" | "server" | "error";
}

// Process-wide LRU-ish cache (cap to avoid unbounded growth on long sessions).
const CACHE_MAX = 64;
const cache = new Map<string, Word[]>();

function readCache(key: string): Word[] | undefined {
  const v = cache.get(key);
  if (!v) return undefined;
  // Touch — re-insert to keep this entry "recent" in iteration order.
  cache.delete(key);
  cache.set(key, v);
  return v;
}

function writeCache(key: string, results: Word[]): void {
  cache.delete(key);
  cache.set(key, results);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function useSearch(
  query: string,
  options: { debounceMs?: number; limit?: number } = {},
): SearchState {
  const { debounceMs = 300, limit = 50 } = options;
  const [state, setState] = useState<SearchState>({
    results: [],
    loading: false,
    source: "idle",
  });
  // Bump on each effect run so stale fetches can short-circuit.
  const reqId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setState({ results: [], loading: false, source: "idle" });
      return;
    }

    const cacheKey = `${q}|${limit}`;
    const cached = readCache(cacheKey);
    if (cached) {
      setState({ results: cached, loading: false, source: "cache" });
      return;
    }

    setState((s) => ({ ...s, loading: true }));
    const id = ++reqId.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&limit=${limit}`,
          { signal: controller.signal },
        );
        if (id !== reqId.current) return;
        if (!res.ok) throw new Error(`search ${res.status}`);
        const json = (await res.json()) as { results: Word[] };
        if (id !== reqId.current) return;
        writeCache(cacheKey, json.results);
        setState({
          results: json.results,
          loading: false,
          source: "server",
        });
      } catch (err) {
        if (id !== reqId.current) return;
        if ((err as { name?: string }).name === "AbortError") return;
        console.warn("[useSearch] fetch failed", err);
        setState({ results: [], loading: false, source: "error" });
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, debounceMs, limit]);

  return state;
}
