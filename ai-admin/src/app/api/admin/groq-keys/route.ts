import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { resolveAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '...' + key.slice(-4);
  return key.slice(0, 4) + '...' + key.slice(-4);
}

/**
 * GET /api/admin/groq-keys
 * List all active UI-managed Groq API keys (masked).
 */
export async function GET(req: Request) {
  try {
    try {
      await resolveAdmin(req);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: keys, error } = await (db as any)
      .from('ai_groq_keys')
      .select('id, label, masked_key, is_active, source, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ keys: [], notice: 'Table ai_groq_keys not created yet' });
      }
      console.error('[GroqKeysRoute] GET error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch keys' }, { status: 500 });
    }

    return NextResponse.json({ keys: keys || [] });
  } catch (err: any) {
    console.error('[GroqKeysRoute] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/groq-keys
 * Add a new Groq API key.
 * Body: { key: string, label?: string }
 */
export async function POST(req: Request) {
  try {
    try {
      await resolveAdmin(req);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { key, label } = body;

    if (!key || typeof key !== 'string' || !key.trim()) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    const trimmedKey = key.trim();
    const masked = maskKey(trimmedKey);

    const { data: inserted, error } = await (db as any)
      .from('ai_groq_keys')
      .insert({
        label: label?.trim() || null,
        full_key: trimmedKey,
        masked_key: masked,
        is_active: true,
        source: 'ui',
      })
      .select('id, label, masked_key, is_active, source, created_at')
      .single();

    if (error) {
      console.error('[GroqKeysRoute] POST insert error:', error.message);
      return NextResponse.json({ error: error.message || 'Failed to insert key' }, { status: 500 });
    }

    return NextResponse.json({ success: true, key: inserted });
  } catch (err: any) {
    console.error('[GroqKeysRoute] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/groq-keys
 * Soft-delete a key by setting is_active = false.
 */
export async function DELETE(req: Request) {
  try {
    try {
      await resolveAdmin(req);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');

    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      return NextResponse.json({ error: 'Key ID is required' }, { status: 400 });
    }

    const { error } = await (db as any)
      .from('ai_groq_keys')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[GroqKeysRoute] DELETE error:', error.message);
      return NextResponse.json({ error: 'Failed to delete key' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[GroqKeysRoute] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
