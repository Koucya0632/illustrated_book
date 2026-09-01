# evals

A frozen input, a recorded score, and a rule for when the two may be compared.

The audit skills in `~/.codex/skills/audit-tuji-atlas*` already know how to judge the
catalog — the failure classes, the span invariants, the CEFR bands. That part is not
duplicated here. What they do not have is the two things a baseline needs: an input that
cannot move, and a previous run to subtract from. This directory adds exactly those and
shells out to the skill's documented CLI for the judging.

## Running it

```bash
npm run eval          # score the frozen fixture (offline, deterministic, free)
npm run eval:db       # score the live published catalog (SELECT-only, needs .env.local)
npm run eval:spans    # run the span generator on the held-out slice and score it (costs money)
npm run eval -- --update    # accept the current score as the new baseline
```

`eval:spans` calls OpenAI. Use `--dry` to see the slice without calling anything and
`--limit N` for a cheap smoke run. It never writes `data/example-spans.json`.

Exit codes: `0` unchanged or improved, `1` regressed, `2` could not run or could not
compare. The grader ships vendored at `evals/grader` so this runs with no Codex skill
installed; set `TUJI_AUDIT_SKILL_ROOT` to score against a skill checkout instead. See
`evals/grader/README.md` for keeping the copy in step with its source.

## The two sources

`--source fixture` scores `fixtures/atlas-examples.json`, a snapshot of the 476
published main words taken 2026-08-31. It is offline and constant by construction, so it
moves only when the fixture or the grader moves — which is what the two hashes in the
baseline are for. This is also the slot a generator's fresh output drops into when the
eval graduates from grading stored rows to grading model output.

`--source database` runs the same grader over the live catalog and compares it to the
score recorded from the live catalog. This is the mode that catches a data regression
today: the recorded side is the expectation, the live side is what varies. When it goes
red, diff the live rows against the frozen fixture to see what actually changed.

Each source keeps its own baseline (`baselines/atlas-examples.<source>.json`) and the
runner refuses to compare across them. They answer different questions.

## Why the baseline stores keys, not just a number

An issue count cannot tell "one thing fixed, one thing newly broken" from "nothing
happened" — both runs report one issue. So the baseline stores a stable key per finding
(`category|wordId|exampleId|slot|field`), and the verdict comes from set difference:
any key that is new is a regression, even when the total went down.

## Why a moved hash refuses to produce a verdict

A score is only comparable to a score produced from the same input by the same ruler. If
the fixture changed in fixture mode, the delta is unattributable and the runner says
`incomparable` instead of printing a number that looks like a result. Re-freeze
deliberately, then re-record with `--update`. A changed grader is a note rather than a
refusal, because the grader is expected to gain rules — but the note says so, so a moved
score is never silently read as the data moving.

## Grading the generator (`eval:spans`)

The obvious version of this does not work, and the reason is worth keeping written down.
`scripts/generate-example-spans.ts` validates every generated sentence with
`validateAuthoredSentence` and retries up to ten times, and that validator enforces the
same rules and the same constants the audit grader checks — 2–8 tappable spans, the 0.83
fraction, three-or-no glosses, kana-only readings, no meta glosses. Nothing that fails
those rules can reach the corpus. **Grading accepted output scores 100% by construction
and measures nothing.**

So the number this eval keeps is **first-pass yield**: the share of sentences the model
got right on its first attempt, with no retry. It is the real model and prompt quality
signal, it sets the run's cost and latency, and until now it existed only as console
warnings that scrolled past. The recorded baseline is **87.9%** on gpt-4.1-mini — the mean of three runs, 422 of 480
sentences accepted with no retry, about $0.11 and 160s per run.

**The baseline is a mean because a single run is not a measurement.** That mattered far
more before the generator stopped sampling. Three runs of the identical slice, everything
byte-identical:

| | temperature 1.0 (API default) | temperature 0, escalating retries |
|---|---|---|
| yields | 88.1 / 78.8 / 83.8 | 89.4 / 86.3 / 88.1 |
| mean | 83.5% | **87.9%** |
| spread | 9.4 points | **3.1 points** |
| sd | 4.69 | **1.57** |
| requests per run | 57 | 75 |

Annotating a fixed sentence against a strict schema has one right answer, so sampling had
nothing to explore — it only added noise, and cost yield. Both `noiseBand` and its
`previous` reading are kept in the baseline.

The run also keeps a rejection histogram bucketed by rule rather than by span index, which
is where the actionable part lives. Across the three baseline runs, **151 of 175 rejections (86%) were one family** — the
model writing a grammar note or conjugation explanation where a contextual meaning
belongs. The prompt already forbids this in three separate sentences, so a fourth is
unlikely to help; the lever is a different mechanism, not more wording. This is now the
only thing standing between the generator and a first-pass yield in the nineties.

The structural grade of the accepted output is still recorded, and is still expected to
be exactly 100% every run. It is kept as a drift alarm: the day it is not 100%, the
generator's gate and the audit grader have stopped agreeing, which is two copies of one
rule set going out of sync — the failure this repo produces most often. That condition
fails the run on its own, whatever the yield did.

Because a model at the API's default temperature produces different spans every run, this
target's verdict comes from the yield against a tolerance, not from issue-key equality.
Key comparison would report a regression on sampling noise alone.

The tolerance is **±0.05**, derived from the spread above: one run against a one-run
baseline compounds sd 1.57 to about 2.2 points, and 95% of that is ±4.4. It was ±0.13
while the generator sampled at 1.0, which was too wide to see a real five-point
degradation. Tighten it only against another measurement.

**Retries deliberately do not run at temperature 0.** Retrying a deterministic function
with identical input returns the identical rejection, so each same-batch retry raises the
temperature by 0.25 up to 1.0. Without that, the generator repeats one wrong answer until
it exhausts its ten retries and fails the whole run — which is exactly what happened on
`intersection:0:ja`, twenty identical rejections in a row. A batch *split* keeps the
temperature, because a different set of sentences is already a different prompt.

Four hashes sit in this target's baseline, and each one answers a different "why did the
number move": `sentencesSha256` (the held-out text was rewritten), `promptSha256` (the
model's instructions changed), `generatorSha256` (the script changed but its prompt did
not, so look at the gate), and `graderSha256` (the ruler changed).

The held-out slice is `fixtures/spans-holdout.json`: 40 words, 4 evenly spaced ids from
each of the 10 categories, 160 sentences. Word metadata for grading comes from the frozen
catalog fixture, so only the spans come from the model.

## What this does not cover

- **The semantic tier.** The per-item human/agent review (`semantic-review.json`) is
  reported as `not-scored` and its `review-incomplete` marker is kept out of the number.
  Scoring it means automating the judge against the same contract; that is a separate
  piece of work.
- **Images.** `audit-tuji-atlas-images` downloads every image on every run, so freezing
  its fixture freezes the ID→URL map but not the bytes. It needs a different treatment
  and is not wired up here.
- **Whether a gloss is correct.** Every rule here is structural. Nothing checks that
  「臨時卡」 is what "temporary one" means in that sentence, or that the Japanese reads
  naturally. That is the semantic tier, and it needs an automated judge.
- **CI.** `.github/workflows/ci.yml` runs the typecheck, the tests and `npm run eval` on
  every pull request. `eval:db` needs production credentials and `eval:spans` spends
  money, so neither is wired in; `eval:spans` belongs on a prompt-change trigger or a
  schedule, never on every push.
