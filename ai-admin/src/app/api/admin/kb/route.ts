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
 * GET /api/admin/kb
 * Lists and filters knowledge base entries.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const tag = url.searchParams.get('tag');
    const active = url.searchParams.get('active');

    const admin = await resolveAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let query = (db.from('ai_knowledge_base') as any).select('*').order('created_at', { ascending: false });

    if (type) {
      query = query.eq('entry_type', type);
    }
    if (tag) {
      query = query.contains('tags', [tag]);
    }
    if (active) {
      query = query.eq('is_active', active === 'true');
    }

    const { data: entries, error } = await query as any;

    if (error) {
      console.error('[KBListRoute] DB Error:', error.message);
      return NextResponse.json({ error: 'Failed to retrieve KB entries' }, { status: 500 });
    }

    return NextResponse.json({ entries });
  } catch (err: any) {
    console.error('[KBListRoute] GET Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/kb
 * Creates a knowledge base entry and synchronously embeds question+answer.
 */
export async function POST(req: Request) {
  try {
    // 1. Authenticate the admin
    const admin = await resolveAdmin(req);
    console.log('[KB POST Auth Debug] Resolved Admin:', admin);

    if (!admin || !admin.userId) {
      return NextResponse.json({ error: 'Unauthorized admin access' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      entry_type = 'faq',
      question,
      answer,
      tags = [],
      priority = 100,
      starts_at = null,
      ends_at = null,
      is_active = true,
    } = body;

    if (!answer || !answer.trim()) {
      return NextResponse.json({ error: 'Answer content is required' }, { status: 400 });
    }

    if (entry_type === 'faq' && (!question || !question.trim())) {
      return NextResponse.json({ error: 'Question is required for FAQ entries' }, { status: 400 });
    }

    // 2. Generate embedding vector synchronously
    let embedding: number[] | null = null;
    try {
      const textToEmbed = question
        ? `Question: ${question.trim()}\nAnswer: ${answer.trim()}`
        : answer.trim();

      embedding = await embedText(textToEmbed);
    } catch (embedErr: any) {
      console.error('[KBRoute] Sync embedding failed:', embedErr.message);
      return NextResponse.json({ error: 'Failed to generate semantic search index' }, { status: 500 });
    }

    // 3. Insert record into database
    const { data: entry, error: insertErr } = await db
      .from('ai_knowledge_base')
      .insert({
        entry_type,
        question: question ? question.trim() : null,
        answer: answer.trim(),
        tags,
        priority: Number(priority),
        embedding,
        is_active,
        starts_at,
        ends_at,
        created_by: admin.userId,
      } as any)
      .select()
      .single() as any;

    if (insertErr || !entry) {
      console.error('[KBRoute] DB Insert failed:', insertErr?.message);
      return NextResponse.json({ error: 'Failed to save knowledge base entry' }, { status: 500 });
    }

    return NextResponse.json({ success: true, entry });
  } catch (err: any) {
    console.error('[KBRoute] POST Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
