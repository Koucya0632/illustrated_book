import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import { createCreditWallet, type CreditAccount, type CreditTransaction } from "../credits/wallet";
import { OperationError, recognitionUsage } from "./contracts";
import { enrichmentDelivery } from "./fulfillment-contracts";
import type { AtlasItemRow } from "../atlas/types";

type Row = Record<string, any>;
export interface FulfillmentLease { token: string; stagedResult: unknown; item: AtlasItemRow }
const terminal = new Set(["completed", "compensated", "superseded"]);

/** One included service per recognition. Provider calls stay outside this transaction. */
export function createFulfillments(sql: postgres.Sql, clock = () => new Date()) {
  const wallet = createCreditWallet(sql, clock);
  function transact<T>(a: CreditAccount, run: (s: CreditTransaction) => Promise<T>) {
    return wallet.transact(a, async s => {
      await s.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`atlas-capacity:${a.userId}`}, 0))`;
      return run(s);
    });
  }
  async function load(s: CreditTransaction, a: CreditAccount, id: string) {
    const [row] = await s.sql`SELECT f.*, o.user_id, o.confirmed_item_id, o.confirmed_candidate_id, o.confirmed_lemma, o.input, o.result, o.image_id
      FROM ai_fulfillments f JOIN ai_operations o ON o.id = f.operation_id
      WHERE o.id = ${id} AND o.user_id = ${a.userId} AND o.environment = ${a.environment}`;
    if (!row) throw new OperationError("operation_not_found");
    return row;
  }
  async function state(s: CreditTransaction, f: Row, value: string, failure: string | null = null) {
    await s.sql`UPDATE ai_fulfillments SET state = ${value}, failure_code = ${failure},
      lease_token = NULL, lease_until = NULL, updated_at = ${s.now} WHERE operation_id = ${f.operation_id}`;
    await s.sql`UPDATE ai_operations SET fulfillment_state = ${value}, updated_at = ${s.now} WHERE id = ${f.operation_id}`;
    await s.sql`UPDATE ai_fulfillment_attempts SET outcome = ${value}, finished_at = ${s.now}
      WHERE operation_id = ${f.operation_id} AND finished_at IS NULL`;
    return value;
  }
  function fence(s: CreditTransaction, f: Row, token: string) {
    if (f.state !== "running" || f.lease_token !== token || f.lease_until <= s.now) throw new OperationError("stale_attempt");
  }
  async function item(s: CreditTransaction, f: Row) {
    const [row] = await s.sql`SELECT * FROM user_atlas_items WHERE id = ${f.confirmed_item_id}
      AND user_id = ${f.user_id} AND deleted_at IS NULL FOR UPDATE`;
    const candidate = f.result?.candidates?.find((c: Row) => c.id === f.confirmed_candidate_id);
    // Confirmed before confirmed_lemma existed → the candidate's own label.
    const lemma = f.confirmed_lemma ?? candidate?.label;
    return row && lemma && row.lemma === lemma && row.selected_candidate_id === f.confirmed_candidate_id &&
      row.target_language === f.input.targetLanguage && ["candidate", "manual"].includes(row.correction_source) ? row : null;
  }
  async function compensate(s: CreditTransaction, f: Row, reason: string) {
    await s.compensate(`ai:${f.operation_id}`);
    await s.sql`UPDATE user_atlas_items SET backfill_status = 'failed', backfill_error = ${reason}, updated_at = ${s.now}
      WHERE id = ${f.confirmed_item_id} AND selected_candidate_id = ${f.confirmed_candidate_id} AND deleted_at IS NULL`;
    return state(s, f, "compensated", reason);
  }
  return {
    claim(a: CreditAccount, id: string): Promise<FulfillmentLease | null> {
      return transact(a, async s => {
        const f = await load(s, a, id);
        if (terminal.has(f.state)) return null;
        if (f.state === "running" && f.lease_until > s.now) return null;
        if (f.next_attempt_at > s.now) return null;
        const saved = await item(s, f);
        // A user edit/re-recognition withdraws the old right; it must not overwrite newer work.
        if (!saved) { await state(s, f, "superseded", "item_changed"); return null; }
        if (f.deadline_at <= s.now) { await compensate(s, f, "fulfillment_deadline"); return null; }
        if ((f.state === "running" || f.state === "reconciling") && !f.staged_result) {
          await compensate(s, f, "result_uncertain"); return null;
        }
        const attempt = f.staged_result ? f.attempt : f.attempt + 1;
        if (attempt > 3) { await compensate(s, f, "retry_exhausted"); return null; }
        const token = randomUUID(), until = new Date(s.now.getTime() + 90_000);
        await s.sql`UPDATE ai_fulfillments SET state = 'running', attempt = ${attempt}, lease_token = ${token},
          lease_until = ${until}, updated_at = ${s.now} WHERE operation_id = ${id}`;
        await s.sql`UPDATE ai_operations SET fulfillment_state = 'running', updated_at = ${s.now} WHERE id = ${id}`;
        // Recovery of a persisted result replaces the fence without spending another provider attempt.
        await s.sql`INSERT INTO ai_fulfillment_attempts (operation_id, attempt, token, started_at)
          VALUES (${id}, ${attempt}, ${token}, ${s.now}) ON CONFLICT (operation_id, attempt)
          DO UPDATE SET token = EXCLUDED.token, finished_at = NULL, outcome = NULL`;
        return { token, stagedResult: f.staged_result, item: saved as AtlasItemRow };
      });
    },
    stage(a: CreditAccount, id: string, token: string, raw: unknown) {
      return transact(a, async s => {
        const f = await load(s, a, id); fence(s, f, token);
        const parsed = enrichmentDelivery.safeParse(raw);
        if (!parsed.success || parsed.data.fields.enrichment.targetDefinitionLang !== f.input.targetLanguage ||
            (f.input.targetLanguage === "ja" && !parsed.data.fields.reading?.trim())) throw new OperationError("invalid_ai_result");
        if (f.staged_result && !isDeepStrictEqual(f.staged_result, parsed.data)) throw new OperationError("invalid_ai_result");
        await s.sql`UPDATE ai_fulfillments SET staged_result = ${s.sql.json(parsed.data)}, updated_at = ${s.now} WHERE operation_id = ${id}`;
        await s.sql`UPDATE ai_fulfillment_attempts SET usage = ${s.sql.json(parsed.data.usage ?? {})} WHERE token = ${token}`;
      });
    },
    commit(a: CreditAccount, id: string, token: string) {
      return transact(a, async s => {
        const f = await load(s, a, id);
        if (terminal.has(f.state)) return f.state as string;
        fence(s, f, token);
        const parsed = enrichmentDelivery.safeParse(f.staged_result);
        if (!parsed.success) throw new OperationError("invalid_ai_result");
        if (!await item(s, f)) return state(s, f, "superseded", "item_changed");
        const { fields: v, usage, provider, model } = parsed.data;
        await s.sql`UPDATE user_atlas_items SET pronunciation = ${v.pronunciation}, reading = ${v.reading},
          reading_segments = ${v.readingSegments ? s.sql.json(v.readingSegments) : null},
          definition_target = ${v.definitionTarget}, definition_zh_hant = ${v.definitionZh},
          definition_ja = ${v.definitionJa}, definition_en = ${v.definitionEn},
          display_ja = COALESCE(display_ja, ${v.displayJa}), display_en = COALESCE(display_en, ${v.displayEn}),
          enrichment = ${s.sql.json(v.enrichment)}, backfill_status = 'filled', backfill_error = NULL,
          backfill_attempts = ${f.attempt}, backfill_attempts_version = ${v.enrichment.enrichVersion}, updated_at = ${s.now}
          WHERE id = ${f.confirmed_item_id} AND user_id = ${a.userId}`;
        await s.sql`INSERT INTO user_atlas_ai_usage (user_id, image_id, provider, model, operation,
          input_tokens, output_tokens, estimated_cost_usd, latency_ms, success)
          VALUES (${a.userId}, ${f.image_id}, ${provider}, ${model}, 'enrich',
            ${usage?.inputTokens ?? null}, ${usage?.outputTokens ?? null}, ${usage?.estimatedCostUsd ?? null}, ${usage?.latencyMs ?? null}, true)`;
        return state(s, f, "completed");
      });
    },
    fail(a: CreditAccount, id: string, token: string, reason: string, uncertain = false, rawUsage?: unknown) {
      return transact(a, async s => {
        const f = await load(s, a, id); fence(s, f, token);
        const usage = recognitionUsage.safeParse(rawUsage);
        if (usage.success) await s.sql`UPDATE ai_fulfillment_attempts SET usage = ${s.sql.json(usage.data)} WHERE token = ${token}`;
        if (!await item(s, f)) return state(s, f, "superseded", "item_changed");
        if (!uncertain && f.attempt >= 3) return compensate(s, f, reason);
        const next = new Date(s.now.getTime() + (uncertain ? 90_000 : 120_000));
        await s.sql`UPDATE ai_fulfillments SET next_attempt_at = ${next} WHERE operation_id = ${id}`;
        return state(s, f, uncertain ? "reconciling" : "pending", reason);
      });
    },
    scan(environment: CreditAccount["environment"], limit = 1) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new OperationError("invalid_ai_request");
      const now = clock();
      return sql`SELECT o.id, o.user_id FROM ai_fulfillments f JOIN ai_operations o ON o.id = f.operation_id
        WHERE o.environment = ${environment} AND f.state IN ('pending','running','reconciling')
          AND f.next_attempt_at <= ${now} AND (f.lease_until IS NULL OR f.lease_until <= ${now})
        ORDER BY f.next_attempt_at, f.created_at LIMIT ${limit}`;
    },
  };
}
export type Fulfillments = ReturnType<typeof createFulfillments>;
