import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { verifyJwt, signAccessToken, signRefreshToken } from '@/lib/auth';
import * as crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/auth/refresh
 * Rotates the refresh token and issues a new access token if the refresh token is valid and exists in DB.
 */
export async function POST(req: Request) {
  try {
    const refreshToken = req.headers.get('cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('admin_refresh_token='))
      ?.split('=')[1];

    if (!refreshToken) {
      return NextResponse.json({ error: 'Refresh token missing' }, { status: 401 });
    }

    // 1. Verify JWT payload
    const decoded = await verifyJwt(refreshToken);
    if (!decoded || !decoded.userId) {
      return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 });
    }

    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // 2. Query session in DB
    const { data: session, error: sessionErr } = await (db
      .from('ai_admin_sessions') as any)
      .select('*')
      .eq('refresh_token_hash', refreshTokenHash)
      .eq('admin_user_id', decoded.userId)
      .limit(1)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session expired or revoked' }, { status: 401 });
    }

    // Check expiration time
    if (new Date(session.expires_at) < new Date()) {
      // Cleanup expired session
      await (db.from('ai_admin_sessions') as any).delete().eq('id', session.id);
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }

    // 3. Fetch user details
    const { data: user, error: userErr } = await (db
      .from('ai_admin_users') as any)
      .select('*')
      .eq('id', decoded.userId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (userErr || !user) {
      return NextResponse.json({ error: 'User inactive or not found' }, { status: 401 });
    }

    // 4. Generate new tokens (Rotation)
    const accessTokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      displayName: user.display_name,
    };

    const newAccessToken = await signAccessToken(accessTokenPayload);
    const newRefreshToken = await signRefreshToken({ userId: user.id });
    const newRefreshTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

    // 5. Update session in DB
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: updateErr } = await (db.from('ai_admin_sessions') as any)
      .update({
        refresh_token_hash: newRefreshTokenHash,
        expires_at: newExpiresAt,
      } as any)
      .eq('id', session.id);

    if (updateErr) {
      console.error('[RefreshRoute] Failed to rotate session in DB:', updateErr.message);
      return NextResponse.json({ error: 'Internal rotation error' }, { status: 500 });
    }

    // 6. Build response with rotated cookies
    const response = NextResponse.json({
      success: true,
      user: {
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
    });

    response.cookies.set('admin_access_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60, // 15 minutes
    });

    response.cookies.set('admin_refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err: any) {
    console.error('[RefreshRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
