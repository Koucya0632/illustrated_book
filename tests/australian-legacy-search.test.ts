import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Exercise the production search function with a catalogue containing a
// hidden regional hit ahead of a valid legacy result.
const file = ts.createSourceFile("data.ts", fs.readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const fn = file.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === "searchCardWordsAsync");
assert(fn);
const js = ts.transpileModule(fn.getText(file).replace(/^export\s+/, ""), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const words = [{id:"rental-bond",word:"bond one",chinese:""},{id:"common",word:"bond two",chinese:""}];
function search(dbEnabled: () => boolean, getSql: () => unknown) {
 const deps = { getAllCardWords: async () => words, dbEnabled, getSql,
  inMemoryMatchCard: (all: typeof words, q: string) => all.filter((w) => w.word.includes(q)),
  australianVariant: () => undefined, escapeLike: (x: string) => x, australianRentalGate: () => true };
 return new Function(...Object.keys(deps), `${js}\nreturn searchCardWordsAsync`)(...Object.values(deps));
}
test("legacy exclusion occurs before the limit in memory and SQL", async () => {
 const options = { limit: 1, excludeIds: ["rental-bond"] };
 assert.deepEqual(await search(() => false, () => null)("bond", options), [words[1]]);
 let query = "", args: unknown[] = [];
 const sql = (strings: TemplateStringsArray, ...values: unknown[]) => { if (strings.join("") === "m.id") return "m.id"; query = strings.join("?"); args = values; return Promise.resolve([{id:"common"}]); };
 assert.deepEqual(await search(() => true, () => sql)("bond", options), [words[1]]);
 assert.match(query, /WHERE id <> ALL\([\s\S]*LIMIT/);
 assert(args.some((value) => Array.isArray(value) && value.includes("rental-bond")));
});
