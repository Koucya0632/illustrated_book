import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/auth';
import { getSql } from '@/lib/db';
import { runTargetDiagnostic, type TargetDiagnosticSql } from '@/lib/database-target-diagnostic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;
const headers = { 'Cache-Control': 'private, no-store', 'Vercel-CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function POST() {
  const result = await runTargetDiagnostic({
    now: Date.now, production: process.env.VERCEL_ENV === 'production',
    from: process.env.DATABASE_TARGET_DIAGNOSTIC_FROM_MS,
    until: process.env.DATABASE_TARGET_DIAGNOSTIC_UNTIL_MS,
    ref: process.env.DATABASE_TARGET_DIAGNOSTIC_REF,
    expectedDigest: process.env.DATABASE_TARGET_DIAGNOSTIC_IDENTITY_SHA256,
    authorized: async () => verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value),
    sql: () => getSql() as unknown as TargetDiagnosticSql | null,
  });
  return result ? NextResponse.json(result, { headers }) : NextResponse.json({ error: 'not found' }, { status: 404, headers });
}
