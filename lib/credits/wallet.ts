import type postgres from "postgres";
import { replaceLegacyInTransaction } from "./cutover";
import { refundReviewCondition } from "./refund-review";
import { DEFAULT_TIMEZONE, zonedPeriod } from "../timezone";
import {
  assertCreditKey, assertPoints, CREDIT_POLICY, CreditError, userCreditConfig, utcPeriod,
  type CreditConfig, type CreditEnvironment, type CreditSource,
} from "./policy";

type Tx = postgres.TransactionSql;
export interface CreditAccount {
  userId: string;
  environment: CreditEnvironment;
  /**
   * The calendar check-in days follow (lib/timezone.ts) — the same one the
   * request's streak uses. Not part of the account's identity or lock.
   */
  timezone?: string;
}
type Account = CreditAccount;
export interface CreditTransaction {
  sql: Tx;
  now: Date;
  reserve: (key: string, amount: number) => Promise<Reservation>;
  compensate: (key: string) => Promise<void>;
  grant: (grant: { key: string; source: CreditSource; amount: number; expiresAt: Date | null }) => Promise<boolean>;
  record: (kind: "refund" | "refund_reverse", amount: number, reference: string) => Promise<void>;
  reconcileRefunds: () => Promise<void>;
  settle: (key: string, outcome: "commit" | "release") => Promise<{
    operationKey: string; amount: number; state: string; wallet: CreditBalance;
  }>;
}
export interface CreditBalance {
  available: number;
  reserved: number;
  paidAvailable: number;
  giftAvailable: number;
  monthlyAvailable: number;
  checkInAvailable: number;
  /** A decimal string avoids truncating PostgreSQL BIGINT in clients. */
  walletVersion: string;
  environment: CreditEnvironment;
  serverNow: string;
  /** The monthly allowance's calendar. */
  periodTimezone: "UTC";
  /** The check-in calendar, shared with the study streak. */
  checkInTimezone: string;
  nextDailyResetAt: string;
  nextMonthlyResetAt: string;
  benefits: {
    monthlyClaimed: boolean; checkedInToday: boolean; checkInGrantedThisMonth: number; hasLifetime: boolean;
    /** A word-card answer was logged today; check-in requires it. */
    studiedToday: boolean;
  };
  reconciliationRequired: boolean;
}
export interface Reservation {
  operationKey: string; amount: number; state: "reserved" | "committed" | "released";
}

