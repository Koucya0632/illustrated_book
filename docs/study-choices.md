# Four-choice study policy

`lib/study-choices.ts` is the pure server/browser policy. Native ports are
`StudyChoices.swift` and `StudyChoices.kt`. Each round owns a `StudyChoiceSession`;
never create a session inside a question render. A variant identifies a new
presentation after retry; repeating it returns the same content and positions.

Candidate tiers are same-category close words, other same-category words,
other categories in the same language (higher weight for matching part of speech),
and bundled reserves. Filter spelling variants, authored aliases/synonyms,
shared glosses and token/CJK containment before sampling, including pairwise
checks between distractors. Normalization is exclusion-only: NFKC, lowercase,
whitespace and Unicode dash punctuation; Japanese ー is retained.

At most 12 mutually compatible candidates per tier are retained, then sampled
by weight without replacement. Retry draws two fresh distractors first, relaxing
the tier when necessary, and then fills the last slot. Existing valid candidates
may be reused if alternatives are exhausted. Four-choice scoring is unchanged.

## API and compatibility

The queue still returns four `choices`. Optional `choiceCandidates` entries have
`wordId`, `label`, `language`, `gloss`, `category`, `pos`, `exclusions`, `tier`, and
`weight`. `choiceExclusions` carries the target's excluded labels. New clients
use the metadata pool when sufficient, avoiding replacement by weaker local
metadata. Missing/insufficient pools fall back to local same-language words and
bundled data. Cached queue responses retain these optional fields; old responses
still decode. No database migration, word merging, or progress reset is needed.

The backend reads all published, undeleted words independently of learned cards
or selected themes, attaches options after combining public/custom/saved queues,
and excludes bidirectional synonym edges rather than scoring them positively.

## Data and checks

- `lib/study-choice-data.json`: canonical aliases and 48 reserve words per language.
- `tests/fixtures/study-choice-cases.json`: shared cross-platform lexical cases.
- `npm run sync:study-choices`: regenerate native source/fixtures in sibling repos.
- `node scripts/sync-study-choice-data.mjs --check`: detect generated-data drift.
- `npm test`: Web policy, deterministic samples, tier fallback, retry, distribution.
- iOS `StudyChoicesTests`/`DistractorPoolTests` and Android `StudyChoicesTest`/
  `DistractorPoolTest`: same lexical cases and portable RNG/sample golden values.
- `npm run audit:study-choices`: read-only full published-catalog fallback audit.
  `DATABASE_URL` is loaded from `.env.local`; output contains only counts/failing IDs.

The existing deployment migration entry point runs the same coverage assertion.
Any published word without three fair same-language reserve distractors blocks
the build; update the reserve data and rerun all ports' tests before release.
