import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { publicJson } from "../lib/cache-headers";

// Compile the real data-layer functions with controlled dependencies, so an
// unavailable DB cannot be confused with a legitimately empty catalogue.
const sourceText = readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");
const source = ts.createSourceFile("data.ts", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function loadFunction(name: string, dependencies: Record<string, unknown>) {
  const node = source.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert(node, `missing ${name}`);
  const javascript = ts.transpileModule(node.getText(source).replace(/^export\s+/, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(dependencies), `${javascript}\nreturn ${name};`)(...Object.values(dependencies));
}

test("Japanese catalogue refuses a failed database instead of publishing static fallback", async () => {
  const failure = new Error("database unreachable");
  const getRaw = loadFunction("getAllRawEntries", {
    dbEnabled: () => true,
    fetchAllFromDb: async () => { throw failure; },
    staticWords: [{ id: "mug" }],
    australianOnlyIds: ["rental-bond"],
  });
  await assert.rejects(getRaw(true), failure);
  const oldWarn = console.warn;
  try {
    console.warn = () => {};
    assert.deepEqual(await getRaw(false), [{ word: { id: "mug" }, localizedTexts: {} }]);
  } finally { console.warn = oldWarn; }
  const unconfigured = loadFunction("getAllRawEntries", { dbEnabled: () => false, staticWords: [], australianOnlyIds: ["rental-bond"] });
  assert.deepEqual(await unconfigured(true), []);
  const staticWithRental = loadFunction("getAllRawEntries", { dbEnabled: () => false, staticWords: [{ id: "mug" }, { id: "rental-bond" }, { id: "pay-slip" }], australianOnlyIds: ["rental-bond", "pay-slip"] });
  assert.deepEqual(await staticWithRental(), [{ word: { id: "mug" }, localizedTexts: {} }]);
});

test("Japanese list and detail require the database before returning data or 404", async () => {
  const failure = new Error("database unreachable");
  const calls: boolean[] = [];
  const getAllRawEntries = async (required: boolean) => { calls.push(required); throw failure; };
  for (const name of ["getAllLearningWords", "getAllCardWords"]) {
    const fn = loadFunction(name, { getAllRawEntries });
    await assert.rejects(fn("zh-Hant", "zh-ja"), failure);
  }
  const detail = loadFunction("getLearningWord", { getAllRawEntries });
  await assert.rejects(detail("mug", "zh-Hant", "zh-ja"), failure);
  assert.deepEqual(calls, [true, true, true]);
});

test("failed term reads propagate instead of becoming empty cached terms", async () => {
  const failure = new Error("terms unavailable");
  const dependencies = { dbEnabled: () => true, targetLanguageFor: () => "ja", getTermRowsCached: async () => { throw failure; } };
  const terms = loadFunction("targetTermMap", dependencies);
  const glosses = loadFunction("jaGlossTermMap", dependencies);
  await assert.rejects(terms("zh-ja"), failure);
  await assert.rejects(glosses("ja"), failure);
});

test("successful catalogue responses retain bounded cache headers, including 304", () => {
  const req = new Request("https://example.test/api/words?learning=zh-ja");
  const success = publicJson({ words: [] }, req, true);
  assert.equal(success.status, 200);
  assert.equal(success.headers.get("cache-control"), "public, max-age=60");
  assert.match(success.headers.get("vercel-cdn-cache-control") ?? "", /s-maxage=300/);
  const etag = success.headers.get("etag");
  assert(etag);
  const notModified = publicJson({ words: [] }, new Request(req, { headers: { "if-none-match": etag } }), true);
  assert.equal(notModified.status, 304);
  assert.equal(notModified.headers.get("cache-control"), "public, max-age=60");
});

test("activated regional catalogue is never cached, including conditional responses", () => {
  const request = new Request("https://example.test/api/words?learning=zh-en");
  const response = publicJson({ words: [{ id: "rental-bond" }] }, request, true, true);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
  const conditional = publicJson({ words: [{ id: "rental-bond" }] }, new Request(request, { headers: { "if-none-match": response.headers.get("etag")! } }), true, true);
  assert.equal(conditional.status, 304);
  assert.equal(conditional.headers.get("cache-control"), "no-store");
  assert.equal(conditional.headers.get("vercel-cdn-cache-control"), "no-store");
});
