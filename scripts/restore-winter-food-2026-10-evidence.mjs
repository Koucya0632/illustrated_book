// Verify and optionally restore the exact evidence for the historical food batch.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const series = "winter-food-2026-10";
const releasePrefix = `docs/releases/${series}/`;
const evidencePrefix = `${releasePrefix}evidence/`;
const outputPrefix = `output/${series}/`;
const args = new Set(process.argv.slice(2));

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

requireCondition([...args].every((arg) => ["--restore", "--media"].includes(arg)),
  "Supported flags: --restore [--media]");
requireCondition(!args.has("--media") || args.has("--restore"), "--media requires --restore");

function checkedPath(relative, prefix = "") {
  requireCondition(typeof relative === "string" && relative.startsWith(prefix) &&
    !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes(".."), "Unsafe evidence path");
  const absolute = path.resolve(root, relative);
  requireCondition(absolute.startsWith(`${root}${path.sep}`), "Evidence path leaves checkout");
  for (let parent = absolute; parent !== root; parent = path.dirname(parent)) {
    const stat = fs.lstatSync(parent, { throwIfNoEntry: false });
    requireCondition(!stat?.isSymbolicLink(), `Evidence path includes a symbolic link: ${relative}`);
  }
  return absolute;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function verifyBytes(bytes, item) {
  const expectedHash = item.sha256 ?? item.contentSha256;
  requireCondition(bytes.length === item.bytes && sha256(bytes) === expectedHash,
    `Historical bytes differ: ${item.originalPath ?? item.localFile}`);
}

const index = JSON.parse(fs.readFileSync(checkedPath(`${releasePrefix}restoration-index.json`)));
requireCondition(index.schemaVersion === 1 && index.series === series, "Wrong release index");
const destinations = [...index.artifacts.map((item) => item.originalPath),
  ...index.media.map((item) => item.localFile)];
requireCondition(new Set(destinations).size === destinations.length, "Duplicate restoration destination");

for (const source of index.sources) {
  requireCondition(sha256(fs.readFileSync(checkedPath(source.file))) === source.sha256,
    `Historical source bytes differ: ${source.file}`);
}

for (const item of index.artifacts) {
  verifyBytes(fs.readFileSync(checkedPath(item.portablePath, evidencePrefix)), item);
  const destination = checkedPath(item.originalPath, outputPrefix);
  if (args.has("--restore") && fs.existsSync(destination)) {
    verifyBytes(fs.readFileSync(destination), item);
  }
}

if (args.has("--media")) {
  for (const item of index.media) {
    const destination = checkedPath(item.localFile, outputPrefix);
    if (fs.existsSync(destination)) verifyBytes(fs.readFileSync(destination), item);
  }
}

let restoredFiles = 0;
let downloadedMedia = 0;
function restoreFile(relative, bytes) {
  const destination = checkedPath(relative, outputPrefix);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes, { flag: "wx" });
  restoredFiles++;
}

if (args.has("--restore")) {
  for (const item of index.artifacts) {
    const destination = checkedPath(item.originalPath, outputPrefix);
    if (!fs.existsSync(destination)) {
      restoreFile(item.originalPath, fs.readFileSync(checkedPath(item.portablePath, evidencePrefix)));
    }
  }
}

if (args.has("--media")) {
  for (const item of index.media) {
    if (fs.existsSync(checkedPath(item.localFile, outputPrefix))) continue;
    const url = new URL(item.url);
    requireCondition(url.origin === "https://img.nexflow.team" && !url.username && !url.password &&
      !url.search && !url.hash && /^\/(word-images|word-audio)\//.test(url.pathname),
      "Unexpected historical media URL");
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30000) });
    requireCondition(response.ok, `Media HTTP ${response.status}`);
    requireCondition(response.headers.get("content-type")?.split(";")[0].trim() === item.mimeType,
      "Historical media MIME differs");
    const bytes = Buffer.from(await response.arrayBuffer());
    verifyBytes(bytes, item);
    restoreFile(item.localFile, bytes);
    downloadedMedia++;
  }
}

console.log(JSON.stringify({ mode: args.has("--restore") ? "restored" : "verified-only",
  verifiedArtifacts: index.artifacts.length, restoredFiles, downloadedMedia, productionWrites: 0 }, null, 2));
