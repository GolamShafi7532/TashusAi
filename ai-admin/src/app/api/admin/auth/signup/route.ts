import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { hashPassword, signAccessToken, signRefreshToken } from '@/lib/auth';
import * as crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/auth/signup
 * Creates a new AI admin account and immediately signs the user in.
 */
export async function POST(req: Request) {
  try {
    const { email, password, displayName } = await req.json().catch(() => ({}));

    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const normalizedDisplayName = String(displayName ?? '').trim();

    if (!normalizedEmail || !password || !normalizedDisplayName) {
      return NextResponse.json({ error: 'Email, password, and display name are required' }, { status: 400 });
    }

    if (String(password).length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long' }, { status: 400 });
    }

    const { data: existingUser, error: lookupErr } = await db
      .from('ai_admin_users')
      .select('id')
      .eq('email', normalizedEmail)
      .limit(1)
      .maybeSingle() as any;

    if (lookupErr) {
      console.error('[SignupRoute] Lookup failed:', lookupErr.message);
      return NextResponse.json({ error: 'Unable to create account right now' }, { status: 500 });
    }

    if (existingUser) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    const passwordHash = await hashPassword(String(password));

    const { data: user, error: insertErr } = await db
      .from('ai_admin_users')
      .insert({
        email: normalizedEmail,
        password_hash: passwordHash,
        display_name: normalizedDisplayName,
        role: 'admin',
        is_active: true,
      } as any)
      .select('*')
      .single() as any;

    if (insertErr || !user) {
      console.error('[SignupRoute] Insert failed:', insertErr?.message);
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }

    await (db.from('ai_admin_users') as any)
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    const accessTokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      displayName: user.display_name,
    };

    const accessToken = await signAccessToken(accessTokenPayload);
    const refreshToken = await signRefreshToken({ userId: user.id });
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const userAgent = req.headers.get('user-agent');
    const ipAddress = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: sessionErr } = await db
      .from('ai_admin_sessions')
      .insert({
        admin_user_id: user.id,
        refresh_token_hash: refreshTokenHash,
        user_agent: userAgent,
        ip_address: ipAddress as any,
        expires_at: expiresAt,
      } as any);

    if (sessionErr) {
      console.error('[SignupRoute] Session insertion failed:', sessionErr.message);
      return NextResponse.json({ error: 'Account created but sign-in failed' }, { status: 500 });
    }

    const response = NextResponse.json({
      success: true,
      user: {
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
    });

    response.cookies.set('admin_access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60,
    });

    response.cookies.set('admin_refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (err: any) {
    console.error('[SignupRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