/** All mutations and expiration take the same account row lock, across devices. */
export function createCreditWallet(sql: postgres.Sql, clock: () => Date = () => new Date(), configuration = userCreditConfig) {
  async function locked<T>(account: Account, run: (tx: Tx, now: Date) => Promise<T>): Promise<T> {
    return sql.begin(async tx => {
      await tx`INSERT INTO credit_accounts (user_id, environment)
        VALUES (${account.userId}, ${account.environment}) ON CONFLICT DO NOTHING`;
      await tx`SELECT wallet_version FROM credit_accounts
        WHERE user_id = ${account.userId} AND environment = ${account.environment} FOR UPDATE`;
      const [policy] = await tx`SELECT billing_mode FROM credit_user_policies
        WHERE user_id = ${account.userId} AND environment = ${account.environment}`;
      const now = clock();
      const config = configuration(account.userId);
      if (policy?.billing_mode !== "credits" && !(config.mode === 'live' && config.replaceLegacyEnabled &&
          config.environment === account.environment && await replaceLegacyInTransaction(tx, account, now))) {
        throw new CreditError("credits_not_enrolled");
      }
      await expire(tx, account, now);
      await reconcileRefunds(tx, account, now);
      if (config.mode === "live" && config.monthlyEnabled && config.environment === account.environment) {
        await refreshMonthlyInTransaction(tx, account, now, false);
      }
      return run(tx, now);
    }) as Promise<T>;
  }

  async function record(
    tx: Tx, a: Account, now: Date, kind: string, amount: number, reservedDelta: number, reference: string,
  ) {
    const [account] = await tx`UPDATE credit_accounts SET wallet_version = wallet_version + 1
      WHERE user_id = ${a.userId} AND environment = ${a.environment} RETURNING wallet_version`;
    await tx`INSERT INTO credit_ledger
      (user_id, environment, wallet_version, kind, amount, reserved_delta, reference, created_at)
      VALUES (${a.userId}, ${a.environment}, ${account.wallet_version}, ${kind}, ${amount},
        ${reservedDelta}, ${reference}, ${now})`;
  }

  async function expire(tx: Tx, a: Account, now: Date) {
    // Held points remain available only to the original operation. A release
    // after expiry is swept again below, so it cannot restore spendable points.
    const lots = await tx`SELECT id, remaining - reserved AS amount FROM credit_lots
      WHERE user_id = ${a.userId} AND environment = ${a.environment}
        AND expires_at <= ${now} AND remaining > reserved ORDER BY id`;
    for (const lot of lots) {
      await tx`UPDATE credit_lots SET remaining = reserved WHERE id = ${lot.id}`;
      await record(tx, a, now, "expire", -lot.amount, 0, String(lot.id));
    }
  }

  /**
   * Word-card answers only (study_logs), matching what the streak counts —
   * atlas answers are left out there too (see app/api/study/answer/route.ts).
   * Any target language: the reward is per account, not per direction.
   */
  async function studiedOn(tx: Tx, a: Account, now: Date): Promise<boolean> {
    const { dayStart, nextDay } = zonedPeriod(now, a.timezone ?? DEFAULT_TIMEZONE);
    const [row] = await tx`SELECT EXISTS (SELECT 1 FROM study_logs WHERE user_id = ${a.userId}
      AND created_at >= ${dayStart} AND created_at < ${nextDay}) AS studied`;
    return row.studied === true;
  }

  async function balance(tx: Tx, a: Account, now: Date): Promise<CreditBalance> {
    const [restriction] = await tx`SELECT EXISTS (SELECT 1 FROM credit_store_transactions t
      WHERE t.user_id = ${a.userId} AND t.environment = ${a.environment} AND ${refundReviewCondition(tx)}) AS needed`;
    const [totals] = await tx`SELECT
      COALESCE(sum(remaining - reserved) FILTER (WHERE expires_at IS NULL OR expires_at > ${now}), 0) AS available,
      COALESCE(sum(reserved), 0) AS reserved,
      COALESCE(sum(remaining - reserved) FILTER (WHERE source = 'purchase'), 0) AS paid,
      COALESCE(sum(remaining - reserved) FILTER (WHERE source <> 'purchase' AND (expires_at IS NULL OR expires_at > ${now})), 0) AS gift
      ,COALESCE(sum(remaining - reserved) FILTER (WHERE source = 'monthly' AND expires_at > ${now}), 0) AS monthly
      ,COALESCE(sum(remaining - reserved) FILTER (WHERE source = 'check_in' AND (expires_at IS NULL OR expires_at > ${now})), 0) AS check_in
      FROM credit_lots WHERE user_id = ${a.userId} AND environment = ${a.environment}`;
    const [account] = await tx`SELECT wallet_version FROM credit_accounts
      WHERE user_id = ${a.userId} AND environment = ${a.environment}`;
    const values = [totals.available, totals.reserved, totals.paid, totals.gift, totals.monthly, totals.check_in].map(Number);
    if (values.some(n => !Number.isSafeInteger(n) || n < 0)) throw new CreditError("credits_unavailable");
    const { month, nextMonth } = utcPeriod(now);
    const checkInTimezone = a.timezone ?? DEFAULT_TIMEZONE;
    const checkIn = zonedPeriod(now, checkInTimezone);
    const [claims] = await tx`SELECT
      COALESCE(bool_or(kind = 'monthly' AND period = ${month}), false) AS monthly,
      COALESCE(bool_or(kind = 'check_in' AND period = ${checkIn.day}), false) AS daily,
      COALESCE(sum(amount) FILTER (WHERE kind = 'check_in' AND month = ${checkIn.month}), 0) AS check_in_total
      FROM credit_benefit_claims WHERE user_id = ${a.userId} AND environment = ${a.environment}
        AND ((kind = 'monthly' AND month = ${month}) OR (kind = 'check_in' AND month = ${checkIn.month}))`;
    const studiedToday = await studiedOn(tx, a, now);
    const [holding] = await tx`SELECT EXISTS (SELECT 1 FROM user_lifetime_entitlements
      WHERE user_id = ${a.userId} AND revoked_at IS NULL) AS held`;
    return {
      available: values[0], reserved: values[1], paidAvailable: values[2], giftAvailable: values[3],
      monthlyAvailable: values[4], checkInAvailable: values[5],
      walletVersion: String(account.wallet_version), environment: a.environment,
      serverNow: now.toISOString(), periodTimezone: "UTC", checkInTimezone,
      nextDailyResetAt: checkIn.nextDay.toISOString(),
      nextMonthlyResetAt: nextMonth.toISOString(),
      benefits: { monthlyClaimed: claims.monthly, checkedInToday: claims.daily,
        checkInGrantedThisMonth: Number(claims.check_in_total), hasLifetime: holding.held, studiedToday },
      reconciliationRequired: restriction.needed,
    };
  }

  async function grantInTransaction(
    tx: Tx, a: Account, now: Date,
    grant: { key: string; source: CreditSource; amount: number; expiresAt: Date | null },
  ): Promise<boolean> {
    const [existing] = await tx`SELECT issued, source, expires_at FROM credit_lots
      WHERE user_id = ${a.userId} AND environment = ${a.environment} AND grant_key = ${grant.key}`;
    if (existing) {
      if (existing.issued !== grant.amount || existing.source !== grant.source ||
          (existing.expires_at?.getTime() ?? null) !== (grant.expiresAt?.getTime() ?? null)) {
        throw new CreditError("idempotency_conflict");
      }
      return false;
    }
    if (grant.expiresAt && grant.expiresAt <= now) throw new CreditError("invalid_credit_request");
    await tx`INSERT INTO credit_lots
      (user_id, environment, source, grant_key, issued, remaining, expires_at, created_at)
      VALUES (${a.userId}, ${a.environment}, ${grant.source}, ${grant.key}, ${grant.amount},
        ${grant.amount}, ${grant.expiresAt}, ${now})`;
    await record(tx, a, now, "grant", grant.amount, 0, grant.key);
    return true;
  }

  async function refreshMonthlyInTransaction(tx: Tx, a: Account, now: Date, required: boolean) {
    const { month, nextMonth } = utcPeriod(now);
    const [holding] = await tx`SELECT id FROM user_lifetime_entitlements WHERE user_id = ${a.userId} AND revoked_at IS NULL LIMIT 1`;
    if (!holding) {
      if (required) throw new CreditError("benefit_ineligible");
      return { claimed: false, amount: 0, period: month };
    }
    // Reset only monthly allowance. Held points remain bound to their old operation.
    // This also normalizes pre-release lots configured with no monthly expiry.
    const start = new Date(`${month}-01T00:00:00Z`);
    await tx`UPDATE credit_lots SET expires_at = ${start} WHERE user_id = ${a.userId}
      AND environment = ${a.environment} AND source = 'monthly' AND created_at < ${start}
      AND (expires_at IS NULL OR expires_at > ${start})`;
    await expire(tx, a, now);
    const [existing] = await tx`SELECT amount FROM credit_benefit_claims WHERE user_id = ${a.userId}
      AND environment = ${a.environment} AND kind = 'monthly' AND period = ${month}`;
    const key = `benefit:monthly:${month}`;
    if (existing) {
      await tx`UPDATE credit_lots SET expires_at = ${nextMonth} WHERE user_id = ${a.userId}
        AND environment = ${a.environment} AND grant_key = ${key} AND source = 'monthly'
        AND expires_at IS DISTINCT FROM ${nextMonth}`;
      return { claimed: false, amount: existing.amount, period: month };
    }
    await tx`INSERT INTO credit_benefit_claims (user_id, environment, kind, period, month, amount, policy_version, created_at)
      VALUES (${a.userId}, ${a.environment}, 'monthly', ${month}, ${month}, ${CREDIT_POLICY.monthlyGift}, ${CREDIT_POLICY.version}, ${now})`;
    await grantInTransaction(tx, a, now, { key, source: 'monthly', amount: CREDIT_POLICY.monthlyGift, expiresAt: nextMonth });
    return { claimed: true, amount: CREDIT_POLICY.monthlyGift, period: month };
  }

  async function reserveInTransaction(tx: Tx, a: Account, now: Date, operationKey: string, amount: number): Promise<Reservation> {
    assertCreditKey(operationKey);
    assertPoints(amount);
    const [existing] = await tx`SELECT amount, state FROM credit_reservations
      WHERE user_id = ${a.userId} AND environment = ${a.environment} AND operation_key = ${operationKey}`;
    if (existing) {
      if (existing.amount !== amount) throw new CreditError("idempotency_conflict");
      return { operationKey, amount, state: existing.state } as Reservation;
    }
    const wallet = await balance(tx, a, now);
    if (wallet.reconciliationRequired) throw new CreditError("credits_reconciliation_required");
    if (wallet.available < amount) throw new CreditError("insufficient_credits");
    await tx`INSERT INTO credit_reservations (user_id, environment, operation_key, amount, state, created_at)
      VALUES (${a.userId}, ${a.environment}, ${operationKey}, ${amount}, 'reserved', ${now})`;
    const lots = await tx`SELECT id, remaining - reserved AS available FROM credit_lots
      WHERE user_id = ${a.userId} AND environment = ${a.environment} AND remaining > reserved
        AND (expires_at IS NULL OR expires_at > ${now})
      ORDER BY (source = 'purchase'), expires_at ASC NULLS LAST, created_at, id`;
    let remaining = amount;
    for (const lot of lots) {
      const allocated = Math.min(remaining, lot.available);
      await tx`UPDATE credit_lots SET reserved = reserved + ${allocated} WHERE id = ${lot.id}`;
      await tx`INSERT INTO credit_operation_allocations (user_id, environment, operation_key, lot_id, amount)
        VALUES (${a.userId}, ${a.environment}, ${operationKey}, ${lot.id}, ${allocated})`;
      remaining -= allocated;
      if (!remaining) break;
    }
    if (remaining) throw new CreditError("credits_unavailable");
    await record(tx, a, now, "reserve", 0, amount, operationKey);
    return { operationKey, amount, state: "reserved" } as Reservation;
  }

  async function settleInTransaction(tx: Tx, a: Account, now: Date, operationKey: string, outcome: "commit" | "release") {
    assertCreditKey(operationKey);
    if (outcome !== "commit" && outcome !== "release") throw new CreditError("invalid_credit_request");
    const [reservation] = await tx`SELECT amount, state FROM credit_reservations
      WHERE user_id = ${a.userId} AND environment = ${a.environment} AND operation_key = ${operationKey}`;
    if (!reservation) throw new CreditError("reservation_not_found");
    const state = outcome === "commit" ? "committed" : "released";
    if (reservation.state !== "reserved" && reservation.state !== state) {
      throw new CreditError("reservation_already_settled");
    }
    if (reservation.state === "reserved") {
      const allocations = await tx`SELECT lot_id, amount FROM credit_operation_allocations
        WHERE user_id = ${a.userId} AND environment = ${a.environment} AND operation_key = ${operationKey}`;
      if (outcome === "commit") {
        const [restricted] = await tx`SELECT EXISTS (SELECT 1 FROM credit_store_transactions
          WHERE user_id = ${a.userId} AND environment = ${a.environment}
            AND lot_id = ANY(${allocations.map(row => row.lot_id)}) AND refund_points > withdrawn_points) AS blocked`;
        if (restricted.blocked) throw new CreditError("credits_reconciliation_required");
      }
      for (const allocation of allocations) {
        const spent = outcome === "commit" ? allocation.amount : 0;
        await tx`UPDATE credit_lots SET reserved = reserved - ${allocation.amount}, remaining = remaining - ${spent}
          WHERE id = ${allocation.lot_id}`;
      }
      await tx`UPDATE credit_reservations SET state = ${state}, settled_at = ${now}
        WHERE user_id = ${a.userId} AND environment = ${a.environment} AND operation_key = ${operationKey}`;
      await record(tx, a, now, outcome, outcome === "commit" ? -reservation.amount : 0, -reservation.amount, operationKey);
      await expire(tx, a, now);
      await reconcileRefunds(tx, a, now);
    }
    return { operationKey, amount: reservation.amount, state, wallet: await balance(tx, a, now) };
  }


  async function reconcileRefunds(tx: Tx, a: Account, now: Date) {
    const rows = await tx`SELECT t.*, l.remaining, l.reserved FROM credit_store_transactions t
      JOIN credit_lots l ON l.id = t.lot_id WHERE t.user_id = ${a.userId} AND t.environment = ${a.environment}
        AND t.refund_points > t.withdrawn_points ORDER BY l.id`;
    for (const row of rows) {
      const withdrawn = Math.min(row.refund_points - row.withdrawn_points, row.remaining - row.reserved);
      const total = row.withdrawn_points + withdrawn;
      if (withdrawn) {
        await tx`UPDATE credit_lots SET remaining = remaining - ${withdrawn} WHERE id = ${row.lot_id}`;
        await record(tx, a, now, "refund", -withdrawn, 0, `apple:${row.transaction_id}`);
      }
      await tx`UPDATE credit_store_transactions SET withdrawn_points = ${total},
        consumed_points = ${Math.max(0, row.refund_points - total - row.reserved)}
        WHERE environment = ${a.environment} AND transaction_id = ${row.transaction_id}`;
    }
  }

  async function compensateInTransaction(tx: Tx, a: Account, now: Date, key: string) {
    assertCreditKey(key);
    const [reservation] = await tx`SELECT amount, state FROM credit_reservations
      WHERE user_id = ${a.userId} AND environment = ${a.environment} AND operation_key = ${key}`;
    if (!reservation || reservation.state !== 'committed') throw new CreditError("reservation_already_settled");
    const inserted = await tx`INSERT INTO credit_compensations (user_id, environment, operation_key, amount, created_at)
      VALUES (${a.userId}, ${a.environment}, ${key}, ${reservation.amount}, ${now}) ON CONFLICT DO NOTHING RETURNING amount`;
    if (!inserted.length) return;
    const allocations = await tx`SELECT lot_id, amount FROM credit_operation_allocations
      WHERE user_id = ${a.userId} AND environment = ${a.environment} AND operation_key = ${key}`;
    for (const allocation of allocations) {
      await tx`UPDATE credit_lots SET remaining = remaining + ${allocation.amount} WHERE id = ${allocation.lot_id}`;
    }
    await record(tx, a, now, "compensate", reservation.amount, 0, key);
    // Restore original sources and expiry; an expired gift never becomes paid points.
    await expire(tx, a, now);
    await reconcileRefunds(tx, a, now);
  }

  return {
    readWallet(a: Account) {
      return locked(a, (tx, now) => balance(tx, a, now));
    },

    /** Internal primitive. The purchase adapter must verify Apple before using it. */
    grant(a: Account, grant: { key: string; source: CreditSource; amount: number; expiresAt: Date | null }) {
      assertCreditKey(grant.key);
      assertPoints(grant.amount);
      if (!["monthly", "check_in", "purchase", "adjustment"].includes(grant.source) ||
          (grant.source === "purchase" && grant.expiresAt !== null) ||
          (grant.expiresAt !== null && !Number.isFinite(grant.expiresAt.getTime()))) {
        throw new CreditError("invalid_credit_request");
      }
      return locked(a, async (tx, now) => {
        const granted = await grantInTransaction(tx, a, now, grant);
        return { granted, wallet: await balance(tx, a, now) };
      });
    },

    claimBenefit(a: Account, kind: "monthly" | "check_in", config: CreditConfig) {
      if (config.mode !== "live") throw new CreditError("credits_disabled");
      if (a.environment !== config.environment) throw new CreditError("invalid_credit_configuration");
      if (kind === "monthly" ? !config.monthlyEnabled : !config.checkInEnabled) {
        throw new CreditError("benefit_disabled");
      }
      return locked(a, async (tx, now) => {
        if (kind === "monthly") {
          const result = await refreshMonthlyInTransaction(tx, a, now, true);
          return { ...result, wallet: await balance(tx, a, now) };
        }
        const { day, month } = zonedPeriod(now, a.timezone ?? DEFAULT_TIMEZONE);
        const period = day;
        const [existing] = await tx`SELECT amount FROM credit_benefit_claims
          WHERE user_id = ${a.userId} AND environment = ${a.environment}
            AND kind = ${kind} AND period = ${period}`;
        if (existing) return { claimed: false, amount: existing.amount, period, wallet: await balance(tx, a, now) };
        // Both benefits require a live permanent holding and explicit enrollment.
        const [holding] = await tx`SELECT id FROM user_lifetime_entitlements
          WHERE user_id = ${a.userId} AND revoked_at IS NULL LIMIT 1`;
        if (!holding) throw new CreditError("benefit_ineligible");
        // Studying is the check-in; the claim only collects its points.
        if (!await studiedOn(tx, a, now)) throw new CreditError("check_in_requires_study");
        const [total] = await tx`SELECT COALESCE(sum(amount), 0) AS amount FROM credit_benefit_claims
          WHERE user_id = ${a.userId} AND environment = ${a.environment} AND kind = 'check_in' AND month = ${month}`;
        const amount = Math.max(0, Math.min(CREDIT_POLICY.checkInDaily, CREDIT_POLICY.checkInMonthlyCap - Number(total.amount)));
        const expiresAt = null;
        await tx`INSERT INTO credit_benefit_claims
          (user_id, environment, kind, period, month, amount, policy_version, created_at)
          VALUES (${a.userId}, ${a.environment}, ${kind}, ${period}, ${month}, ${amount}, ${CREDIT_POLICY.version}, ${now})`;
        if (amount) await grantInTransaction(tx, a, now, { key: `benefit:${kind}:${period}`, source: kind, amount, expiresAt });
        else await record(tx, a, now, "grant", 0, 0, `benefit:${kind}:${period}`);
        return { claimed: true, amount, period, wallet: await balance(tx, a, now) };
      });
    },

    /** Run domain writes and point changes atomically under the account lock. */
    transact<T>(a: Account, run: (scope: CreditTransaction) => Promise<T>): Promise<T> {
      return locked(a, (tx, now) => run({
        sql: tx, now,
        reserve: (key, amount) => reserveInTransaction(tx, a, now, key, amount),
        settle: (key, outcome) => settleInTransaction(tx, a, now, key, outcome),
        compensate: key => compensateInTransaction(tx, a, now, key),
        grant: grant => {
          assertCreditKey(grant.key); assertPoints(grant.amount);
          if (!["monthly", "check_in", "purchase", "adjustment"].includes(grant.source) ||
              (grant.source === "purchase" && grant.expiresAt !== null) ||
              (grant.expiresAt !== null && (!Number.isFinite(grant.expiresAt.getTime()) || grant.expiresAt <= now))) {
            throw new CreditError("invalid_credit_request");
          }
          return grantInTransaction(tx, a, now, grant);
        },
        record: (kind, amount, reference) => record(tx, a, now, kind, amount, 0, reference),
        reconcileRefunds: () => reconcileRefunds(tx, a, now),
      }));
    },

    reserve(a: Account, operationKey: string, amount: number) {
      return locked(a, (tx, now) => reserveInTransaction(tx, a, now, operationKey, amount));
    },

    settle(a: Account, operationKey: string, outcome: "commit" | "release") {
      return locked(a, (tx, now) => settleInTransaction(tx, a, now, operationKey, outcome));
    },

    readLedger(a: Account, cursor?: string) {
      if (cursor !== undefined && (!/^[1-9]\d{0,18}$/.test(cursor) || BigInt(cursor) > 9_223_372_036_854_775_807n)) {
        throw new CreditError("invalid_credit_request");
      }
      return locked(a, async (tx, now) => {
        const rows = await tx`SELECT id::text, wallet_version::text, kind, amount, reserved_delta, reference, created_at
          FROM credit_ledger WHERE user_id = ${a.userId} AND environment = ${a.environment}
            AND (${cursor ?? null}::bigint IS NULL OR id < ${cursor ?? null}::bigint)
          ORDER BY credit_ledger.id DESC LIMIT 51`;
        return {
          entries: rows.slice(0, 50).map(row => ({
            id: row.id, walletVersion: row.wallet_version, kind: row.kind, amount: row.amount,
            reservedDelta: row.reserved_delta, reference: row.reference, createdAt: row.created_at.toISOString(),
          })),
          nextCursor: rows.length > 50 ? rows[49].id as string : null,
          wallet: await balance(tx, a, now),
        };
      });
    },
    /** Scheduler candidate scan; no missed-month backfill and no client claim required. */
    monthlyAccounts(config: CreditConfig, limit = 100, excludedUserIds: string[] = []) {
      if (config.mode !== 'live' || !config.monthlyEnabled) throw new CreditError('benefit_disabled');
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new CreditError('invalid_credit_request');
      if (excludedUserIds.length > 20 || excludedUserIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw new CreditError('invalid_credit_request');
      const { month } = utcPeriod(clock());
      return sql`SELECT DISTINCT l.user_id FROM user_lifetime_entitlements l
        LEFT JOIN credit_user_policies p ON p.user_id = l.user_id AND p.environment = ${config.environment}
        WHERE l.revoked_at IS NULL AND NOT (l.user_id = ANY(${excludedUserIds}::uuid[]))
        AND (p.billing_mode = 'credits' OR ${config.replaceLegacyEnabled})
        AND NOT EXISTS (SELECT 1 FROM credit_benefit_claims b WHERE b.user_id = l.user_id
          AND b.environment = ${config.environment} AND b.kind = 'monthly' AND b.period = ${month})
        ORDER BY l.user_id LIMIT ${limit}`;
    },
  };
}
