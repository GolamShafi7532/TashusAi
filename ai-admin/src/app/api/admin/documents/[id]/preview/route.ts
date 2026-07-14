import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { verifyJwt } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/documents/[id]/preview
 * Generates a signed URL to view/download the original PDF document from Supabase Storage.
 */
export async function GET(
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

    // 2. Fetch document record
    const { data: document, error: docErr } = await db
      .from('ai_documents')
      .select('storage_path')
      .eq('id', id)
      .limit(1)
      .single() as any;

    if (docErr || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // 3. Create signed URL from Supabase Storage (valid for 1 hour)
    const { data, error: storageErr } = await (db as any).storage
      .from('ai-documents')
      .createSignedUrl(document.storage_path, 3600) as any;

    if (storageErr || !data?.signedUrl) {
      console.error('[DocPreviewRoute] Signed URL creation failed:', storageErr?.message);
      return NextResponse.json({ error: 'Failed to generate preview URL' }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (err: any) {
    console.error('[DocPreviewRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
