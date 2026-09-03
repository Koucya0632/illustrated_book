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
//   node --env-file=.env.local --import tsx scripts/generate-audio.ts \
//     --refresh --word-id=access-card --locale=ja-JP
//   node --env-file=.env.local --import tsx scripts/generate-audio.ts \
//     --dry-run --refresh --word-id=access-card --locale=ja-JP
//
// Requires: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// GOOGLE_TTS_API_KEY (a Google Cloud API key with the Text-to-Speech API
// enabled).
// Optional: CHIRP_VOICE — the Chirp 3 HD character name (default "Aoede").

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import {
  assertAudioSelection,
  buildAudioArtifact,
  buildAudioJobs,
  buildExampleAudioArtifact,
  buildExampleAudioJobs,
  parseAudioGenerationOptions,
  selectAudioJobs,
  selectExampleAudioJobs,
  type ExampleAudioJob,
  type ExampleSentenceRow,
} from "../lib/audio-generation";

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

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

interface Clients {
  supabase: SB;
  apiKey: string;
  publicBase: string;
}

/**
 * Pass 2's worker: one clip per (example, locale) into `word_example_media`.
 *
 * Structurally the same as the headword loop but deliberately not shared with
 * it. The insert is the whole difference — a different table, a different
 * conflict target, and no legacy mirror-back onto `words.audio_url` — and a
 * merged loop would be one that has to ask which kind of clip it is holding at
 * every step, on a path whose failure mode is filing a sentence as a word's
 * pronunciation.
 */
async function generateExampleClips(
  jobs: ExampleAudioJob[],
  ctx: Clients & { sql: ReturnType<typeof postgres> },
): Promise<Array<{ key: string; reason: string }>> {
  const failures: Array<{ key: string; reason: string }> = [];
  let ok = 0;
  for (const job of jobs) {
    const key = `example ${job.exampleId} ${job.locale}`;
    try {
      const mp3 = await synthesize(ctx.apiKey, job.locale, job.text);
      const artifact = buildExampleAudioArtifact(job, mp3);
      const path = artifact.storagePath;
      const { error: upErr } = await ctx.supabase.storage.from(BUCKET).upload(path, mp3, {
        contentType: "audio/mpeg",
        upsert: true,
        cacheControl: "31536000",
      });
      if (upErr) throw new Error(`upload: ${upErr.message}`);
      const url = `${ctx.publicBase}${path}`;
      await ctx.sql`
        INSERT INTO word_example_media (example_id, locale, url, storage_path, mime_type, model)
        VALUES (${job.exampleId}, ${job.locale}, ${url}, ${path}, 'audio/mpeg', ${MODEL})
        ON CONFLICT (example_id, locale)
        DO UPDATE SET url = EXCLUDED.url, storage_path = EXCLUDED.storage_path,
                      mime_type = EXCLUDED.mime_type, model = EXCLUDED.model
      `;
      ok++;
      console.log(`  ✓ ${key} → ${url}`);
      await sleep(150);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      failures.push({ key, reason });
      console.log(`  ✗ ${key}: ${reason}`);
    }
  }
  console.log(`[generate-audio] examples: ${ok} generated, ${failures.length} failed`);
  return failures;
}

