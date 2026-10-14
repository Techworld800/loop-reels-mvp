import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { REACTIONS } from '@/lib/reactions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Adds or removes one reaction from one device on one reel.
export async function POST(req: NextRequest) {
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Database is not configured yet.' }, { status: 503 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const reel_id = String(body?.reel_id || '');
  const emoji = String(body?.emoji || '');
  const device_id = String(body?.device_id || '');
  const on = body?.on !== false;

  if (!UUID.test(reel_id) || !(REACTIONS as readonly string[]).includes(emoji) || device_id.length < 8 || device_id.length > 64) {
    return NextResponse.json({ error: 'Invalid reaction.' }, { status: 400 });
  }

  const { error } = on
    ? await db
        .from('reactions')
        .upsert({ reel_id, device_id, emoji }, { onConflict: 'reel_id,device_id,emoji', ignoreDuplicates: true })
    : await db.from('reactions').delete().eq('reel_id', reel_id).eq('device_id', device_id).eq('emoji', emoji);

  if (error) {
    console.error('[api/reactions] failed', { code: error.code, message: error.message });
    // 23503 = the reel no longer exists
    return NextResponse.json({ error: 'Could not save reaction.' }, { status: error.code === '23503' ? 404 : 500 });
  }
  return NextResponse.json({ ok: true });
}
