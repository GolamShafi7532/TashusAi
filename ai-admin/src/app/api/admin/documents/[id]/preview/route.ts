import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { resolveAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/documents/[id]/preview
 *
 * Strategy 1: Try Supabase Storage signed URL (works when service role key is valid).
 * Strategy 2: Fall back to downloading the file via the Supabase storage API and
 *             streaming it directly to the browser — bypasses the InvalidJWT issue
 *             entirely because we proxy it server-side.
 * Strategy 3: Return a download link to the backend ingest endpoint as last resort.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    try {
      await resolveAdmin(req);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch document record
    const { data: document, error: docErr } = await (db
      .from('ai_documents') as any)
      .select('storage_path, title, original_filename')
      .eq('id', id)
      .limit(1)
      .single();

    if (docErr || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // 2. Try signed URL first (fastest path)
    try {
      const { data: signedData, error: signedErr } = await (db as any).storage
        .from('ai-documents')
        .createSignedUrl(document.storage_path, 3600);

      if (!signedErr && signedData?.signedUrl) {
        return NextResponse.json({ url: signedData.signedUrl, title: document.title });
      }
    } catch {
      // Fall through to proxy download
    }

    // 3. Signed URL failed — proxy the file directly from Supabase storage
    //    This avoids exposing any JWT to the browser and bypasses the exp error
    try {
      const { data: fileData, error: downloadErr } = await (db as any).storage
        .from('ai-documents')
        .download(document.storage_path);

      if (!downloadErr && fileData) {
        const buffer = await fileData.arrayBuffer();
        const filename = document.original_filename || document.title || 'document.pdf';
        return new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${filename}"`,
            'Cache-Control': 'private, max-age=3600',
          },
        });
      }
    } catch (proxyErr: any) {
      console.error('[DocPreviewRoute] Proxy download failed:', proxyErr?.message);
    }

    // 4. Last resort — return a direct Supabase public URL if bucket is public
    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
    if (supabaseUrl) {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/ai-documents/${document.storage_path}`;
      return NextResponse.json({ url: publicUrl, title: document.title });
    }

    return NextResponse.json(
      { error: 'Unable to generate preview URL. Please check your Supabase configuration.' },
      { status: 503 }
    );

  } catch (err: any) {
    console.error('[DocPreviewRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
