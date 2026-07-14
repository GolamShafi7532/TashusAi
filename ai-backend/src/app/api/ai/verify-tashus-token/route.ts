import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { env } from '@/lib/env';
import * as jose from 'jose';

type VerifyBody = {
  token: string;
  sessionId: string;
};

/**
 * POST /api/ai/verify-tashus-token
 * Read-only verification of a passed-through Tashus JWT.
 * Extracts userId/role and associates them with the session,
 * but never stores the raw token.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Partial<VerifyBody>;
  const token = body.token;
  const sessionId = body.sessionId;

  if (!token || !sessionId) {
    return NextResponse.json({ error: 'token and sessionId required' }, { status: 400 });
  }

  try {
    let userId: string | null = null;
    let role: 'guest' | 'host' | null = null;

    if (env.TASHUS_JWT_JWKS_URL) {
      // ── Verify using JWKS ──────────────────────────────────────────────────
      const JWKS = jose.createRemoteJWKSet(new URL(env.TASHUS_JWT_JWKS_URL));
      const { payload } = await jose.jwtVerify(token, JWKS);
      
      userId = payload.sub || (payload.userId as string) || null;
      role = (payload.role as 'guest' | 'host') || null;
    } else {
      // ── Fallback/Development mode: decode without validation ────────────────
      const decoded = jose.decodeJwt(token);
      userId = decoded.sub || (decoded.userId as string) || null;
      role = (decoded.role as 'guest' | 'host') || null;
      
      console.warn('[VerifyTokenRoute] TASHUS_JWT_JWKS_URL is not set. Decoding token without signature verification.');
    }

    if (!userId) {
      return NextResponse.json({ error: 'Invalid token payload: missing identifier' }, { status: 400 });
    }

    // Update the session in DB
    const { error: updateErr } = await (db.from('ai_chat_sessions') as any)
      .update({
        tashus_user_id: userId,
        tashus_user_role: role,
      } as any)
      .eq('id', sessionId);

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to update session information' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, userId, role });
  } catch (err: any) {
    console.error('[VerifyTokenRoute] Verification failed:', err.message);
    return NextResponse.json({ error: 'Token verification failed' }, { status: 401 });
  }
}
