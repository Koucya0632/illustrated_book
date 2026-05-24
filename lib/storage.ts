"use client";

import type { CategoryId, Progress, QuizResult } from "@/types";

const KEY = "eepd-progress-v1";

const defaultProgress: Progress = {
  learnedIds: [],
  favoriteIds: [],
  quizHistory: [],
};

function safeRead(): Progress {
  if (typeof window === "undefined") return defaultProgress;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultProgress;
    const parsed = JSON.parse(raw) as Progress;
    return {
      learnedIds: Array.isArray(parsed.learnedIds) ? parsed.learnedIds : [],
      favoriteIds: Array.isArray(parsed.favoriteIds) ? parsed.favoriteIds : [],
      quizHistory: Array.isArray(parsed.quizHistory) ? parsed.quizHistory : [],
      lastCategoryVisited: parsed.lastCategoryVisited,
    };
  } catch {
    return defaultProgress;
  }
}

function write(progress: Progress) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(progress));
  window.dispatchEvent(new CustomEvent("eepd-progress-changed"));
}

export function getProgress(): Progress {
  return safeRead();
}

// Fire-and-forget POST. Failures are swallowed — server writes are best-effort,
// localStorage is always the immediate source of truth for the UI.
function post(url: string, body: unknown) {
  if (typeof window === "undefined") return;
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

export function toggleFavorite(id: string): boolean {
  const p = safeRead();
  const has = p.favoriteIds.includes(id);
  const next = has
    ? p.favoriteIds.filter((x) => x !== id)
    : [...p.favoriteIds, id];
  write({ ...p, favoriteIds: next });
  post("/api/users/favorites", { wordId: id, favorite: !has });
  return !has;
}

export function isFavorite(id: string): boolean {
  return safeRead().favoriteIds.includes(id);
}

export function markLearned(id: string) {
  const p = safeRead();
  if (p.learnedIds.includes(id)) return;
  write({ ...p, learnedIds: [...p.learnedIds, id] });
  post("/api/users/learned", { wordId: id });
}

export function setLastCategory(category: CategoryId) {
  const p = safeRead();
  write({ ...p, lastCategoryVisited: category });
}

export function recordQuiz(result: QuizResult) {
  const p = safeRead();
  const history = [result, ...p.quizHistory].slice(0, 50);
  write({ ...p, quizHistory: history });
  post("/api/users/quiz-results", {
    quizType: result.type,
    total: result.total,
    correct: result.correct,
  });
}

export function clearProgress() {
  write(defaultProgress);
}

// Called by HydrateUserState on every page load when the visitor is logged in:
// take whatever the server has and union it with what's already in
// localStorage. Server data takes precedence for items the server knows about.
export function hydrateFromServer(favorites: string[], learned: string[]) {
  if (typeof window === "undefined") return;
  const p = safeRead();
  const favSet = new Set([...p.favoriteIds, ...favorites]);
  const learnSet = new Set([...p.learnedIds, ...learned]);
  const next: Progress = {
    ...p,
    favoriteIds: Array.from(favSet),
    learnedIds: Array.from(learnSet),
  };
  // Avoid spurious writes if nothing changed (which also avoids subscriber thrash).
  if (
    next.favoriteIds.length === p.favoriteIds.length &&
    next.learnedIds.length === p.learnedIds.length &&
    next.favoriteIds.every((x) => p.favoriteIds.includes(x)) &&
    next.learnedIds.every((x) => p.learnedIds.includes(x))
  ) {
    return;
  }
  write(next);
}

export function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener("eepd-progress-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("eepd-progress-changed", handler);
    window.removeEventListener("storage", handler);
  };
}
