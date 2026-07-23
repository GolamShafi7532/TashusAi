import { NextResponse } from 'next/server';
import { db, isLocalDevMode } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function resolveAdmin(req: Request) {
  if (isLocalDevMode()) {
    return { userId: 'local-dev-admin', email: 'dev@local', role: 'super_admin', displayName: 'Dev Admin' };
  }
  return getAdminFromRequest(req);
}

/**
 * GET /api/admin/session-tags
 * List all available tags for admin use
 */
export async function GET(req: Request) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: tags, error } = await (db.from('ai_session_tags') as any)
      .select('*')
      .eq('is_active', true)
      .order('usage_count', { ascending: false })
      .order('name', { ascending: true });

    if (error) {
      console.error('[SessionTagsRoute] DB error:', error.message);
      return NextResponse.json({ error: 'Failed to retrieve tags' }, { status: 500 });
    }

    return NextResponse.json({ tags: tags ?? [] });
  } catch (err: any) {
    console.error('[SessionTagsRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/session-tags
 * Create a new tag
 */
export async function POST(req: Request) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { name, color, description } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
    }

    const { data: tag, error } = await (db.from('ai_session_tags') as any)
      .insert({
        name: name.trim().toLowerCase().replace(/\s+/g, '-'),
        color: color || '#6b7280',
        description: description?.trim() || null,
        created_by: admin.userId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Tag already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tag }, { status: 201 });
  } catch (err: any) {
    console.error('[SessionTagsRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
