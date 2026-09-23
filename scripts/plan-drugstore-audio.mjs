import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const output = path.resolve(
  root,
  outputArg?.slice("--output=".length) ||
    "output/drugstore-audio-plan/manifest.json",
);
const entries = JSON.parse(
  fs.readFileSync(path.join(root, "data/drugstore-series-2026-09.json"), "utf8"),
).entries;

const jobs = [];
for (const entry of entries) {
  jobs.push(
    { kind: "headword", ownerKey: entry.id, wordId: entry.id, locale: "en-US", text: entry.word },
    { kind: "headword", ownerKey: entry.id, wordId: entry.id, locale: "en-GB", text: entry.word },
    { kind: "headword", ownerKey: entry.id, wordId: entry.id, locale: "ja-JP", text: entry.ja },
  );
  entry.examples.forEach((example, index) => {
    const ownerKey = `${entry.id}:${index}`;
    jobs.push(
      { kind: "example", ownerKey, wordId: entry.id, slot: index, locale: "en-US", text: example.en },
      { kind: "example", ownerKey, wordId: entry.id, slot: index, locale: "en-GB", text: example.en },
      { kind: "example", ownerKey, wordId: entry.id, slot: index, locale: "ja-JP", text: example.ja },
    );
  });
}

const issues = [];
if (!entries.length) issues.push("candidate series is empty");
if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
  issues.push("duplicate word IDs");
}
for (const entry of entries) {
  if (!entry.word?.trim() || !entry.ja?.trim()) {
    issues.push(`${entry.id}: missing headword source text`);
  }
  if (!Array.isArray(entry.examples) || entry.examples.length !== 2) {
    issues.push(`${entry.id}: expected two examples`);
  }
}
const jobKeys = jobs.map((job) => `${job.kind}|${job.ownerKey}|${job.locale}`);
if (new Set(jobKeys).size !== jobs.length) issues.push("duplicate audio owner/locale jobs");
const expectedJobs = entries.reduce(
  (total, entry) => total + 3 + 3 * (entry.examples?.length ?? 0),
  0,
);
if (jobs.length !== expectedJobs) issues.push(`expected ${expectedJobs} jobs, found ${jobs.length}`);

const count = (kind, locale) =>
  jobs.filter((job) => job.kind === kind && job.locale === locale).length;
const manifest = {
  schemaVersion: 1,
  series: "drugstore",
  state: issues.length ? "invalid" : "candidate-audio-planned",
  productionWriteAllowed: false,
  note: "Example ownerKey values are candidate references, not production example IDs. Resolve them inside the guarded publisher transaction.",
  summary: {
    words: entries.length,
    examples: entries.reduce(
      (total, entry) => total + (entry.examples?.length ?? 0),
      0,
    ),
    clips: jobs.length,
    headwords: {
      total: jobs.filter((job) => job.kind === "headword").length,
      "en-US": count("headword", "en-US"),
      "en-GB": count("headword", "en-GB"),
      "ja-JP": count("headword", "ja-JP"),
    },
    examplesByLocale: {
      total: jobs.filter((job) => job.kind === "example").length,
      "en-US": count("example", "en-US"),
      "en-GB": count("example", "en-GB"),
      "ja-JP": count("example", "ja-JP"),
    },
  },
  issues,
  jobs,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, state: manifest.state, ...manifest.summary, issues }, null, 2));
if (issues.length) process.exitCode = 1;
