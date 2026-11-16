import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { visibleInDirection } from "../lib/australian-word-variants";

test("word-list addition rejects hidden words before querying the database", async () => {
  const text = readFileSync(new URL("../lib/word-lists/db.ts", import.meta.url), "utf8");
  const source = ts.createSourceFile("db.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const node = source.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "wordExists");
  assert(node);
  const code = ts.transpileModule(node.getText(source).replace(/^export\s+/, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  let queries = 0;
  const fn = new Function("visibleInDirection", "requireSql", `${code}\nreturn wordExists;`)(
    visibleInDirection,
    () => async () => { queries++; return [{ id: "mug" }]; },
  );
  assert.equal(await fn("rental-bond", "ja"), false);
  assert.equal(await fn("rental-bond", "en"), false);
  assert.equal(queries, 0);
  assert.equal(await fn("mug", "ja"), true);
  assert.equal(queries, 1);
});
