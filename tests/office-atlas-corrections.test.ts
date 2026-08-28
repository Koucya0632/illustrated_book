import assert from "node:assert/strict";
import test from "node:test";
import { loadExampleSpanCorpus } from "../lib/example-span-corpus";
import {
  classifyMainWordExamplePair,
  MAIN_WORD_EXAMPLE_PAIRS,
  selectMainWordExamplePairs,
  type StoredMainWordExample,
} from "../lib/main-word-example-pairs";
import {
  OFFICE_COMPLEX_EXAMPLES,
  OFFICE_PREVIOUS_COMPLEX_EXAMPLES,
  OFFICE_SIMPLE_OVERRIDES,
} from "../lib/main-word-example-pairs/office";
import { MAIN_WORD_LEGACY_EXAMPLE_SETS } from "../lib/main-word-legacy-example-sets";
import { OFFICE_MAIN_WORD_CORRECTIONS } from "../lib/office-main-word-corrections";
import { selectMainWordCorrections } from "../lib/main-word-corrections";

const corpus = loadExampleSpanCorpus();

function exampleFor(wordId: string, sortOrder: 0 | 1) {
  const pair = MAIN_WORD_EXAMPLE_PAIRS.find(({ id }) => id === wordId);
  assert.ok(pair, `missing pair for ${wordId}`);
  return pair.examples[sortOrder];
}

function tappable(language: "en" | "ja", sentence: string, text: string) {
  const span = corpus[language][sentence]?.find((candidate) => candidate.t === text);
  assert.ok(span?.z && span.j && span.e, `${language}: ${JSON.stringify(text)} must be tappable in ${sentence}`);
  return span;
}

function assertNotTappable(language: "en" | "ja", sentence: string, text: string) {
  assert.equal(
    corpus[language][sentence]?.some((span) => span.t === text && span.z !== undefined),
    false,
    `${language}: ${JSON.stringify(text)} must not be independently tappable in ${sentence}`,
  );
}

test("the audited office sentence and definition corrections stay aligned", () => {
  assert.deepEqual(exampleFor("eraser", 0), {
    en: "Please erase the whiteboard with the whiteboard eraser after the meeting.",
    ja: "会議のあと、ホワイトボード用イレーザーでホワイトボードを消してください。",
    zh: "會議結束後，請用白板擦把白板擦乾淨。",
    cefrLevel: "A2",
    sortOrder: 0,
  });
  assert.equal(
    exampleFor("eraser", 1).ja,
    "ホワイトボード用イレーザーで跡が残るなら、もう一度使う前に表面のフェルトを掃除してください。",
  );
  assert.deepEqual(exampleFor("conference-table", 1), {
    en: "Before the guests arrive, arrange the place cards around the conference table.",
    ja: "来客が到着する前に、会議テーブルの周りに席札を並べてください。",
    zh: "客人抵達前，請在會議桌周圍擺好席卡。",
    cefrLevel: "B1",
    sortOrder: 1,
  });
  assert.equal(
    exampleFor("photocopier", 1).ja,
    "コピー機がまた詰まったら、紙は中に残したまま、保守窓口へ連絡してください。",
  );
  assert.equal(
    exampleFor("photocopier", 1).zh,
    "影印機如果又卡紙，請把紙留在機器裡並聯絡維修窗口。",
  );
  assert.equal(
    exampleFor("reception-desk", 1).ja,
    "来客が早く着いたので、受付カウンターの担当者がロビーで待つよう案内しました。",
  );
  assert.equal(
    exampleFor("utility-knife", 1).ja,
    "刃が出たままだと危ないので、箱を切ったら刃をすぐ本体に戻してください。",
  );
  assert.equal(
    exampleFor("utility-knife", 1).zh,
    "美工刀刀片露在外面很危險，裁完紙箱後請立刻把刀片收回刀身。",
  );

  const expectedDefinitions = new Map([
    ["document", "「書類」は、情報を伝えたり証拠として残したりするために、文字や図を記録した紙の文書です。"],
    ["office-chair", "「オフィスチェア」は、デスク作業用に設計された椅子です。多くはキャスターが付き、高さを調節できます。"],
    ["tape", "「セロテープ」は、片面に粘着剤が付いた透明な帯状のテープで、物を貼り付けるために使います。"],
    ["whiteboard-marker", "「ホワイトボードマーカー」は、ホワイトボードに書き、専用のイレーザーで消せるインクを使ったペンです。"],
  ]);
  for (const [id, expected] of expectedDefinitions) {
    const correction = OFFICE_MAIN_WORD_CORRECTIONS.find((entry) => entry.id === id);
    assert.equal(correction?.jaDefinition?.value, expected, id);
  }
});

