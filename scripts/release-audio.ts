// Candidate audio for a shared-publisher release.
//
//   npm run release:audio:plan -- --release <id>
//   npm run release:audio:generate:local -- --release <id> [--limit=N]   (GOOGLE_TTS_API_KEY)
//   npm run release:audio:verify -- --release <id>                       (ffprobe, ffmpeg)

import { publishDescriptor } from "../lib/catalogue/publish/descriptor";
import {
  generateReleaseAudio,
  planReleaseAudio,
  verifyReleaseAudio,
} from "../lib/catalogue/publish/audio";

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function main() {
  const step = process.argv[2];
  const release = argument("--release");
  if (!release) throw new Error("--release <id> is required");
  const descriptor = publishDescriptor(release);
  const root = process.cwd();
  if (step === "plan") {
    const manifest = planReleaseAudio(descriptor, root);
    console.log(JSON.stringify({ state: manifest.state, ...manifest.summary, issues: manifest.issues }, null, 2));
    if (manifest.issues.length) process.exitCode = 1;
  } else if (step === "generate") {
    const apiKey = process.env.GOOGLE_TTS_API_KEY?.trim();
    if (!apiKey) throw new Error("missing GOOGLE_TTS_API_KEY");
    const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
    const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) throw new Error("--limit must be a positive integer");
    const { summary, failed } = await generateReleaseAudio(descriptor, root, {
      apiKey,
      voice: process.env.CHIRP_VOICE?.trim() || "Aoede",
      limit,
    });
    console.log(JSON.stringify(summary, null, 2));
    if (failed) process.exitCode = 1;
  } else if (step === "verify") {
    const report = verifyReleaseAudio(descriptor, root);
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } else {
    throw new Error("usage: release-audio.ts <plan|generate|verify> --release <id>");
  }
}

main().catch((error) => {
  console.error("[release:audio]", error);
  process.exitCode = 1;
});
