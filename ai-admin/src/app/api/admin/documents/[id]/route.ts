import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { verifyJwt } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/admin/documents/[id]
 * Soft delete a document: mark is_active=false and remove its RAG chunks immediately.
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // 1. Authenticate the admin
    const token = req.headers.get('cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('admin_access_token='))
      ?.split('=')[1];

    const admin = token ? await verifyJwt(token) : null;
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Set is_active = false
    const { error: docErr } = await (db.from('ai_documents') as any)
      .update({ is_active: false } as any)
      .eq('id', id);

    if (docErr) {
      console.error('[DocDeleteRoute] Failed to update active flag:', docErr.message);
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
    }

    // 3. Delete chunks immediately so it falls out of RAG index
    const { error: chunksErr } = await (db
      .from('ai_document_chunks' as any) as any)
      .delete()
      .eq('document_id', id);

    if (chunksErr) {
      console.warn('[DocDeleteRoute] Failed to clean up document chunks:', chunksErr.message);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[DocDeleteRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
