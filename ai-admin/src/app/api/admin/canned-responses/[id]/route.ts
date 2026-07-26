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
 * GET /api/admin/canned-responses/[id]
 * Get a single canned response by ID
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;
    const { data: response, error } = await (db.from('ai_canned_responses') as any)
      .select('*')
      .eq('id', id)
      .single();

    if (error || !response) {
      return NextResponse.json({ error: 'Response not found' }, { status: 404 });
    }

    return NextResponse.json({ response });
  } catch (err: any) {
    console.error('[CannedResponseRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/canned-responses/[id]
 * Update a canned response
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;
    const body = await req.json().catch(() => ({}));

    const allowed = ['title', 'content', 'shortcut', 'category', 'is_active'];
    const update: Record<string, any> = { updated_by: admin.userId };

    allowed.forEach((k) => {
      if (body[k] !== undefined) {
        update[k] = typeof body[k] === 'string' ? body[k].trim() : body[k];
      }
    });

    if (Object.keys(update).length === 1) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { data: response, error } = await (db.from('ai_canned_responses') as any)
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Shortcut already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ response });
  } catch (err: any) {
    console.error('[CannedResponseRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/canned-responses/[id]
 * Delete a canned response
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;
    const { error } = await (db.from('ai_canned_responses') as any)
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[CannedResponseRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/canned-responses/[id]/use
 * Increment usage count when a canned response is used
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;
    
    // Increment usage_count
    const { data: response, error } = await (db.from('ai_canned_responses') as any)
      .select('usage_count')
      .eq('id', id)
      .single();

    if (error || !response) {
      return NextResponse.json({ error: 'Response not found' }, { status: 404 });
    }

    const { error: updateError } = await (db.from('ai_canned_responses') as any)
      .update({ usage_count: (response.usage_count || 0) + 1 })
      .eq('id', id);

    if (updateError) {
      console.error('[CannedResponseRoute] Usage count error:', updateError);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[CannedResponseRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
