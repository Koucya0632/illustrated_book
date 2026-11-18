import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { NextResponse } from "next/server";

// Exercise the actual handler while isolating DB, auth and release state.
const source = ts.createSourceFile(
  "route.ts",
  readFileSync(new URL("../app/api/search/route.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const declaration = source.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "GET");
assert(declaration);
const javascript = ts.transpileModule(declaration.getText(source).replace(/^export\s+/, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function handler(active: boolean) {
  const deps = {
    NextResponse,
    regionalCatalogueActive: active,
    parseIntParam: () => 50,
    hasExplicitLanguageScope: () => true,
    DEFAULT_SETTINGS: { learningDirection: "zh-en", uiLang: "zh-Hant" },
    readCallerSettings: async () => ({}),
    readLearningDirection: () => "zh-en",
    readLang: () => "zh-Hant",
    dbEnabled: () => true,
    searchCardWordsAsync: async () => [{ id: "mug" }],
    legacyRentalWordVisible: () => true,
    AUSTRALIAN_RENTAL_WORDS: ["share-house"],
    CATALOGUE_CLIENT_CACHE: "public, max-age=60",
    CATALOGUE_EDGE_CACHE: "public, s-maxage=300, stale-while-revalidate=3600",
  };
  return new Function(...Object.keys(deps), `${javascript}\nreturn GET;`)(...Object.values(deps)) as (request: Request) => Promise<Response>;
}

test("active regional search sets both no-store headers for empty and nonempty queries", async () => {
  const get = handler(true);
  for (const q of ["", "mug"]) {
    const response = await get(new Request(`https://example.test/api/search?learning=zh-en&lang=zh-Hant&q=${q}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store", `q=${q}`);
    assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store", `q=${q}`);
    const body = await response.json();
    assert.deepEqual(body.results, q ? [{ id: "mug" }] : []);
  }
});

test("inactive scoped nonempty search retains bounded public caching", async () => {
  const response = await handler(false)(new Request("https://example.test/api/search?learning=zh-en&lang=zh-Hant&q=mug"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=60");
  assert.match(response.headers.get("vercel-cdn-cache-control") ?? "", /s-maxage=300/);
});
