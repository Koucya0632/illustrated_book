// One-shot backfill: synthesize each word's pronunciation with Google Cloud
// TTS (Chirp 3 HD), upload the MP3 to our own Supabase Storage bucket, and
// record one word_media row per (word, locale). Public buckets are CDN-
// fronted, so clients stream the clip straight from the edge.
//
// Locales:
//   - English deck  → the headword (words.word) in en-US AND en-GB
//   - Japanese deck → the ja term (word_terms.term, language='ja') in ja-JP
//
// Idempotent: a (word_id, locale) that already has a word_media audio row is
// skipped unless --refresh is passed. Re-running picks up missing rows.
//
//   node --env-file=.env.local --import tsx scripts/generate-audio.ts
//   node --env-file=.env.local --import tsx scripts/generate-audio.ts --limit=5
//   node --env-file=.env.local --import tsx scripts/generate-audio.ts --refresh
//
// Requires: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// GOOGLE_TTS_API_KEY (a Google Cloud API key with the Text-to-Speech API
// enabled).
// Optional: CHIRP_VOICE — the Chirp 3 HD character name (default "Aoede").

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const BUCKET = "word-audio";
const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";
const MODEL = "chirp-3-hd";

// Chirp 3 HD voice names are shared across locales, so one character keeps the
// whole deck sounding like the same speaker. Override via CHIRP_VOICE (the
// bare character name, e.g. Sulafat=warm, Charon=clear); defaults to the breezy
// "Aoede". The final voice id is "<locale>-Chirp3-HD-<character>".
const CHIRP_VOICE = process.env.CHIRP_VOICE?.trim() || "Aoede";

function voiceFor(locale: string): { languageCode: string; name: string } {
  return { languageCode: locale, name: `${locale}-Chirp3-HD-${CHIRP_VOICE}` };
}

interface Job {
  wordId: string;
  locale: string;
  text: string;
}

function envOrDie(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[generate-audio] missing env ${name}`);
    process.exit(1);
  }
  return v;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseLimit(): number | null {
  const arg = process.argv.find((a) => a.startsWith("--limit="));
  if (!arg) return null;
  const n = Number(arg.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

async function ensureBucket(supabase: SB) {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (buckets?.some((b: { name: string }) => b.name === BUCKET)) {
    console.log(`[generate-audio] bucket "${BUCKET}" already exists`);
    return;
  }
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    // A single-word MP3 is a few dozen KB; 5 MB is plenty of headroom.
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["audio/mpeg"],
  });
  if (createErr) throw createErr;
  console.log(`[generate-audio] created public bucket "${BUCKET}"`);
}

// POST text:synthesize and return the decoded MP3 bytes. One retry on 429.
async function synthesize(apiKey: string, locale: string, text: string): Promise<Buffer> {
  const voice = voiceFor(locale);
  const body = JSON.stringify({
    input: { text },
    voice: { languageCode: voice.languageCode, name: voice.name },
    audioConfig: { audioEncoding: "MP3" },
  });
  const post = () =>
    fetch(`${TTS_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

  let res = await post();
  if (res.status === 429) {
    console.log("    429 — waiting 20s and retrying once");
    await sleep(20_000);
    res = await post();
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`TTS HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { audioContent?: string };
  if (!json.audioContent) throw new Error("TTS response had no audioContent");
  return Buffer.from(json.audioContent, "base64");
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const limit = parseLimit();

  const dbUrl = envOrDie("DATABASE_URL");
  const supabaseUrl = envOrDie("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = envOrDie("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = envOrDie("GOOGLE_TTS_API_KEY");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const sql = postgres(dbUrl, { ssl: "require", prepare: false, max: 1 });
  const publicBase = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;

  try {
    await ensureBucket(supabase);
    console.log(`[generate-audio] voice = <locale>-Chirp3-HD-${CHIRP_VOICE}`);

    // Build the full job list: en-US + en-GB headwords, plus ja-JP terms.
    const words = await sql<{ id: string; word: string }[]>`
      SELECT id, word FROM words
      WHERE deleted_at IS NULL AND status = 'published'
      ORDER BY id
    `;
    const jaTerms = await sql<{ word_id: string; term: string }[]>`
      SELECT t.word_id, t.term
      FROM word_terms t
      JOIN words w ON w.id = t.word_id
      WHERE t.language = 'ja' AND t.term <> ''
        AND w.deleted_at IS NULL AND w.status = 'published'
    `;

    let jobs: Job[] = [];
    for (const w of words) {
      if (!w.word) continue;
      jobs.push({ wordId: w.id, locale: "en-US", text: w.word });
      jobs.push({ wordId: w.id, locale: "en-GB", text: w.word });
    }
    for (const t of jaTerms) {
      jobs.push({ wordId: t.word_id, locale: "ja-JP", text: t.term });
    }

    // Idempotency: drop jobs that already have a word_media audio row.
    if (!refresh) {
      const have = await sql<{ word_id: string; locale: string | null }[]>`
        SELECT word_id, locale FROM word_media
        WHERE kind = 'audio' AND locale IS NOT NULL
      `;
      const haveSet = new Set(have.map((r) => `${r.word_id}|${r.locale}`));
      jobs = jobs.filter((j) => !haveSet.has(`${j.wordId}|${j.locale}`));
    }

    if (limit) jobs = jobs.slice(0, limit);
    console.log(`[generate-audio] ${jobs.length} clips to generate${refresh ? " (refresh)" : ""}`);

    let ok = 0;
    const failures: Array<{ key: string; reason: string }> = [];

    for (const job of jobs) {
      const key = `${job.wordId} ${job.locale}`;
      try {
        const mp3 = await synthesize(apiKey, job.locale, job.text);
        const path = `${job.wordId}/${job.locale}.mp3`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, mp3, {
          contentType: "audio/mpeg",
          upsert: true,
          cacheControl: "31536000",
        });
        if (upErr) throw new Error(`upload: ${upErr.message}`);
        const url = `${publicBase}${path}`;

        await sql`
          INSERT INTO word_media (word_id, kind, url, storage_path, mime_type, model, locale)
          VALUES (${job.wordId}, 'audio', ${url}, ${path}, 'audio/mpeg', ${MODEL}, ${job.locale})
          ON CONFLICT (word_id, kind, locale) WHERE kind = 'audio'
          DO UPDATE SET url = EXCLUDED.url, storage_path = EXCLUDED.storage_path,
                        mime_type = EXCLUDED.mime_type, model = EXCLUDED.model
        `;
        // Mirror the US clip onto words.audio_url for back-compat consumers.
        if (job.locale === "en-US") {
          await sql`UPDATE words SET audio_url = ${url} WHERE id = ${job.wordId}`;
        }

        ok++;
        console.log(`  ✓ ${key} → ${url}`);
        // Gentle pacing under the per-minute TTS quota; re-runs skip done rows.
        await sleep(150);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        failures.push({ key, reason });
        console.log(`  ✗ ${key}: ${reason}`);
      }
    }

    console.log(`[generate-audio] done: ${ok} generated, ${failures.length} failed`);
    if (failures.length) {
      console.log("[generate-audio] failures:");
      for (const f of failures) console.log(`  - ${f.key}: ${f.reason}`);
      process.exit(1);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("[generate-audio] failed:", e);
  process.exit(1);
});
