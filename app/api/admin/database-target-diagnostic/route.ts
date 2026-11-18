import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/auth';
import { getSql } from '@/lib/db';
import { runTargetDiagnostic, type TargetDiagnosticSql } from '@/lib/database-target-diagnostic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;
const headers = { 'Cache-Control': 'private, no-store', 'Vercel-CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  const result = await runTargetDiagnostic({
    now: Date.now, production: process.env.VERCEL_ENV === 'production',
    activation: authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined,
    key: process.env.DATABASE_TARGET_DIAGNOSTIC_KEY_HEX,
    keyFrom: process.env.DATABASE_TARGET_DIAGNOSTIC_KEY_FROM_MS,
    keyExpires: process.env.DATABASE_TARGET_DIAGNOSTIC_KEY_EXPIRES_MS,
    ref: process.env.DATABASE_TARGET_DIAGNOSTIC_REF,
    expectedDigest: process.env.DATABASE_TARGET_DIAGNOSTIC_IDENTITY_SHA256,
    authorized: async () => verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value),
    sql: () => getSql() as unknown as TargetDiagnosticSql | null,
  });
  return result ? NextResponse.json(result, { headers }) : NextResponse.json({ error: 'not found' }, { status: 404, headers });
}
