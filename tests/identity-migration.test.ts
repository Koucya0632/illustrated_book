import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PUBLIC_UID_PATTERN } from "../lib/public-author";

const migrate = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");
const trigger = migrate.slice(
  migrate.indexOf("CREATE OR REPLACE FUNCTION public.handle_new_user()"),
  migrate.indexOf("DROP TRIGGER IF EXISTS on_auth_user_created"),
);

function position(needle: string): number {
  const index = migrate.indexOf(needle);
  assert.notEqual(index, -1, `migrate.ts should contain: ${needle}`);
  return index;
}

test("registration mints only the UID and leaves nickname unset", () => {
  assert.match(trigger, /INSERT INTO public\.profiles \(id, username\)/);
  assert.match(trigger, /VALUES \(NEW\.id, candidate\)/);
  const insert = trigger.slice(trigger.indexOf("INSERT INTO"), trigger.indexOf("-- Mirror the UID"));
  assert.doesNotMatch(insert, /nickname|raw_user_meta_data|email/i);
});

test("UID collisions re-roll without changing the fixed public shape", () => {
  const loop = trigger.slice(trigger.indexOf("WHILE EXISTS"), trigger.indexOf("INSERT INTO"));
  assert.match(loop, /candidate := 'TJ' \|\| lpad/);
  assert.equal(PUBLIC_UID_PATTERN.test("TJ00000042-2"), false);
});

test("existing handles migrate before the auth UID mirror", () => {
  const uidBackfill = position("WHERE username !~ '^TJ[0-9]{8}$'");
  const mirror = position("UPDATE auth.users u");
  assert.ok(uidBackfill < mirror);
  assert.match(migrate.slice(mirror, mirror + 500), /jsonb_build_object\('username', p\.username\)/);
});

test("existing profile nicknames are re-moderated before deployment completes", () => {
  const implementation = position("async function moderateExistingProfileNicknames");
  const invocation = position("await moderateExistingProfileNicknames(sql)");
  const finalSetup = position("await setupStudyLogsPartitioning(sql)");
  assert.match(migrate.slice(implementation, invocation), /runAtlasTextModeration\(\[nickname\]\)/);
  assert.match(migrate.slice(implementation, invocation), /SELECT id, nickname FROM profiles/);
  assert.ok(invocation < finalSetup);
});

test("session-only nickname metadata is never promoted into profiles", () => {
  assert.doesNotMatch(trigger, /raw_user_meta_data->>'nickname'/);
  const moderation = migrate.slice(
    position("async function moderateExistingProfileNicknames"),
    position("// ---- card generator ----"),
  );
  assert.doesNotMatch(moderation, /auth\.users|raw_user_meta_data/);
});
