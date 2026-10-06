import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createOpenAI } from "@ai-sdk/openai";

test("Japanese enrichment requests strict structured output through the real OpenAI adapter", async () => {
  if (!process.execArgv.includes("--conditions=react-server")) {
    const childEnv = { ...process.env };
    delete childEnv.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--test",
      fileURLToPath(import.meta.url)], { stdio: "pipe", env: childEnv });
    return;
  }
  const { enrichWord } = await import("../lib/enrich");
  let requests = 0;
  const provider = createOpenAI({
    apiKey: "test-key",
    fetch: async (_url, init) => {
      requests++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true,
        "The installed adapter defaults to non-strict output, allowing invalid generated fields");
      assert.ok(body.text.format.schema.required.includes("forms"));
      return Response.json({
        id: "resp_test", created_at: 1, model: "gpt-4o-mini", status: "completed",
        output: [{ id: "msg_test", type: "message", role: "assistant", status: "completed",
          content: [{ type: "output_text", annotations: [], text: JSON.stringify({
            synonyms: [], antonyms: [], related: ["cup"], forms: [],
            mnemonic: "杯子", englishDefinition: "A small vessel used for drinking.",
            chineseDefinition: "用來盛裝飲料的小型容器。", etymology: "源自英語 cup。",
          }) }] }],
        usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
      });
    },
  });
  const result = await enrichWord({ word: "カップ", partOfSpeech: "noun", chinese: "杯子" },
    { model: provider("gpt-4o-mini") });
  assert.deepEqual(result.forms, []);
  assert.ok(result.chineseDefinition);
  assert.equal(requests, 1);
});
