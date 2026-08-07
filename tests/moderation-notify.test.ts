// Pins the moderation webhook's two load-bearing promises:
//
//  1. It NEVER throws. The report route awaits it, so a webhook that is down,
//     slow, or misconfigured must not turn a successful moderation report into
//     a 500 — the report is the thing that matters, the notification is an aside.
//  2. One body serves both Slack and Discord. Slack reads `text`, Discord reads
//     `content`; sending both means the same env var works for either without
//     asking anyone to configure which.

import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";

import { notifyModeration } from "../lib/notify";

function listen(
  handler: (body: string) => { status: number; delayMs?: number },
): Promise<{ server: Server; url: string; bodies: string[] }> {
  const bodies: string[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      bodies.push(raw);
      const { status, delayMs } = handler(raw);
      setTimeout(() => {
        res.writeHead(status);
        res.end("{}");
      }, delayMs ?? 0);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}`, bodies });
    });
  });
}

test("sends one body that both Slack and Discord can read", async () => {
  const { server, url, bodies } = await listen(() => ({ status: 200 }));
  process.env.MODERATION_WEBHOOK_URL = url;
  try {
    await notifyModeration("檢舉：bath-mat");
    assert.equal(bodies.length, 1);
    const parsed = JSON.parse(bodies[0]);
    assert.equal(parsed.text, "檢舉：bath-mat", "Slack reads `text`");
    assert.equal(parsed.content, "檢舉：bath-mat", "Discord reads `content`");
  } finally {
    server.close();
    delete process.env.MODERATION_WEBHOOK_URL;
  }
});

test("a webhook that errors does not throw", async () => {
  const { server, url } = await listen(() => ({ status: 500 }));
  process.env.MODERATION_WEBHOOK_URL = url;
  try {
    await notifyModeration("x"); // must resolve
  } finally {
    server.close();
    delete process.env.MODERATION_WEBHOOK_URL;
  }
});

test("an unreachable webhook does not throw", async () => {
  // Port 1 is reserved and nothing listens there.
  process.env.MODERATION_WEBHOOK_URL = "http://127.0.0.1:1/hook";
  try {
    await notifyModeration("x");
  } finally {
    delete process.env.MODERATION_WEBHOOK_URL;
  }
});

test("no webhook configured is silence, not an error", async () => {
  delete process.env.MODERATION_WEBHOOK_URL;
  await notifyModeration("x");
});
