// Disposable PostgreSQL; never loads .env files or uses DATABASE_URL.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const name = `tuji-credits-test-${randomUUID()}`;
const password = randomUUID();
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? result.stderr.trim());
  }
  return result.stdout.trim();
}
let started = false;
try {
  docker(["run", "--detach", "--rm", "--name", name,
    "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=tuji_credits_test",
    "-p", "127.0.0.1::5432", "postgres:17-alpine"]);
  started = true;
  const port = docker(["port", name, "5432/tcp"]).split(":").at(-1);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const probe = spawnSync("docker", ["exec", name, "pg_isready", "-U", "postgres"], { stdio: "ignore" });
    if (probe.status === 0) { ready = true; break; }
    await delay(1000);
  }
  if (!ready) throw new Error("Test PostgreSQL did not become ready");
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--test", "--test-concurrency=1",
    "tests/credits-policy.test.ts", "tests/credits-http.test.ts", "tests/credits-postgres.test.ts",
    "tests/ai-operations-postgres.test.ts", "tests/ai-operations-http.test.ts", "tests/ai-upload-body.test.ts", "tests/credits-store-contracts.test.ts",
    "tests/credits-preflight-postgres.test.ts", "tests/credit-refund-review-postgres.test.ts", "tests/credit-refund-review-http.test.ts"], {
    stdio: "inherit",
    env: { ...process.env, CREDIT_TEST_DATABASE_URL: `postgres://postgres:${password}@127.0.0.1:${port}/tuji_credits_test` },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Credit integration tests failed");
  process.exitCode = 1;
} finally {
  if (started) spawnSync("docker", ["stop", name], { stdio: "ignore" });
}
