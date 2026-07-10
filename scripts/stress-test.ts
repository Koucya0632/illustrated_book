// Local dev-only load test for the hot read paths: the study/atlas queue
// endpoints, per-user mastery, and the public word list. Deliberately
// excludes atlas AI endpoints (enrich/recognize/confirm) — those call paid
// OpenAI/Google Vision APIs and share a global rate limit with real users.
//
// Verified read-only: the full call graph behind each endpoint below
// (fetchDue, studyStats, getAllMastery, fetchAtlasDue, atlasStudyStats,
// attachMasteryAndSort, attachChoices, localizeStudyQueue, getSettings,
// getAllMasteryWithSchedule, getAllAtlasMasteryWithSchedule,
// getAllCardWords) never writes to the DB. Repeated runs against the same
// test account are safe — no state to reset between runs.
//
//   node --env-file=.env.local --import tsx scripts/stress-test.ts --endpoint=words --concurrency=5 --duration=10
//   node --env-file=.env.local --import tsx scripts/stress-test.ts --endpoint=study-queue --concurrency=10 --duration=30
//   node --env-file=.env.local --import tsx scripts/stress-test.ts --endpoint=atlas-queue --concurrency=10 --duration=30 --mode=review
//   node --env-file=.env.local --import tsx scripts/stress-test.ts --endpoint=mastery --concurrency=20 --duration=30
//
// Requires: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY (all three already in .env.local). Target
// backend must be running locally (`npm run dev`) — never point --url at a
// preview/production deployment.
//
// Note on interpreting latency: the Bearer-token auth path
// (lib/supabase/middleware.ts) validates the token against Supabase's own
// Auth server on EVERY request, which the middleware's own comments put at
// ~170-645ms. That round-trip is included in every authenticated request's
// latency below and is not part of our own app/DB code — expect it, don't
// chase it as a bug in this app.

import { createClient } from "@supabase/supabase-js";

type EndpointName = "study-queue" | "atlas-queue" | "mastery" | "words";

interface CliArgs {
  endpoint: EndpointName;
  url: string;
  concurrency: number;
  duration: number;
  limit: string;
  newLimit: string;
  mode: string;
  cefr: string;
  tags: string;
  category: string;
  lang: string;
}

interface RequestResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  serverTiming?: Record<string, number>;
  error?: string;
}