test("the deployed office pair is a guarded predecessor of each rewritten pair", () => {
  assert.equal(OFFICE_SIMPLE_OVERRIDES.some(({ id }) => id === "eraser"), true);
  for (const previous of OFFICE_PREVIOUS_COMPLEX_EXAMPLES) {
    const simple = MAIN_WORD_LEGACY_EXAMPLE_SETS
      .find(({ id }) => id === previous.id)
      ?.examples.find(({ sortOrder }) => sortOrder === 0);
    assert.ok(simple, previous.id);
    const current: StoredMainWordExample[] = [
      { ...simple, cefrLevel: "A2" },
      { ...previous, sortOrder: 1, cefrLevel: "B1" },
    ];
    assert.equal(classifyMainWordExamplePair(previous.id, current), "legacy", previous.id);
  }
});

test("the production correction scope cannot escape the office category", () => {
  const officeIds = new Set(OFFICE_COMPLEX_EXAMPLES.map(({ id }) => id));
  const selectedPairs = selectMainWordExamplePairs(officeIds);
  const selectedCorrections = selectMainWordCorrections(officeIds);
  assert.equal(selectedPairs.length, officeIds.size);
  assert.equal(selectedPairs.length, 51);
  assert.equal(selectedPairs.every(({ id }) => officeIds.has(id)), true);
  assert.equal(selectedCorrections.every(({ id }) => officeIds.has(id)), true);
});

