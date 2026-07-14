import { NextResponse } from 'next/server';
import { db, isLocalDevMode } from '@/lib/supabase';
import { verifyJwt } from '@/lib/auth';
import { embedText } from '@/lib/embeddings';

async function resolveAdmin(req: Request) {
  if (isLocalDevMode()) {
    return { userId: 'local-dev-admin', email: 'dev@local', role: 'super_admin', displayName: 'Dev Admin' };
  }
  const token = req.headers.get('cookie')
    ?.split(';')
    .find((c) => c.trim().startsWith('admin_access_token='))
    ?.split('=')[1];
  return token ? await verifyJwt(token) : null;
}

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/kb/[id]
 * Updates a Knowledge Base entry, re-indexing semantic embeddings synchronously if text fields change.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // 1. Authenticate the admin
    const admin = await resolveAdmin(req);
    if (!admin || !admin.userId) {
      return NextResponse.json({ error: 'Unauthorized admin access' }, { status: 401 });
    }

    // 2. Fetch existing entry
    const { data: existing, error: fetchErr } = await db
      .from('ai_knowledge_base')
      .select('*')
      .eq('id', id)
      .limit(1)
      .single() as any;

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Knowledge Base entry not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      entry_type,
      question,
      answer,
      tags,
      priority,
      starts_at,
      ends_at,
      is_active,
    } = body;

    const updates: any = {
      updated_by: admin.userId,
      updated_at: new Date().toISOString(),
    };

    if (entry_type !== undefined) updates.entry_type = entry_type;
    if (question !== undefined) updates.question = question ? question.trim() : null;
    if (answer !== undefined) updates.answer = answer.trim();
    if (tags !== undefined) updates.tags = tags;
    if (priority !== undefined) updates.priority = Number(priority);
    if (starts_at !== undefined) updates.starts_at = starts_at;
    if (ends_at !== undefined) updates.ends_at = ends_at;
    if (is_active !== undefined) updates.is_active = is_active;

    // 3. Re-embed if text changed
    const questionChanged = question !== undefined && question !== existing.question;
    const answerChanged = answer !== undefined && answer !== existing.answer;

    if (questionChanged || answerChanged) {
      try {
        const finalQuestion = question !== undefined ? question : existing.question;
        const finalAnswer = answer !== undefined ? answer : existing.answer;

        const textToEmbed = finalQuestion
          ? `Question: ${finalQuestion.trim()}\nAnswer: ${finalAnswer.trim()}`
          : finalAnswer.trim();

        updates.embedding = await embedText(textToEmbed);
      } catch (embedErr: any) {
        console.error('[KBRoute] Semantic re-indexing failed:', embedErr.message);
        return NextResponse.json({ error: 'Failed to update semantic search index' }, { status: 500 });
      }
    }

    // 4. Perform update in DB
    const { data: entry, error: updateErr } = await (db.from('ai_knowledge_base') as any)
      .update(updates)
      .eq('id', id)
      .select()
      .single() as any;

    if (updateErr || !entry) {
      console.error('[KBRoute] DB Update failed:', updateErr?.message);
      return NextResponse.json({ error: 'Failed to update Knowledge Base entry' }, { status: 500 });
    }

    return NextResponse.json({ success: true, entry });
  } catch (err: any) {
    console.error('[KBRoute] PATCH Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/kb/[id]
 * Soft delete a Knowledge Base entry (set is_active=false).
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // 1. Authenticate the admin
    const admin = await resolveAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Perform soft delete
    const { error: deleteErr } = await (db.from('ai_knowledge_base') as any)
      .update({ is_active: false } as any)
      .eq('id', id);

    if (deleteErr) {
      console.error('[KBRoute] DB Soft delete failed:', deleteErr.message);
      return NextResponse.json({ error: 'Failed to delete Knowledge Base entry' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[KBRoute] DELETE Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
