// 詞塊 — the tappable split of an example sentence, and the one rule that
// makes it trustworthy.
//
// Home to the invariant rather than the script that writes it or the query
// that reads it, because both sides must apply exactly the same test: the
// writer refuses to store a split that fails it, and the reader refuses to
// serve one. (The iOS client applies it a third time, in
// `SentenceAnnotation.spans(_:for:)`, on the payload it actually renders.)

/** Bump when the annotation schema or the prompt changes.
 *
 *  `scripts/load-example-spans.ts` rewrites anything below this and readers
 *  ignore anything below it, so an upgrade is never half-visible on screen. */
export const SPANS_VERSION = 1;

/**
 * Do these spans cover the whole sentence?
 *
 * The spans of one sentence concatenate back into it character for character —
 * spaces and punctuation included, because they live inside spans rather than
 * between them. This is the only part of a model's answer that arithmetic can
 * check, which is the entire reason the annotation is a list of covering
 * chunks instead of a set of character offsets: offsets would additionally
 * require JS, Swift and Postgres to agree on what one character is, and they
 * do not (UTF-16 code unit / grapheme cluster / code point).
 *
 * A failing split is discarded whole and never repaired. Repairing one means
 * guessing which end the model got wrong.
 */
export function spansCoverSentence(spans: { text: string }[], sentence: string): boolean {
  return spans.length > 0 && spans.map((s) => s.text).join("") === sentence;
}

/**
 * Strip the link a span makes to the word whose page it is being shown on.
 *
 * Both sentences a reader sees name the headword, and by design: an example
 * exists to demonstrate the word (`I put a bath mat beside the tub.`) and a
 * definition opens by naming it (「デスク」は…). That span is the most obvious
 * thing to tap, so it stays tappable — it just loses the `wordId`, because the
 * "看完整詳情" button that `wordId` earns would push the page already on screen.
 *
 * It is the common case, not an edge one: 1,303 example spans and 493
 * definition spans point at their own word.
 *
 * Applied on the server rather than in the card: the card is mounted at screen
 * level and never learns which word a sentence came from, while the layer that
 * assembles the payload already knows. It also keeps the rule in one place for
 * all four interface languages.
 */
export function unlinkSelfReference<T extends { wordId?: string }>(
  spans: T[] | undefined,
  wordId: string,
): T[] | undefined {
  return spans?.map((span) => (span.wordId === wordId ? { ...span, wordId: undefined } : span));
}
