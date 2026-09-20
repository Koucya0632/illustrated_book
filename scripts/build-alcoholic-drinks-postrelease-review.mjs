import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const previousDir = resolve(root, "output/atlas-example-audit/post-professions-2026-09-15");
const currentDir = resolve(
  root,
  "output/atlas-example-audit/alcoholic-drinks-postrelease-2026-09-20",
);
const candidateReviewFile = resolve(
  root,
  "output/alcoholic-drinks-publish-prep/semantic-review.json",
);

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const previousSource = readJson(resolve(previousDir, "examples.json"));
const previousReview = readJson(resolve(previousDir, "semantic-review.json"));
const currentSource = readJson(resolve(currentDir, "examples.json"));
const candidateReview = readJson(candidateReviewFile);

const previousSourceById = new Map(previousSource.words.map((word) => [word.id, word]));
const previousReviewById = new Map(previousReview.words.map((word) => [word.id, word]));
const candidateWordReview = new Map(
  candidateReview.items
    .filter((item) => item.kind === "word")
    .map((item) => [item.id, item]),
);
const candidateExampleReview = new Map(
  candidateReview.items
    .filter((item) => item.kind === "example")
    .map((item) => [item.id, item]),
);

let reusedWords = 0;
let newlyReviewedWords = 0;
const words = currentSource.words.map((word) => {
  const previousWord = previousSourceById.get(word.id);
  const previousVerdict = previousReviewById.get(word.id);
  if (previousWord && JSON.stringify(previousWord) === JSON.stringify(word)) {
    if (!previousVerdict) throw new Error(`${word.id}: exact prior source has no prior verdict`);
    reusedWords += 1;
    return previousVerdict;
  }

  const wordVerdict = candidateWordReview.get(word.id);
  if (!wordVerdict || wordVerdict.verdict !== "pass") {
    throw new Error(`${word.id}: changed/new word lacks an individual passing semantic verdict`);
  }
  if (word.examples.length !== 2) throw new Error(`${word.id}: expected exactly two examples`);
  const examples = word.examples.map((example) => {
    const reviewed = candidateExampleReview.get(`${word.id}:${example.sortOrder}`);
    if (!reviewed || reviewed.verdict !== "pass") {
      throw new Error(`${word.id}:${example.sortOrder}: individual example verdict is missing`);
    }
    const exactText =
      reviewed.text.en === example.en &&
      reviewed.text.ja === example.ja &&
      reviewed.text.zh === example.zh &&
      reviewed.cefrLevel === example.cefrLevel;
    if (!exactText) throw new Error(`${word.id}:${example.sortOrder}: review source text is stale`);
    return {
      exampleId: String(example.id),
      sortOrder: example.sortOrder,
      role: example.sortOrder === 0 ? "simple" : "complex",
      verdict: "pass",
      categories: [],
      reason: reviewed.reason,
    };
  });
  newlyReviewedWords += 1;
  return {
    id: word.id,
    pairVerdict: "pass",
    pairCategories: [],
    pairReason:
      `${wordVerdict.reason} ` +
      `Simple example: ${examples[0].reason} Complex example: ${examples[1].reason}`,
    examples,
  };
});

if (words.length !== 724 || reusedWords !== 690 || newlyReviewedWords !== 34) {
  throw new Error(
    `unexpected review coverage: total=${words.length}, reused=${reusedWords}, new=${newlyReviewedWords}`,
  );
}

const output = {
  version: 1,
  createdAt: new Date().toISOString(),
  sourceFile: "examples.json",
  provenance: {
    exactPriorSnapshotWords: reusedWords,
    individuallyReviewedAlcoholicDrinkWords: newlyReviewedWords,
    candidateReviewFile: "../../alcoholic-drinks-publish-prep/semantic-review.json",
  },
  words,
};
writeFileSync(resolve(currentDir, "semantic-review.json"), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ words: words.length, reusedWords, newlyReviewedWords }, null, 2));
