import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const planFile = path.resolve(
  root,
  "output/clothing-audio-plan/manifest.json",
);
const outputRoot = path.resolve(
  root,
  "output/clothing-audio-candidates",
);
const statusFile = path.join(outputRoot, "generated-manifest.json");
const apiKey = process.env.GOOGLE_TTS_API_KEY?.trim();
if (!apiKey) throw new Error("missing GOOGLE_TTS_API_KEY");

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice(8)) : null;
if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
  throw new Error("--limit must be a positive integer");
}
const voiceName = process.env.CHIRP_VOICE?.trim() || "Aoede";
const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
if (plan.state !== "candidate-audio-planned" || plan.issues?.length) {
  throw new Error("audio plan is not valid");
}

fs.mkdirSync(outputRoot, { recursive: true });
const status = fs.existsSync(statusFile)
  ? JSON.parse(fs.readFileSync(statusFile, "utf8"))
  : {
      schemaVersion: 1,
      series: "clothing",
      voice: voiceName,
      generated: {},
      failures: {},
    };

const keyFor = (job) => `${job.kind}|${job.ownerKey}|${job.locale}`;
const digestFor = (job) =>
  crypto
    .createHash("sha256")
    .update(`${job.locale}\0${job.text}`)
    .digest("hex");
const looksLikeMp3 = (bytes) =>
  bytes.length > 256 &&
  (bytes.subarray(0, 3).toString("ascii") === "ID3" ||
    bytes
      .subarray(0, 4096)
      .some(
        (value, i, a) =>
          value === 0xff && i + 1 < a.length && (a[i + 1] & 0xe0) === 0xe0,
      ));
const saveStatus = () => {
  const temp = `${statusFile}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(status, null, 2)}\n`);
  fs.renameSync(temp, statusFile);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function synthesize(job) {
  const body = {
    input: { text: job.text },
    voice: {
      languageCode: job.locale,
      name: `${job.locale}-Chirp3-HD-${voiceName}`,
    },
    audioConfig: { audioEncoding: "MP3" },
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (response.ok) {
      const json = await response.json();
      const bytes = Buffer.from(json.audioContent || "", "base64");
      if (!looksLikeMp3(bytes)) {
        throw new Error("TTS response is not a valid-looking MP3");
      }
      return bytes;
    }
    const detail = (await response.text().catch(() => "")).slice(0, 180);
    if (attempt === 3 || ![429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`TTS HTTP ${response.status}: ${detail}`);
    }
    await wait(attempt * 5000);
  }
}

let generated = 0;
let skipped = 0;
let failed = 0;
const selected = limit ? plan.jobs.slice(0, limit) : plan.jobs;
for (const [index, job] of selected.entries()) {
  const key = keyFor(job);
  const digest = digestFor(job);
  const relativePath = path.join(job.kind, job.locale, `${digest}.mp3`);
  const absolutePath = path.join(outputRoot, relativePath);
  const previous = status.generated[key];
  if (
    previous?.sourceText === job.text &&
    fs.existsSync(absolutePath) &&
    looksLikeMp3(fs.readFileSync(absolutePath))
  ) {
    skipped++;
    continue;
  }
  try {
    const bytes = await synthesize(job);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, bytes);
    status.generated[key] = {
      ...job,
      file: relativePath,
      bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      sourceText: job.text,
    };
    delete status.failures[key];
    generated++;
    saveStatus();
    console.log(`[${index + 1}/${selected.length}] generated ${key}`);
    await wait(150);
  } catch (error) {
    failed++;
    status.failures[key] = error instanceof Error ? error.message : String(error);
    saveStatus();
    console.error(
      `[${index + 1}/${selected.length}] failed ${key}: ${status.failures[key]}`,
    );
  }
}

status.summary = {
  planned: plan.jobs.length,
  present: Object.keys(status.generated).length,
  failures: Object.keys(status.failures).length,
  generatedThisRun: generated,
  skippedThisRun: skipped,
};
saveStatus();
console.log(JSON.stringify(status.summary, null, 2));
if (failed) process.exitCode = 1;