function envOrDie(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[stress-test] missing env ${name}`);
    process.exit(1);
  }
  return v;
}

function usage(): never {
  console.log(`Usage:
  node --env-file=.env.local --import tsx scripts/stress-test.ts --endpoint=<name> [options]

Endpoints: study-queue | atlas-queue | mastery | words

Options:
  --url=<origin>       default http://localhost:3000
  --concurrency=<n>    default 10
  --duration=<sec>     default 30
  --limit=<n>          study-queue, atlas-queue (default 20)
  --new=<n>            study-queue only (default 10)
  --mode=<new|review|both>  study-queue, atlas-queue (default both)
  --cefr=<a,b>         study-queue only, comma list
  --tags=<a,b>         study-queue only, comma list
  --category=<a,b>     study-queue only, comma list
  --lang=<code>        words only (default en)
`);
  process.exit(0);
}

function arg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function parseArgs(): CliArgs {
  if (process.argv.includes("--help") || process.argv.includes("-h")) usage();

  const endpoint = arg("endpoint", "");
  if (!["study-queue", "atlas-queue", "mastery", "words"].includes(endpoint)) {
    console.error(`[stress-test] --endpoint is required and must be one of: study-queue, atlas-queue, mastery, words`);
    usage();
  }

  return {
    endpoint: endpoint as EndpointName,
    url: arg("url", "http://localhost:3000"),
    concurrency: Math.max(1, Number(arg("concurrency", "10")) || 10),
    duration: Math.max(1, Number(arg("duration", "30")) || 30),
    limit: arg("limit", "20"),
    newLimit: arg("new", "10"),
    mode: arg("mode", "both"),
    cefr: arg("cefr", ""),
    tags: arg("tags", ""),
    category: arg("category", ""),
    lang: arg("lang", "en"),
  };
}

async function getAccessToken(): Promise<string> {
  const supabaseUrl = envOrDie("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = envOrDie("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = envOrDie("SUPABASE_SERVICE_ROLE_KEY");

  const email = process.env.STRESS_TEST_EMAIL || "stress-test@tuji.local";
  const password = process.env.STRESS_TEST_PASSWORD || "StressTest!2026Local";

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  // "already registered" is expected on every run after the first — fall
  // through to sign-in either way.
  if (createError && !/already|exists/i.test(createError.message)) {
    console.warn(`[stress-test] createUser warning: ${createError.message}`);
  }

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`[stress-test] sign-in failed: ${error?.message ?? "no session"}`);
  }
  console.log(`[stress-test] using test user ${data.user.id} (${email})`);
  return data.session.access_token;
}

function endpointConfig(args: CliArgs): { path: string; params: Record<string, string>; needsAuth: boolean } {
  switch (args.endpoint) {
    case "study-queue":
      return {
        path: "/api/study/queue",
        needsAuth: true,
        params: {
          limit: args.limit,
          new: args.newLimit,
          mode: args.mode,
          cefr: args.cefr,
          tags: args.tags,
          category: args.category,
        },
      };
    case "atlas-queue":
      return {
        path: "/api/atlas/study/queue",
        needsAuth: true,
        params: { limit: args.limit, mode: args.mode },
      };
    case "mastery":
      return { path: "/api/users/mastery", needsAuth: true, params: {} };
    case "words":
      return { path: "/api/words", needsAuth: false, params: { lang: args.lang } };
  }
}

function buildUrl(base: string, path: string, params: Record<string, string>): string {
  const u = new URL(path, base);
  for (const [k, v] of Object.entries(params)) {
    if (v) u.searchParams.set(k, v);
  }
  return u.toString();
}

function parseServerTiming(header: string | null): Record<string, number> | undefined {
  if (!header) return undefined;
  const out: Record<string, number> = {};
  for (const entry of header.split(",")) {
    const [name, durPart] = entry.trim().split(";dur=");
    if (!name || durPart === undefined) continue;
    const dur = Number(durPart);
    if (!Number.isNaN(dur)) out[name.trim()] = dur;
  }
  return Object.keys(out).length ? out : undefined;
}

async function runWorker(
  url: string,
  token: string | undefined,
  deadline: number,
  results: RequestResult[],
): Promise<void> {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  while (Date.now() < deadline) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, { headers });
      const serverTiming = parseServerTiming(res.headers.get("server-timing"));
      // Drain the body so the connection is released cleanly; we don't need
      // the parsed JSON for a stress test, only status + timing.
      await res.arrayBuffer();
      results.push({ ok: res.ok, status: res.status, latencyMs: performance.now() - t0, serverTiming });
    } catch (err) {
      results.push({
        ok: false,
        status: 0,
        latencyMs: performance.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function printSummary(results: RequestResult[], wallMs: number, endpoint: EndpointName, path: string): void {
  const total = results.length;
  const errors = results.filter((r) => !r.ok);
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const rps = total / (wallMs / 1000);

  const byStatus = new Map<string, number>();
  for (const r of errors) {
    const key = r.status ? String(r.status) : `network (${r.error ?? "unknown"})`;
    byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
  }

  console.log(`\n===== Stress Test Summary =====`);
  console.log(`Endpoint:        GET ${path}`);
  console.log(`Duration:        ${(wallMs / 1000).toFixed(1)}s (wall clock)`);
  console.log(`Total requests:  ${total}`);
  console.log(`Successful:      ${total - errors.length} (${(((total - errors.length) / total) * 100 || 0).toFixed(1)}%)`);
  console.log(`Errors:          ${errors.length} (${((errors.length / total) * 100 || 0).toFixed(1)}%)`);
  if (byStatus.size) {
    console.log(`  by status:     ${Array.from(byStatus, ([k, v]) => `${k} x ${v}`).join(", ")}`);
  }
  console.log(`Requests/sec:    ${rps.toFixed(2)}`);

  console.log(`\nLatency (ms):`);
  console.log(`  p50:   ${percentile(latencies, 50).toFixed(0)}`);
  console.log(`  p90:   ${percentile(latencies, 90).toFixed(0)}`);
  console.log(`  p95:   ${percentile(latencies, 95).toFixed(0)}`);
  console.log(`  p99:   ${percentile(latencies, 99).toFixed(0)}`);
  console.log(`  max:   ${(latencies[latencies.length - 1] ?? 0).toFixed(0)}`);

  const withTiming = results.filter((r) => r.serverTiming);
  if (withTiming.length === 0) {
    console.log(`\nServer-side timing: (no Server-Timing header returned by this endpoint)`);
  } else {
    const sums: Record<string, number> = {};
    for (const r of withTiming) {
      for (const [k, v] of Object.entries(r.serverTiming!)) sums[k] = (sums[k] ?? 0) + v;
    }
    console.log(`\nServer-side timing breakdown (avg ms, N=${withTiming.length} responses with Server-Timing):`);
    for (const [k, v] of Object.entries(sums)) {
      console.log(`  ${k.padEnd(10)} ${(v / withTiming.length).toFixed(1)}`);
    }
  }
  console.log(`================================\n`);
}

async function main() {
  const args = parseArgs();
  const { path, params, needsAuth } = endpointConfig(args);
  const url = buildUrl(args.url, path, params);

  console.log(`[stress-test] endpoint=${args.endpoint} url=${url}`);
  console.log(`[stress-test] concurrency=${args.concurrency} duration=${args.duration}s`);

  const token = needsAuth ? await getAccessToken() : undefined;

  const deadline = Date.now() + args.duration * 1000;
  const results: RequestResult[] = [];
  const wallStart = performance.now();
  await Promise.all(
    Array.from({ length: args.concurrency }, () => runWorker(url, token, deadline, results)),
  );
  const wallMs = performance.now() - wallStart;

  printSummary(results, wallMs, args.endpoint, path);
}

main().catch((err) => {
  console.error("[stress-test] fatal:", err);
  process.exit(1);
});
