import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { verifyPassword, signAccessToken, signRefreshToken } from '@/lib/auth';
import * as crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/auth/login
 * Authenticates admin email + password, writes sessions to DB, and sets JWT cookies.
 */
export async function POST(req: Request) {
  try {
    const { email, password } = await req.json().catch(() => ({}));

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    // 1. Fetch user from DB
    const { data: user, error: userErr } = await db
      .from('ai_admin_users')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .limit(1)
      .single() as any;

    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // 2. Verify password hash
    const isCorrect = await verifyPassword(password, user.password_hash);
    if (!isCorrect) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // 3. Update last login
    await (db.from('ai_admin_users') as any)
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    // 4. Sign JWTs
    const accessTokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      displayName: user.display_name,
    };

    const accessToken = await signAccessToken(accessTokenPayload);
    const refreshToken = await signRefreshToken({ userId: user.id });

    // Hash refresh token for DB storage
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // 5. Store session in DB
    const userAgent = req.headers.get('user-agent');
    const ipAddress = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

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
      console.error('[LoginRoute] Session insertion failed:', sessionErr.message);
      return NextResponse.json({ error: 'Internal server login error' }, { status: 500 });
    }

    // 6. Build response with cookies
    const response = NextResponse.json({
      success: true,
      user: {
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
    });

    // Set httpOnly access token cookie (15m)
    response.cookies.set('admin_access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60, // 15 minutes
    });

    // Set httpOnly refresh token cookie (7d)
    response.cookies.set('admin_refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err: any) {
    console.error('[LoginRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
