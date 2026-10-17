import { createHash } from "node:crypto";
import type postgres from "postgres";
import type { CreditAccount, createCreditWallet } from "../../credits/wallet";
import { createAssistantUsageLog } from "../usage";
import type { AssistantUsage } from "../pricing";
import { GRAMMAR_VERSION, GrammarError, type GrammarInput, type GrammarRecord, type GrammarReply } from "./contracts";

type Wallet = Pick<ReturnType<typeof createCreditWallet>, "transact">;
function record(row: postgres.Row): GrammarRecord {
  return { id: row.request_id, status: row.status, input: row.input, result: row.result,
    charged: row.charged, favorite: row.favorite, createdAt: row.created_at.toISOString(),
    templateVersion: row.template_version, error: row.error };
}
export function fingerprint(input: GrammarInput) {
  // Schema parsing supplies the canonical key order, defaults and trimmed text.
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function createGrammarStore(sql: postgres.Sql, wallet: Wallet, clock: () => Date = () => new Date()) {
  async function read(account: CreditAccount, id: string) {
    // A crashed invocation can never commit after this deadline. No credits are held.
    await sql`UPDATE assistant_grammar_requests SET status = 'failed', error = 'generation_failed'
      WHERE user_id = ${account.userId} AND environment = ${account.environment} AND request_id = ${id}
        AND status = 'pending' AND deadline <= ${clock()}`;
    const [row] = await sql`SELECT * FROM assistant_grammar_requests WHERE user_id = ${account.userId}
      AND environment = ${account.environment} AND request_id = ${id}`;
    return row ? { record: record(row), fingerprint: row.fingerprint as string } : null;
  }
  return {
    read,
    async begin(account: CreditAccount, input: GrammarInput) {
      const now = clock();
      const rows = await sql`INSERT INTO assistant_grammar_requests
        (user_id, environment, request_id, fingerprint, mode, ui_language, learning_direction,
         source_record_id, input, status, template_version, created_at, deadline)
        VALUES (${account.userId}, ${account.environment}, ${input.requestId}, ${fingerprint(input)},
          ${input.mode}, ${input.uiLanguage}, ${input.learningDirection}, ${input.sourceRecordId}, ${sql.json(input)},
          'pending', ${GRAMMAR_VERSION}, ${now}, ${new Date(now.getTime() + 150_000)})
        ON CONFLICT DO NOTHING RETURNING *`;
      if (rows.length) return { claimed: true, record: record(rows[0]) };
      const existing = await read(account, input.requestId);
      if (!existing || existing.fingerprint !== fingerprint(input)) throw new GrammarError("idempotency_conflict", 409);
      return { claimed: false, record: existing.record };
    },
    async complete(account: CreditAccount, input: GrammarInput, result: GrammarReply, points: number, usage: AssistantUsage) {
      return wallet.transact(account, async scope => {
        const tx = scope.sql;
        const [row] = await tx`SELECT * FROM assistant_grammar_requests WHERE user_id = ${account.userId}
          AND environment = ${account.environment} AND request_id = ${input.requestId} FOR UPDATE`;
        if (!row || row.status !== "pending" || row.deadline <= clock()) throw new GrammarError("generation_expired", 409);
        let charged = 0;
        if (result.outcome === "completed") {
          const key = `grammar-${input.mode}:${input.requestId}`;
          await scope.reserve(key, points);
          await scope.settle(key, "commit");
          charged = points;
        }
        const status = result.outcome === "completed" ? "completed" : result.outcome === "clarification" ? "clarification" : "failed";
        const [saved] = await tx`UPDATE assistant_grammar_requests SET status = ${status}, result = ${tx.json(result)},
          charged = ${charged}, error = ${result.outcome === "invalid" ? "invalid_query" : null}
          WHERE user_id = ${account.userId} AND environment = ${account.environment} AND request_id = ${input.requestId}
          RETURNING *`;
        // Bookkeeping shares the result/ledger transaction too: no charged orphan.
        await createAssistantUsageLog(tx)({ account, requestId: input.requestId, feature: "grammar",
          pricingVersion: GRAMMAR_VERSION, inScope: result.outcome === "completed", usage, charged });
        return record(saved);
      });
    },
    async fail(account: CreditAccount, id: string, code: string) {
      await sql`UPDATE assistant_grammar_requests SET status = 'failed', error = ${code}
        WHERE user_id = ${account.userId} AND environment = ${account.environment}
          AND request_id = ${id} AND status = 'pending'`;
    },
    async list(account: CreditAccount, options: { learningDirection: string; favorite: boolean; mode?: string; cursor?: string }) {
      const rows = await sql`SELECT * FROM assistant_grammar_requests r
        WHERE r.user_id = ${account.userId} AND r.environment = ${account.environment}
          AND r.learning_direction = ${options.learningDirection}
          AND r.status = 'completed' AND (${!options.favorite} OR r.favorite)
          AND (${options.mode ?? null}::text IS NULL OR r.mode = ${options.mode ?? null})
          AND (${options.cursor ?? null}::uuid IS NULL OR (r.created_at, r.request_id) <
            (SELECT created_at, request_id FROM assistant_grammar_requests WHERE user_id = ${account.userId}
              AND environment = ${account.environment} AND request_id = ${options.cursor ?? null}::uuid))
        ORDER BY r.created_at DESC, r.request_id DESC LIMIT 31`;
      return { records: rows.slice(0, 30).map(record), nextCursor: rows.length > 30 ? rows[29].request_id as string : null };
    },
    async favorite(account: CreditAccount, id: string, value: boolean) {
      const [row] = await sql`UPDATE assistant_grammar_requests SET favorite = ${value}
        WHERE user_id = ${account.userId} AND environment = ${account.environment} AND request_id = ${id}
          AND status = 'completed' RETURNING *`;
      if (!row) throw new GrammarError("not_found", 404);
      return record(row);
    },
    async delete(account: CreditAccount, id: string) {
      // Retain only a request tombstone to prevent a lost POST resurrecting a deleted purchase.
      const rows = await sql`UPDATE assistant_grammar_requests SET status = 'deleted', input = NULL,
        result = NULL, favorite = false, error = NULL
        WHERE user_id = ${account.userId} AND environment = ${account.environment} AND request_id = ${id}
          AND status <> 'pending' RETURNING request_id`;
      if (!rows.length) throw new GrammarError("not_found_or_pending", 409);
      return { deleted: true };
    },
  };
}
export type GrammarStore = ReturnType<typeof createGrammarStore>;