async function main() {
  const options = parseAudioGenerationOptions(process.argv.slice(2));

  const dbUrl = envOrThrow("DATABASE_URL");
  const sql = postgres(dbUrl, { ssl: "require", prepare: false, max: 1 });

  try {
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
      ORDER BY t.word_id
    `;

    const allJobs = buildAudioJobs(words, jaTerms);

    // Idempotency: drop jobs that already have a word_media audio row.
    let existing = new Set<string>();
    if (!options.refresh) {
      const have = await sql<{ word_id: string; locale: string | null }[]>`
        SELECT word_id, locale FROM word_media
        WHERE kind = 'audio' AND locale IS NOT NULL
      `;
      existing = new Set(have.map((r) => `${r.word_id}|${r.locale}`));
    }

    const jobs = selectAudioJobs(allJobs, existing, options);
    assertAudioSelection(allJobs, jobs, options);
    console.log(
      `[generate-audio] ${jobs.length} clips to generate${options.refresh ? " (refresh)" : ""}`,
    );
    if (options.dryRun) {
      for (const job of jobs) {
        console.log(`  • ${job.wordId} ${job.locale}: ${job.text}`);
      }
    }

    // Deliberately not an early return when `jobs` is empty. The headword
    // clips are a one-off backfill that finished long ago, so on every run
    // after it this list is empty — returning here is how the example pass
    // below would never execute at all.
    //
    // The clients are built on first need instead of up front so a run with
    // nothing to do still requires no TTS key: `--dry-run` and a fully
    // backfilled corpus both stay credential-free.
    let clients: Clients | null = null;
    const ensureClients = async (): Promise<Clients> => {
      if (clients) return clients;
      const supabaseUrl = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
      const serviceKey = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");
      const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await ensureBucket(supabase);
      console.log(`[generate-audio] voice = <locale>-Chirp3-HD-${CHIRP_VOICE}`);
      clients = {
        supabase,
        apiKey: envOrThrow("GOOGLE_TTS_API_KEY"),
        publicBase: `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`,
      };
      return clients;
    };

    let ok = 0;
    const failures: Array<{ key: string; reason: string }> = [];

    if (!options.dryRun && jobs.length > 0) await ensureClients();
    for (const job of options.dryRun ? [] : jobs) {
      const { supabase, apiKey, publicBase } = await ensureClients();
      const key = `${job.wordId} ${job.locale}`;
      try {
        const mp3 = await synthesize(apiKey, job.locale, job.text);
        const artifact = buildAudioArtifact(job, mp3);
        const path = artifact.storagePath;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, mp3, {
          contentType: "audio/mpeg",
          upsert: true,
          cacheControl: "31536000",
        });
        if (upErr) throw new Error(`upload: ${upErr.message}`);
        const url = `${publicBase}${path}`;
        const generatedAt = new Date().toISOString();
        const metadata = {
          sourceText: job.text,
          voice: voiceFor(job.locale).name,
          sha256: artifact.sha256,
          generatedAt,
        };

        await sql.begin(async (tx) => {
          await tx`
            INSERT INTO word_media (word_id, kind, url, storage_path, mime_type, model, locale, metadata)
            VALUES (${job.wordId}, 'audio', ${url}, ${path}, 'audio/mpeg', ${MODEL}, ${job.locale}, ${tx.json(metadata)})
            ON CONFLICT (word_id, kind, locale) WHERE kind = 'audio'
            DO UPDATE SET url = EXCLUDED.url, storage_path = EXCLUDED.storage_path,
                          mime_type = EXCLUDED.mime_type, model = EXCLUDED.model,
                          metadata = EXCLUDED.metadata
          `;
          // Mirror generated clips onto legacy columns while older clients still read them.
          if (job.locale === "en-US") {
            await tx`UPDATE words SET audio_url = ${url} WHERE id = ${job.wordId}`;
          } else if (job.locale === "ja-JP") {
            await tx`
              UPDATE word_terms SET audio_url = ${url}, updated_at = now()
              WHERE word_id = ${job.wordId} AND language = 'ja'
            `;
          }
        });

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

    // ---- Pass 2: example-sentence clips (聽句) -------------------------
    //
    // Separate pass, separate table. `word_media` allows exactly one audio row
    // per (word, locale) and lib/data.ts folds those rows with
    // jsonb_object_agg(locale, url), which keeps the LAST value on a duplicate
    // key — a sentence filed there would make a word's pronunciation button
    // read out a whole sentence, silently. See docs/adr/0015 in the iOS repo.
    //
    // Published words only: an archived word's leftover examples are outside
    // every guard that keeps this data uniform (applyMainWordExamplePairs looks
    // at published rows and nothing else), so they must not be recorded either.
    const exampleRows = await sql<ExampleSentenceRow[]>`
      SELECT
        e.id,
        e.word_id,
        e.sentence,
        max(t.translation) FILTER (WHERE t.language = 'ja') AS ja
      FROM word_examples e
      JOIN words w ON w.id = e.word_id
      LEFT JOIN word_example_translations t ON t.example_id = e.id
      WHERE w.deleted_at IS NULL AND w.status = 'published'
      GROUP BY e.id, e.word_id, e.sentence, e.sort_order
      ORDER BY e.word_id, e.sort_order, e.id
    `;
    const allExampleJobs = buildExampleAudioJobs(exampleRows);

    // The table arrives with the next production migrate, and this script is
    // most useful *before* that: a --dry-run is how you see the plan (and the
    // TTS bill) before deciding to deploy at all. Missing table = nothing is
    // recorded yet, which is the honest answer rather than a crash.
    const [{ exists: mediaTableExists }] = await sql<{ exists: boolean }[]>`
      SELECT to_regclass('public.word_example_media') IS NOT NULL AS exists
    `;
    let existingExamples = new Set<string>();
    if (!mediaTableExists) {
      console.log(
        "[generate-audio] word_example_media does not exist yet — every example clip is pending",
      );
    } else if (!options.refresh) {
      const have = await sql<{ example_id: string; locale: string }[]>`
        SELECT example_id, locale FROM word_example_media
      `;
      existingExamples = new Set(have.map((r) => `${r.example_id}|${r.locale}`));
    }
    if (!mediaTableExists && !options.dryRun) {
      throw new Error(
        "word_example_media is missing — run the migration (deploy) before generating example clips",
      );
    }
    const exampleJobs = selectExampleAudioJobs(allExampleJobs, existingExamples, options);
    console.log(
      `[generate-audio] ${exampleJobs.length} example clips to generate` +
        `${options.refresh ? " (refresh)" : ""}`,
    );

    if (options.dryRun) {
      for (const job of exampleJobs) {
        console.log(`  • example ${job.exampleId} ${job.locale}: ${job.text}`);
      }
      console.log("[generate-audio] dry run: no audio, storage, or database changes were made");
      return;
    } else if (exampleJobs.length > 0) {
      failures.push(
        ...(await generateExampleClips(exampleJobs, { ...(await ensureClients()), sql })),
      );
    }

    if (failures.length) {
      console.log("[generate-audio] failures:");
      for (const f of failures) console.log(`  - ${f.key}: ${f.reason}`);
      throw new Error(`${failures.length} audio clip${failures.length === 1 ? "" : "s"} failed`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("[generate-audio] failed:", e);
  process.exitCode = 1;
});
