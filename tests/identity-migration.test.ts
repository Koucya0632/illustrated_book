// Pins the identity migration in scripts/migrate.ts.
//
// This is the highest-consequence part of the change and the part with no
// runtime test coverage, because it is raw SQL executed once at deploy. The
// specific hazard: `captureAppleNameIfNeeded` used to write the Apple Sign-In
// full name into `nickname` silently, and that was survivable only while a
// consent gate stood between `nickname` and the public wall. This deploy
// removes the gate. If the nickname wipe were dropped, reordered after the gate
// removal, or narrowed by a wrong predicate, real names would go public.
//
// Everything below is an ordering or predicate assertion, because those are the
// mistakes that fail silently rather than loudly.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PUBLIC_UID_PATTERN } from "../lib/public-author";

const migrate = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");

const trigger = migrate.slice(
  migrate.indexOf("CREATE OR REPLACE FUNCTION public.handle_new_user()"),
  migrate.indexOf("DROP TRIGGER IF EXISTS on_auth_user_created"),
);

// MARK: - Minting

test("new signups get a TJ UID, never anything derived from user input", () => {
  assert.match(trigger, /'TJ' \|\| lpad\(floor\(random\(\) \* 100000000\)::bigint::text, 8, '0'\)/);
  // The two defaults that made the old handle personal data. The UID line must
  // not read from metadata or the email, whatever else the trigger does.
  assert.doesNotMatch(trigger, /split_part/);
  const uidLine = trigger.slice(trigger.indexOf("candidate TEXT :="), trigger.indexOf("BEGIN"));
  assert.doesNotMatch(uidLine, /raw_user_meta_data/);
});

// Seeding a nickname from metadata is NOT the hazard the Apple capture was.
// The rule is "never publish a name the user did not type", and this one is
// typed — into a field labelled 暱稱 on the signup form.
test("the display name may be seeded from what the user typed at signup", () => {
  assert.match(trigger, /raw_user_meta_data->>'nickname'/);
  // Blank input must become NULL, not an empty display name that would render
  // as a nameless author instead of falling back to the UID.
  assert.match(trigger, /nullif\(trim\(NEW\.raw_user_meta_data->>'nickname'\), ''\)/);
});

// A suffix would produce TJ00000042-2, which fails the pattern every reader
// validates against — so the collision path must re-roll instead.
test("collisions re-roll rather than append a suffix", () => {
  const loop = trigger.slice(trigger.indexOf("WHILE EXISTS"), trigger.indexOf("INSERT INTO"));
  assert.match(loop, /candidate := 'TJ' \|\| lpad/);
  assert.doesNotMatch(loop, /\|\| '-' \|\|/);
  assert.equal(PUBLIC_UID_PATTERN.test("TJ00000042-2"), false);
});

// MARK: - Ordering
//
// The DDL array executes in order, so index comparisons are the real contract.

function indexOfStatement(needle: string): number {
  const i = migrate.indexOf(needle);
  assert.notEqual(i, -1, `migrate.ts should contain: ${needle}`);
  return i;
}

test("the nickname wipe exists and targets only unconsented names", () => {
  const wipe = indexOfStatement("SET nickname = NULL");
  const stmt = migrate.slice(wipe, wipe + 200);
  // Narrower than this would leave seeded names behind; wider would delete
  // names people did consent to publish.
  assert.match(stmt, /WHERE public_author_confirmed_at IS NULL/);
  assert.match(stmt, /AND nickname IS NOT NULL/);
});

test("handles are migrated before nicknames are wiped, and both before the trigger swap", () => {
  const uidBackfill = indexOfStatement("WHERE username !~ '^TJ[0-9]{8}$'");
  const wipe = indexOfStatement("SET nickname = NULL");
  const triggerSwap = indexOfStatement("DROP TRIGGER IF EXISTS on_auth_user_created");
  assert.ok(uidBackfill < wipe, "UID backfill must precede the nickname wipe");
  assert.ok(wipe < triggerSwap, "both backfills must precede the trigger swap");
});

// MARK: - Idempotence
//
// This array re-runs on every deploy, so a statement that is not self-limiting
// would corrupt data on the second run — e.g. re-rolling every UID each time,
// which would break author links that had already settled.

test("the UID backfill skips rows that already match", () => {
  const backfill = indexOfStatement("WHERE username !~ '^TJ[0-9]{8}$'");
  assert.match(migrate.slice(backfill - 400, backfill + 100), /FOR r IN SELECT id FROM profiles/);
});

test("the retired columns are kept, because the wipe still reads one", () => {
  // Dropping public_author_confirmed_at would make the nickname wipe fail on
  // the next deploy's re-run.
  assert.match(migrate, /ADD COLUMN IF NOT EXISTS public_author_confirmed_at/);
  assert.doesNotMatch(migrate, /DROP COLUMN IF EXISTS public_author_confirmed_at/);
});
