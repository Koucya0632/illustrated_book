import assert from "node:assert/strict";
import test from "node:test";
import { assertWriterConfigured, writeBackend } from "../lib/storage/public-writer";

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const prev = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    process.env = prev;
  }
}

const R2 = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "tuji-assets",
};
const NO_R2 = Object.fromEntries(Object.keys(R2).map((k) => [k, undefined]));

test("without an asset host, objects go to Supabase", () => {
  withEnv({ NEXT_PUBLIC_ASSET_BASE_URL: undefined, ...NO_R2 }, () => {
    assert.equal(writeBackend(), "supabase");
    assert.doesNotThrow(assertWriterConfigured);
  });
});

test("with an asset host and credentials, objects go to R2", () => {
  withEnv({ NEXT_PUBLIC_ASSET_BASE_URL: "https://img.example.com", ...R2 }, () => {
    assert.equal(writeBackend(), "r2");
    assert.doesNotThrow(assertWriterConfigured);
  });
});

// The failure this module exists to prevent: URLs naming the asset host while
// the bytes are still written to Supabase. Every newly uploaded image would
// 404, and only newly uploaded ones — so it would look like a client bug.
test("an asset host without R2 credentials is refused, not silently split", () => {
  withEnv({ NEXT_PUBLIC_ASSET_BASE_URL: "https://img.example.com", ...NO_R2 }, () => {
    assert.equal(writeBackend(), "r2");
    assert.throws(assertWriterConfigured, /R2_\* credentials are missing/);
  });
});
