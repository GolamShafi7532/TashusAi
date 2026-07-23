import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { resolveAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/documents/[id]/preview
 * Generates a signed URL to view/download the original PDF document from Supabase Storage.
 *
 * If Supabase returns an InvalidJWT error, the SUPABASE_SERVICE_ROLE_KEY in
 * .env.local does not match the project's actual JWT secret.
 * Fix: copy the real key from Supabase Dashboard → Settings → API.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // 1. Authenticate the admin (dev bypass included via resolveAdmin)
    try {
      await resolveAdmin(req);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch document record
    const { data: document, error: docErr } = await db
      .from('ai_documents')
      .select('storage_path, title')
      .eq('id', id)
      .limit(1)
      .single() as any;

    if (docErr || !document) {
      console.error('[DocPreviewRoute] Document not found:', docErr?.message);
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // 3. Create signed URL from Supabase Storage (valid for 1 hour)
    const { data, error: storageErr } = await (db as any).storage
      .from('ai-documents')
      .createSignedUrl(document.storage_path, 3600) as any;

    if (storageErr || !data?.signedUrl) {
      const errMsg = storageErr?.message ?? 'Unknown storage error';
      console.error('[DocPreviewRoute] Signed URL creation failed:', errMsg);

      // Specific guidance for the common JWT misconfiguration
      if (errMsg.includes('InvalidJWT') || errMsg.includes('exp') || errMsg.includes('JWT')) {
        console.error(
          '[DocPreviewRoute] ⚠️  InvalidJWT: The SUPABASE_SERVICE_ROLE_KEY in .env.local is invalid.\n' +
          '  → Go to: Supabase Dashboard → Project → Settings → API → service_role key\n' +
          '  → Copy the REAL key and update both ai-backend/.env.local and ai-admin/.env.local'
        );
        return NextResponse.json({
          error: 'Storage configuration error',
          hint: 'The SUPABASE_SERVICE_ROLE_KEY needs to be the real key from Supabase Dashboard → Settings → API (project: rdasrmihlrgpthbtoele)',
        }, { status: 503 });
      }

      return NextResponse.json({ error: 'Failed to generate preview URL', detail: errMsg }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl, title: document.title });
  } catch (err: any) {
    console.error('[DocPreviewRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
