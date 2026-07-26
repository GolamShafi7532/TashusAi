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
 * GET /api/admin/canned-responses
 * List all canned responses, optionally filtered by category
 */
export async function GET(req: Request) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(req.url);
    const category = url.searchParams.get('category') || undefined;
    const activeOnly = url.searchParams.get('active') === 'true';

    let query = (db.from('ai_canned_responses') as any)
      .select('*')
      .order('category', { ascending: true })
      .order('title', { ascending: true });

    if (category) query = query.eq('category', category);
    if (activeOnly) query = query.eq('is_active', true);

    const { data: responses, error } = await query;

    if (error) {
      console.error('[CannedResponsesRoute] DB error:', error.message);
      return NextResponse.json({ error: 'Failed to retrieve canned responses' }, { status: 500 });
    }

    return NextResponse.json({ responses: responses ?? [] });
  } catch (err: any) {
    console.error('[CannedResponsesRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/canned-responses
 * Create a new canned response
 */
export async function POST(req: Request) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { title, content, shortcut, category } = body;

    // Validation
    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }

    const insert: any = {
      title: title.trim(),
      content: content.trim(),
      category: category || 'general',
      created_by: admin.userId,
      updated_by: admin.userId,
    };

    if (shortcut) insert.shortcut = shortcut.trim();

    const { data: response, error } = await (db.from('ai_canned_responses') as any)
      .insert(insert)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // unique violation
        return NextResponse.json({ error: 'Shortcut already exists' }, { status: 409 });
      }
      console.error('[CannedResponsesRoute] Insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ response }, { status: 201 });
  } catch (err: any) {
    console.error('[CannedResponsesRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