test("the audited office click translations preserve context and useful boundaries", () => {
  const accessSimple = exampleFor("access-card", 0);
  assert.equal(tappable("en", accessSimple.en, "temporary one").z, "臨時卡");
  assert.equal(tappable("ja", accessSimple.ja, "仮カード").e, "temporary card");
  const accessComplex = exampleFor("access-card", 1);
  assert.equal(tappable("en", accessComplex.en, "ask").z, "請");
  assert.equal(tappable("ja", accessComplex.ja, "場合").e, "if");

  const binderClip = exampleFor("binder-clip", 0);
  assertNotTappable("ja", binderClip.ja, "この");
  assert.equal(tappable("ja", binderClip.ja, "まとめてください").e, "please hold together");
  const businessCard = exampleFor("business-card", 1);
  assertNotTappable("ja", businessCard.ja, "読み方を確認するために");
  assert.equal(tappable("ja", businessCard.ja, "読み方").e, "pronunciation");
  assert.equal(tappable("ja", businessCard.ja, "確認する").z, "確認");
  const computer = exampleFor("computer", 1);
  assertNotTappable("ja", computer.ja, "こと");
  assert.equal(tappable("ja", computer.ja, "ことがある").e, "may sometimes");

  const documentSimple = exampleFor("document", 0);
  assertNotTappable("ja", documentSimple.ja, "送って");
  assert.equal(tappable("ja", documentSimple.ja, "送ってください").e, "please send");
  const documentComplex = exampleFor("document", 1);
  assert.equal(tappable("en", documentComplex.en, "comments").z, "註解");
  const employeeCard = exampleFor("employee-id-card", 1);
  assert.equal(tappable("ja", employeeCard.ja, "入っている").z, "含有");
  const envelopeSimple = exampleFor("envelope", 0);
  assertNotTappable("ja", envelopeSimple.ja, "この");
  assert.equal(tappable("en", exampleFor("envelope", 1).en, "Seal").z, "封上");

  for (const sortOrder of [0, 1] as const) {
    const fileFolder = exampleFor("file-folder", sortOrder);
    const sentence = sortOrder === 0 ? fileFolder.en : fileFolder.ja;
    const language = sortOrder === 0 ? "en" : "ja";
    assert.equal(tappable(language, sentence, sortOrder === 0 ? "invoices" : "請求書").z, "請款單");
  }
  assert.equal(tappable("ja", exampleFor("file-folder", 1).ja, "該当する").j, "当てはまる");
  assert.equal(tappable("ja", exampleFor("filing-cabinet", 1).ja, "施錠しておかなければなりません").e, "must remain locked");

  const folder = exampleFor("folder", 0);
  assert.equal(tappable("en", folder.en, "Keep").z, "放進");
  assertNotTappable("ja", folder.ja, "入れて");
  assert.equal(tappable("ja", folder.ja, "入れてください").e, "please put in");
  const glue = exampleFor("glue", 0);
  assertNotTappable("ja", glue.ja, "貸して");
  assert.equal(tappable("ja", glue.ja, "貸してもらえますか").e, "could I borrow");

  for (const sortOrder of [0, 1] as const) {
    const invoice = exampleFor("invoice", sortOrder);
    assert.equal(tappable("ja", invoice.ja, "請求書").z, "請款單");
  }
  const laptop = exampleFor("laptop", 1);
  assert.equal(tappable("en", laptop.en, "remembered").z, "沒忘記");
  assert.equal(tappable("en", laptop.en, "take").z, "帶回家");
  const mobile = exampleFor("mobile-phone", 0);
  assert.equal(tappable("en", mobile.en, "put").z, "調成");
  assertNotTappable("ja", mobile.ja, "マナーモードに");
  assert.equal(tappable("ja", mobile.ja, "マナーモードにしてください").e, "please set to silent mode");
  assert.equal(tappable("ja", exampleFor("monitor", 0).ja, "置いています").e, "keep");

  const mousePadSimple = exampleFor("mouse-pad", 0);
  assertNotTappable("ja", mousePadSimple.ja, "この");
  const mousePadComplex = exampleFor("mouse-pad", 1);
  assert.equal(tappable("en", mousePadComplex.en, "pointer").z, "游標");
  assert.equal(tappable("en", mousePadComplex.en, "started jumping").z, "開始亂跳");
  assert.equal(tappable("en", mousePadComplex.en, "mouse pad").z, "滑鼠墊");
  assert.equal(tappable("en", exampleFor("notebook", 1).en, "sketch an idea").z, "把想法畫成草圖");
  for (const sortOrder of [0, 1] as const) {
    const notepad = exampleFor("notepad", sortOrder);
    assert.equal(tappable("en", notepad.en, "notepad").z, "便條本");
    assert.equal(tappable("ja", notepad.ja, "メモ帳").z, "便條本");
  }

  const chair = exampleFor("office-chair", 1);
  assert.equal(tappable("en", chair.en, "rest").z, "踩穩");
  assert.equal(tappable("en", chair.en, "flat").z, "平放");
  assert.equal(tappable("ja", exampleFor("office-supplies", 0).ja, "在庫").e, "stock");
  const paperSimple = exampleFor("paper", 0);
  assertNotTappable("ja", paperSimple.ja, "補充");
  assert.equal(tappable("ja", paperSimple.ja, "補充してください").e, "please load");
  const paperComplex = exampleFor("paper", 1);
  assert.equal(tappable("en", paperComplex.en, "not final").z, "尚未定稿");
  assert.equal(tappable("ja", paperComplex.ja, "両面印刷してください").e, "please print on both sides");
  assert.equal(tappable("ja", exampleFor("paper-clip", 0).ja, "留めてください").e, "please fasten");

  assertNotTappable("ja", exampleFor("paper-shredder", 0).ja, "この");
  const shredder = exampleFor("paper-shredder", 1);
  assertNotTappable("en", shredder.en, "stop feeding paper");
  assertNotTappable("en", shredder.en, "let the motor cool down");
  assertNotTappable("ja", shredder.ja, "入れるの");
  assert.equal(tappable("en", shredder.en, "feeding").z, "放入");
  assert.equal(tappable("en", shredder.en, "cool down").z, "冷卻");
  assertNotTappable("en", exampleFor("pen", 0).en, "your");
  assertNotTappable("en", exampleFor("pen", 1).en, "during");

  const printer = exampleFor("printer", 1);
  assert.equal(tappable("en", printer.en, "sending the job again").z, "重新送出列印工作");
  assert.equal(tappable("ja", exampleFor("reception-desk", 0).ja, "手続きをしてください").e, "please check in");
  assert.equal(tappable("en", exampleFor("reception-desk", 1).en, "asked").z, "請");
  assertNotTappable("en", exampleFor("stapler", 1).en, "near");
  const staples = exampleFor("staples", 1);
  assertNotTappable("ja", staples.ja, "補充");
  assert.equal(tappable("ja", staples.ja, "補充するとき").e, "when refilling");
  assert.equal(tappable("ja", staples.ja, "合うサイズ").j, "適切なサイズ");

  const tape = exampleFor("tape", 1);
  assert.equal(tappable("ja", tape.ja, "拭いてください").r, "ふいてください");
  assert.equal(tappable("ja", tape.ja, "付かない").z, "黏不上");
  assert.equal(tappable("ja", exampleFor("webcam", 1).ja, "確認しました").e, "checked");
});
