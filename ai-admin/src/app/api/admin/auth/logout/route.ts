import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import * as crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/auth/logout
 * Revokes the session in DB and clears JWT cookies.
 */
export async function POST(req: Request) {
  try {
    const refreshToken = req.headers.get('cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('admin_refresh_token='))
      ?.split('=')[1];

    if (refreshToken) {
      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      // Delete session from DB
      await (db.from('ai_admin_sessions') as any).delete().eq('refresh_token_hash', refreshTokenHash);
    }

    const response = NextResponse.json({ success: true });

    // Clear access token cookie
    response.cookies.set('admin_access_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    // Clear refresh token cookie
    response.cookies.set('admin_refresh_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (err: any) {
    console.error('[LogoutRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
