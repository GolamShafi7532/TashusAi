import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { resolveAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/settings/profile
 * Updates display_name for logged-in admin user.
 * Body: { displayName: string }
 */
export async function PATCH(req: Request) {
  try {
    let admin;
    try {
      admin = await resolveAdmin(req);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { displayName } = await req.json().catch(() => ({}));

    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
    }

    const trimmedName = displayName.trim();

    const { error } = await (db.from('ai_admin_users') as any)
      .update({
        display_name: trimmedName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', admin.userId);

    if (error) {
      console.error('[ProfileSettingsRoute] Update error:', error.message);
      return NextResponse.json({ error: 'Failed to update profile display name' }, { status: 500 });
    }

    return NextResponse.json({ success: true, displayName: trimmedName });
  } catch (err: any) {
    console.error('[ProfileSettingsRoute] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
