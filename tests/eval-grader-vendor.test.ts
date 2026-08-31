import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import test from "node:test";

const VENDORED = new URL("../evals/grader/check-example-contract.mjs", import.meta.url);
const SKILL = path.join(
  process.env.TUJI_AUDIT_SKILL_ROOT ?? path.join(homedir(), ".codex", "skills"),
  "audit-tuji-atlas",
  "scripts",
  "check-example-contract.mjs",
);

const sha = (file: string | URL) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

test("the vendored grader still matches the skill it was copied from", (t) => {
  // evals/grader exists so CI can score without the Codex skill installed, which makes it
  // a second copy of one rule set. On a machine that has the skill, this is the alarm for
  // the two drifting apart; on CI, where the skill is absent, there is nothing to compare
  // and the test skips rather than pretending to have checked.
  if (!existsSync(SKILL)) {
    t.skip(`skill not installed at ${SKILL}; nothing to compare against`);
    return;
  }
  assert.equal(
    sha(VENDORED),
    sha(SKILL),
    "evals/grader/check-example-contract.mjs has drifted from the skill — re-copy it and re-record the baselines, per evals/grader/README.md",
  );
});
