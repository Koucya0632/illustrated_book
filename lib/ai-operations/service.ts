import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import { assertCreditKey, CREDIT_POLICY, CreditError } from "../credits/policy";
import { createCreditWallet, type CreditAccount, type CreditTransaction } from "../credits/wallet";
import {
  OPERATION_TIMING, OperationError, recognitionDelivery, recognitionQuoteInput, recognitionUsage,
  type CandidateCorrection, type RecognitionInput, type RecognitionDelivery,
} from "./contracts";

type Row = Record<string, any>;
export interface WorkLease { operation: Row; token: string; stagedResult: RecognitionDelivery | null }
const stageFor = (input: RecognitionInput) => input.feature === "atlas.recognize.primary" ? "primary" : "escalated";
const dateAfter = (now: Date, ms: number) => new Date(now.getTime() + ms);

/** Account → capacity advisory lock → domain rows. External calls never hold these locks. */
export function createAiOperations(sql: postgres.Sql, clock: () => Date = () => new Date()) {
  const wallet = createCreditWallet(sql, clock);
  function transact<T>(a: CreditAccount, run: (scope: CreditTransaction) => Promise<T>) {
    return wallet.transact(a, async scope => {
      await scope.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`atlas-capacity:${a.userId}`}, 0))`;
      return run(scope);
    });
  }
  async function holding(scope: CreditTransaction, a: CreditAccount): Promise<number> {
    const tx = scope.sql;
    const [permanent] = await tx`SELECT id FROM user_lifetime_entitlements
      WHERE user_id = ${a.userId} AND revoked_at IS NULL LIMIT 1`;
    if (!permanent) throw new CreditError("benefit_ineligible");
    return CREDIT_POLICY.lifetimeAtlasSlots;
  }
  async function image(scope: CreditTransaction, a: CreditAccount, id: string) {
    const [row] = await scope.sql`SELECT * FROM user_atlas_images
      WHERE id = ${id} AND user_id = ${a.userId} AND deleted_at IS NULL`;
    if (!row) throw new OperationError("image_not_found");
    return row;
  }
  async function operation(scope: CreditTransaction, a: CreditAccount, id: string) {
    const [row] = await scope.sql`SELECT * FROM ai_operations
      WHERE id = ${id} AND user_id = ${a.userId} AND environment = ${a.environment}`;
    if (!row) throw new OperationError("operation_not_found");
    return row;
  }
  async function view(scope: CreditTransaction, op: Row) {
    const [capacity] = await scope.sql`SELECT expires_at FROM atlas_capacity_reservations WHERE operation_id = ${op.id}`;
    return {
      id: op.id as string, state: op.state as string, points: op.points as number,
      feature: op.input.feature as RecognitionInput["feature"], targetLanguage: op.input.targetLanguage as "en" | "ja",
      imageId: op.image_id as string, priceVersion: op.price_version as string,
      failureCode: op.failure_code as string | null,
      result: op.state === "committed" ? op.result : null,
      confirmationExpiresAt: capacity?.expires_at?.toISOString() ?? null,
      confirmedItemId: op.confirmed_item_id as string | null, fulfillmentState: op.fulfillment_state as string,
    };
  }
  async function capacityAvailable(scope: CreditTransaction, a: CreditAccount, limit: number, except?: string) {
    const [usage] = await scope.sql`SELECT
      (SELECT count(*) FROM user_atlas_items WHERE user_id = ${a.userId} AND deleted_at IS NULL) +
      (SELECT count(*) FROM atlas_capacity_reservations WHERE user_id = ${a.userId}
        AND expires_at > ${scope.now} AND (${except ?? null}::uuid IS NULL OR operation_id <> ${except ?? null}::uuid)) AS total`;
    if (Number(usage.total) >= limit) throw new OperationError("capacity_full");
  }
  /** The committed ordinary run a precision run on the same photo upgrades, once. */
  async function upgradeBase(scope: CreditTransaction, a: CreditAccount, imageId: string): Promise<string | null> {
    const [base] = await scope.sql`SELECT o.id FROM ai_operations o WHERE o.user_id = ${a.userId}
      AND o.environment = ${a.environment} AND o.image_id = ${imageId} AND o.state = 'committed'
      AND o.input->>'feature' = 'atlas.recognize.primary'
      AND NOT EXISTS (SELECT 1 FROM ai_operations p WHERE p.user_id = o.user_id AND p.environment = o.environment
        AND p.image_id = o.image_id AND p.input->>'feature' = 'atlas.recognize.precision'
        AND p.state <> 'released' AND p.created_at >= o.created_at)
      ORDER BY o.created_at DESC LIMIT 1`;
    return base?.id ?? null;
  }
  async function price(scope: CreditTransaction, a: CreditAccount, input: RecognitionInput, imageId: string) {
    if (input.feature === "atlas.recognize.primary") return { points: CREDIT_POLICY.recognition, base: null };
    const base = await upgradeBase(scope, a, imageId);
    return { points: base ? CREDIT_POLICY.precisionUpgrade : CREDIT_POLICY.precision, base };
  }
  function fence(scope: CreditTransaction, op: Row, token: string) {
    if (op.state !== "running" || op.lease_token !== token || !op.lease_until ||
        op.lease_until <= scope.now || op.reconcile_until <= scope.now) throw new OperationError("stale_attempt");
  }
  async function release(scope: CreditTransaction, a: CreditAccount, op: Row, reason: string) {
    await scope.settle(`ai:${op.id}`, "release");
    await scope.sql`UPDATE ai_operations SET state = 'released', failure_code = ${reason},
      lease_token = NULL, lease_until = NULL, updated_at = ${scope.now} WHERE id = ${op.id}`;
    await scope.sql`DELETE FROM atlas_capacity_reservations WHERE operation_id = ${op.id}`;
    await scope.sql`UPDATE user_atlas_recognition_jobs SET status = 'failed', error = ${reason},
      finished_at = ${scope.now}, updated_at = ${scope.now} WHERE id = ${op.job_id} AND user_id = ${a.userId}`;
    await scope.sql`UPDATE ai_operation_attempts SET outcome = 'released', finished_at = ${scope.now}
      WHERE operation_id = ${op.id} AND attempt = ${op.attempt} AND finished_at IS NULL`;
    return view(scope, { ...op, state: "released", failure_code: reason });
  }

  return {
    quote(a: CreditAccount, rawInput: unknown) {
      const parsed = recognitionQuoteInput.safeParse(rawInput);
      if (!parsed.success) throw new OperationError("invalid_ai_request");
      const input = parsed.data;
      if (input.glossLanguage === input.targetLanguage) input.glossLanguage = null;
      return transact(a, async scope => {
        await holding(scope, a);
        const source = await image(scope, a, input.imageId);
        const { points } = await price(scope, a, input, source.id);
        const requestHash = createHash("sha256").update(JSON.stringify({ input, sha256: source.sha256, points, version: CREDIT_POLICY.version })).digest("hex");
        const id = randomUUID();
        const expiresAt = dateAfter(scope.now, OPERATION_TIMING.quoteMs);
        await scope.sql`INSERT INTO ai_quotes
          (id, user_id, environment, input, image_sha256, request_hash, points, price_version, expires_at, created_at)
          VALUES (${id}, ${a.userId}, ${a.environment}, ${scope.sql.json(input)}, ${source.sha256}, ${requestHash},
            ${points}, ${CREDIT_POLICY.version}, ${expiresAt}, ${scope.now})`;
        return { id, points, priceVersion: CREDIT_POLICY.version, expiresAt: expiresAt.toISOString(), input };
      });
    },

    accept(a: CreditAccount, quoteId: string, key: string, allowNew = true) {
      assertCreditKey(key);
      return transact(a, async scope => {
        const tx = scope.sql;
        const [quote] = await tx`SELECT * FROM ai_quotes WHERE id = ${quoteId}
          AND user_id = ${a.userId} AND environment = ${a.environment}`;
        if (!quote) throw new OperationError("quote_not_found");
        const [existing] = await tx`SELECT * FROM ai_operations WHERE user_id = ${a.userId}
          AND environment = ${a.environment} AND idempotency_key = ${key}`;
        if (existing) {
          if (existing.request_hash !== quote.request_hash) throw new CreditError("idempotency_conflict");
          return view(scope, existing);
        }
        if (!allowNew) throw new CreditError("credits_disabled");
        if (quote.expires_at <= scope.now) throw new OperationError("quote_expired");
        const [accepted] = await tx`SELECT id FROM ai_operations WHERE quote_id = ${quote.id}`;
        if (accepted) throw new CreditError("idempotency_conflict");
        const limit = await holding(scope, a);
        const source = await image(scope, a, quote.input.imageId);
        if (source.sha256 !== quote.image_sha256) throw new OperationError("image_changed");
        const [busy] = await tx`SELECT id FROM ai_operations WHERE user_id = ${a.userId} AND image_id = ${source.id}
          AND state IN ('reserved','running','reconciling')`;
        if (busy) throw new OperationError("operation_busy");
        // An upgrade quote is only honoured while its ordinary run is still unused.
        const { points, base } = await price(scope, a, quote.input, source.id);
        if (points !== quote.points) throw new OperationError("quote_expired");
        const [item] = await tx`SELECT id FROM user_atlas_items WHERE user_id = ${a.userId}
          AND image_id = ${source.id} AND deleted_at IS NULL LIMIT 1`;
        if (!item) await capacityAvailable(scope, a, limit, base ?? undefined);
        // The upgrade takes over the ordinary run's slot hold; confirming that run later rechecks capacity.
        if (base) await tx`DELETE FROM atlas_capacity_reservations WHERE operation_id = ${base}`;
        const id = randomUUID(), jobId = randomUUID();
        await scope.reserve(`ai:${id}`, quote.points);
        const reservationDeadline = dateAfter(scope.now, OPERATION_TIMING.reconcileMs);
        await tx`INSERT INTO ai_operations (id, user_id, environment, quote_id, idempotency_key, request_hash,
          image_id, job_id, input, image_sha256, requires_slot, points, price_version, state, reconcile_until, created_at, updated_at)
          VALUES (${id}, ${a.userId}, ${a.environment}, ${quote.id}, ${key}, ${quote.request_hash}, ${source.id}, ${jobId},
            ${tx.json(quote.input)}, ${source.sha256}, ${!item}, ${quote.points}, ${quote.price_version}, 'reserved',
            ${reservationDeadline}, ${scope.now}, ${scope.now})`;
        if (!item) await tx`INSERT INTO atlas_capacity_reservations (operation_id, user_id, environment, expires_at)
          VALUES (${id}, ${a.userId}, ${a.environment}, ${reservationDeadline})`;
        await tx`INSERT INTO user_atlas_recognition_jobs (id, user_id, image_id, stage)
          VALUES (${jobId}, ${a.userId}, ${source.id}, ${stageFor(quote.input)})`;
        return view(scope, await operation(scope, a, id));
      });
    },

    read(a: CreditAccount, id: string) {
      return transact(a, async scope => view(scope, await operation(scope, a, id)));
    },
    list(a: CreditAccount) {
      return transact(a, async scope => {
        const rows = await scope.sql`SELECT * FROM ai_operations WHERE user_id = ${a.userId} AND environment = ${a.environment}
          ORDER BY created_at DESC, id DESC LIMIT 50`;
        const operations = [];
        for (const op of rows) operations.push(await view(scope, op));
        return { operations };
      });
    },

    cancel(a: CreditAccount, id: string) {
      return transact(a, async scope => {
        const op = await operation(scope, a, id);
        if (op.state === "released") return view(scope, op);
        if (op.state !== "reserved") throw new OperationError("operation_busy");
        return release(scope, a, op, "cancelled");
      });
    },

    /** A crashed/expired provider attempt is never automatically called a second time. */
    claimWork(a: CreditAccount, id: string): Promise<WorkLease | null> {
      return transact(a, async scope => {
        const tx = scope.sql;
        const op = await operation(scope, a, id);
        if (op.state === "committed" || op.state === "released") return null;
        if (op.reconcile_until <= scope.now) { await release(scope, a, op, "recovery_deadline"); return null; }
        if (op.state === "reserved" && op.reconcile_until.getTime() - scope.now.getTime() < OPERATION_TIMING.minimumExecutionMs) {
          await release(scope, a, op, "queue_deadline");
          return null;
        }
        if (op.state === "running" && op.lease_until > scope.now) return null;
        if (op.state === "running" || op.state === "reconciling") {
          await tx`UPDATE ai_operation_attempts SET outcome = 'reconciling', finished_at = ${scope.now}
            WHERE operation_id = ${op.id} AND attempt = ${op.attempt} AND finished_at IS NULL`;
          if (!op.staged_result) {
            await tx`UPDATE ai_operations SET state = 'reconciling', lease_token = NULL, lease_until = NULL,
              updated_at = ${scope.now} WHERE id = ${op.id}`;
            return null;
          }
        }
        const token = randomUUID(), attempt = op.attempt + 1;
        const leaseUntil = new Date(Math.min(dateAfter(scope.now, OPERATION_TIMING.leaseMs).getTime(), op.reconcile_until.getTime()));
        await tx`UPDATE ai_operations SET state = 'running', attempt = ${attempt}, lease_token = ${token},
          lease_until = ${leaseUntil}, updated_at = ${scope.now} WHERE id = ${op.id}`;
        await tx`INSERT INTO ai_operation_attempts (operation_id, attempt, token, started_at, lease_until)
          VALUES (${op.id}, ${attempt}, ${token}, ${scope.now}, ${leaseUntil})`;
        await tx`UPDATE user_atlas_recognition_jobs SET status = 'running', started_at = COALESCE(started_at, ${scope.now}),
          updated_at = ${scope.now} WHERE id = ${op.job_id} AND user_id = ${a.userId}`;
        return { operation: { ...op, state: "running", attempt, lease_token: token, lease_until: leaseUntil }, token, stagedResult: op.staged_result };
      });
    },

    heartbeat(a: CreditAccount, id: string, token: string) {
      return transact(a, async scope => {
        const op = await operation(scope, a, id);
        fence(scope, op, token);
        const until = new Date(Math.min(dateAfter(scope.now, OPERATION_TIMING.leaseMs).getTime(), op.reconcile_until.getTime()));
        await scope.sql`UPDATE ai_operations SET lease_until = ${until}, updated_at = ${scope.now} WHERE id = ${id}`;
        await scope.sql`UPDATE ai_operation_attempts SET lease_until = ${until} WHERE token = ${token}`;
      });
    },

    stageResult(a: CreditAccount, id: string, token: string, raw: unknown) {
      return transact(a, async scope => {
        const op = await operation(scope, a, id);
        fence(scope, op, token);
        const parsed = recognitionDelivery.safeParse(raw);
        if (!parsed.success || parsed.data.stage !== stageFor(op.input) ||
            (op.input.glossLanguage && [...parsed.data.primary, ...parsed.data.fine].some(c => !c.gloss?.trim()))) {
          throw new OperationError("invalid_ai_result");
        }
        if (op.staged_result && !isDeepStrictEqual(op.staged_result, parsed.data)) {
          throw new CreditError("idempotency_conflict");
        }
        await scope.sql`UPDATE ai_operations SET staged_result = ${scope.sql.json(parsed.data)}, updated_at = ${scope.now} WHERE id = ${id}`;
        await scope.sql`UPDATE ai_operation_attempts SET usage = ${scope.sql.json(parsed.data.usage ?? {})} WHERE token = ${token}`;
      });
    },

    markUncertain(a: CreditAccount, id: string, token: string) {
      return transact(a, async scope => {
        const op = await operation(scope, a, id);
        fence(scope, op, token);
        await scope.sql`UPDATE ai_operations SET state = 'reconciling', lease_token = NULL, lease_until = NULL,
          failure_code = 'result_uncertain', updated_at = ${scope.now} WHERE id = ${id}`;
        await scope.sql`UPDATE ai_operation_attempts SET outcome = 'reconciling', finished_at = ${scope.now} WHERE token = ${token}`;
      });
    },

    fail(a: CreditAccount, id: string, token: string, reason: "invalid_ai_result" | "input_unavailable" | "rate_limited" | "refund_received", rawUsage?: unknown) {
      return transact(a, async scope => {
        const op = await operation(scope, a, id);
        fence(scope, op, token);
        const usage = recognitionUsage.safeParse(rawUsage);
        if (usage.success) await scope.sql`UPDATE ai_operation_attempts SET usage = ${scope.sql.json(usage.data)} WHERE token = ${token}`;
        return release(scope, a, op, reason);
      });
    },

    commit(a: CreditAccount, id: string, token: string) {
      return transact(a, async scope => {
        const tx = scope.sql;
        const op = await operation(scope, a, id);
        if (op.state === "committed") return view(scope, op);
        fence(scope, op, token);
        const parsed = recognitionDelivery.safeParse(op.staged_result);
        if (!parsed.success) throw new OperationError("invalid_ai_result");
        const [source] = await tx`SELECT id, sha256 FROM user_atlas_images
          WHERE id = ${op.image_id} AND user_id = ${a.userId} AND deleted_at IS NULL`;
        if (!source || source.sha256 !== op.image_sha256) return release(scope, a, op, "input_unavailable");
        const result = parsed.data;
        const candidates: Row[] = [];
        for (const level of ["primary", "fine"] as const) {
          for (let index = 0; index < result[level].length; index++) {
            const c = result[level][index], candidateId = randomUUID();
            await tx`INSERT INTO user_atlas_candidates (id, user_id, job_id, image_id, level, label, normalized_label,
              zh_hant, gloss, target_term, target_language, taxonomy_node_id, confidence, rank, source, metadata)
              VALUES (${candidateId}, ${a.userId}, ${op.job_id}, ${op.image_id}, ${level}, ${c.label}, ${c.normalizedLabel},
                ${c.zhHant}, ${c.gloss}, ${c.label}, ${op.input.targetLanguage}, ${c.taxonomyNodeId}, ${c.confidence},
                ${index + 1}, ${result.provider}, ${tx.json({ stage: result.stage })})`;
            candidates.push({ id: candidateId, level, ...c, rank: index + 1 });
          }
        }
        const [job] = await tx`UPDATE user_atlas_recognition_jobs SET status = 'needs_review', provider = ${result.provider},
          model = ${result.model}, normalized_response = ${tx.json(result)}, finished_at = ${scope.now}, updated_at = ${scope.now}
          WHERE id = ${op.job_id} AND user_id = ${a.userId} RETURNING id`;
        if (!job) return release(scope, a, op, "input_unavailable");
        await tx`INSERT INTO user_atlas_ai_usage (user_id, job_id, image_id, provider, model, operation,
          input_tokens, output_tokens, estimated_cost_usd, latency_ms, success)
          VALUES (${a.userId}, ${op.job_id}, ${op.image_id}, ${result.provider}, ${result.model}, ${result.stage},
            ${result.usage?.inputTokens ?? null}, ${result.usage?.outputTokens ?? null},
            ${result.usage?.estimatedCostUsd ?? null}, ${result.usage?.latencyMs ?? null}, true)`;
        const delivered = { jobId: op.job_id, candidates, recognition: result };
        await scope.settle(`ai:${op.id}`, "commit");
        await tx`UPDATE ai_operations SET state = 'committed', result = ${tx.json(delivered)}, failure_code = NULL,
          lease_token = NULL, lease_until = NULL, updated_at = ${scope.now} WHERE id = ${op.id}`;
        await tx`UPDATE ai_operation_attempts SET outcome = 'committed', finished_at = ${scope.now} WHERE token = ${token}`;
        await tx`UPDATE atlas_capacity_reservations SET expires_at = ${dateAfter(scope.now, OPERATION_TIMING.confirmationMs)}
          WHERE operation_id = ${op.id}`;
        await tx`UPDATE user_atlas_images SET status = CASE WHEN status IN ('confirmed','cards_ready') THEN status ELSE 'needs_review' END,
          updated_at = ${scope.now} WHERE id = ${op.image_id} AND user_id = ${a.userId}`;
        return view(scope, { ...op, state: "committed", result: delivered, failure_code: null });
      });
    },

    confirm(a: CreditAccount, id: string, candidateId: string, correction: CandidateCorrection = {}) {
      return transact(a, async scope => {
        const tx = scope.sql;
        const op = await operation(scope, a, id);
        if (op.state !== "committed") throw new OperationError("operation_not_committed");
        if (op.confirmed_item_id) {
          if (op.confirmed_candidate_id !== candidateId) throw new CreditError("idempotency_conflict");
          const [saved] = await tx`SELECT * FROM user_atlas_items WHERE id = ${op.confirmed_item_id}
            AND user_id = ${a.userId} AND deleted_at IS NULL`;
          if (!saved) throw new OperationError("image_not_found");
          return { item: saved, operation: await view(scope, op) };
        }
        const limit = await holding(scope, a);
        await image(scope, a, op.image_id);
        const [candidate] = await tx`SELECT * FROM user_atlas_candidates WHERE id = ${candidateId}
          AND job_id = ${op.job_id} AND user_id = ${a.userId} AND image_id = ${op.image_id}`;
        if (!candidate) throw new OperationError("invalid_ai_request");
        const [existing] = await tx`SELECT id FROM user_atlas_items WHERE user_id = ${a.userId}
          AND image_id = ${op.image_id} AND deleted_at IS NULL LIMIT 1`;
        if (!existing) await capacityAvailable(scope, a, limit, op.id);
        const itemId = existing?.id ?? randomUUID();
        const glossLanguage = op.input.glossLanguage as "en" | "ja" | null;
        const lemma = correction.lemma ?? candidate.label;
        const zhHant = correction.displayZhHant ?? candidate.zh_hant;
        // A gloss only exists for a cross-language capture; never store one the run did not ask for.
        const gloss = glossLanguage ? (correction.displayGloss === undefined ? candidate.gloss : correction.displayGloss) : null;
        const source = lemma === candidate.label && zhHant === candidate.zh_hant && gloss === (glossLanguage ? candidate.gloss : null)
          ? "candidate" : "manual";
        const [item] = existing ? await tx`UPDATE user_atlas_items SET selected_candidate_id = ${candidateId},
          target_language = ${op.input.targetLanguage}, primary_label = ${candidate.label}, lemma = ${lemma},
          display_zh_hant = ${zhHant},
          display_ja = ${glossLanguage === "ja" ? gloss : null},
          display_en = ${glossLanguage === "en" ? gloss : null},
          fine_label = NULL, part_of_speech = NULL, cefr_level = NULL, pronunciation = NULL,
          reading = NULL, reading_segments = NULL, category = NULL, taxonomy_path = '{}',
          definition_target = NULL, definition_zh_hant = NULL, definition_ja = NULL, definition_en = NULL,
          example_target = NULL, example_zh_hant = NULL, note_zh_hant = NULL,
          enrichment = '{}'::jsonb, backfill_status = 'pending', backfill_error = NULL,
          backfill_attempts = 0, backfill_attempts_version = 0,
          correction_source = ${source}, updated_at = ${scope.now}
          WHERE id = ${itemId} AND user_id = ${a.userId} RETURNING *` :
          await tx`INSERT INTO user_atlas_items (id, user_id, image_id, selected_candidate_id, target_language,
            primary_label, lemma, display_zh_hant, display_ja, display_en, correction_source)
            VALUES (${itemId}, ${a.userId}, ${op.image_id}, ${candidateId}, ${op.input.targetLanguage},
              ${candidate.label}, ${lemma}, ${zhHant},
              ${glossLanguage === "ja" ? gloss : null},
              ${glossLanguage === "en" ? gloss : null}, ${source}) RETURNING *`;
        await tx`UPDATE ai_operations SET confirmed_item_id = ${itemId}, confirmed_candidate_id = ${candidateId}, confirmed_lemma = ${lemma},
          fulfillment_state = 'pending', updated_at = ${scope.now} WHERE id = ${op.id}`;
        await tx`INSERT INTO ai_fulfillments (operation_id, state, next_attempt_at, deadline_at, created_at, updated_at)
          VALUES (${op.id}, 'pending', ${scope.now}, ${dateAfter(scope.now, 24 * 60 * 60_000)}, ${scope.now}, ${scope.now})`;
        await tx`DELETE FROM atlas_capacity_reservations WHERE operation_id = ${op.id}`;
        await tx`UPDATE user_atlas_images SET status = 'confirmed', updated_at = ${scope.now} WHERE id = ${op.image_id}`;
        return { item, operation: await view(scope, { ...op, confirmed_item_id: itemId, confirmed_candidate_id: candidateId, fulfillment_state: "pending" }) };
      });
    },

    async scanWork(environment: CreditAccount["environment"], limit = 10) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new OperationError("invalid_ai_request");
      const now = clock();
      return sql`SELECT id, user_id FROM ai_operations WHERE environment = ${environment}
        AND (state = 'reserved' OR (state = 'running' AND lease_until <= ${now}) OR
          (state = 'reconciling' AND (staged_result IS NOT NULL OR reconcile_until <= ${now})))
        ORDER BY created_at LIMIT ${limit}`;
    },
  };
}

export type AiOperations = ReturnType<typeof createAiOperations>;
