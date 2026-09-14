// A refused bearer token is a 401, not an empty list — see lib/refused-bearer.ts.

import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { presentsBearerToken } from "../lib/refused-bearer";

const req = (authorization?: string) =>
  new Request("https://example.test/api/users/mastery", {
    headers: authorization == null ? {} : { authorization },
  });

test("an app's bearer token is recognised, however it is cased", () => {
  assert.equal(presentsBearerToken(req("Bearer eyJhbGciOi")), true);
  assert.equal(presentsBearerToken(req("bearer eyJhbGciOi")), true);
});

test("a web visitor with no token, or no usable one, is not treated as refused", () => {
  assert.equal(presentsBearerToken(req()), false);
  assert.equal(presentsBearerToken(req("Bearer ")), false);
  assert.equal(presentsBearerToken(req("Basic dXNlcjpwYXNz")), false);
});

const root = new URL("..", import.meta.url).pathname;

test("the two reads that serve signed-out web callers say 401 to a refused token", () => {
  for (const route of ["app/api/users/mastery/route.ts", "app/api/users/favorites/route.ts"]) {
    const src = readFileSync(join(root, route), "utf8");
    assert.match(src, /presentsBearerToken\(req\)\s*\?\s*NextResponse\.json\(\{ error: "unauthorized" \}, \{ status: 401 \}\)/, route);
  }
});

function routes(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) return routes(path);
    return name === "route.ts" ? [path] : [];
  });
}

test("no route answers a missing user with a bare success", () => {
  // The shape both defects had: one line, a 200, and no way for an app to learn
  // its token was the problem.
  const offenders = routes("app/api").filter((path) =>
    /if \(!userId\) return NextResponse\.json\((?![^;]*status: 40[13])[^;]*\);/.test(readFileSync(join(root, path), "utf8")),
  );
  assert.deepEqual(offenders, []);
});
