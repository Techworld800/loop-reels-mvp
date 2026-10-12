import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { parseReel } from '@/lib/reels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getSupabaseAdmin();
  if (!db) {
    console.error('[api/reels] Supabase is not configured: required environment variables are missing.');
    return NextResponse.json({ error: 'Database is not configured yet.' }, { status: 503 });
  }

  const { data, error } = await db
    .from('reels')
    .select('id,platform,url,caption,shared_by,created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    // Log only Supabase's returned error metadata. Never log environment variables or keys.
    console.error('[api/reels] Supabase GET failed', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json({ error: 'Could not load feed.' }, { status: 500 });
  }

  return NextResponse.json({ reels: data });
}

export async function POST(req: NextRequest) {
  const db = getSupabaseAdmin();
  if (!db) {
    console.error('[api/reels] Supabase is not configured: required environment variables are missing.');
    return NextResponse.json({ error: 'Database is not configured yet.' }, { status: 503 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = parseReel(String(body.url || ''));
  if (!parsed) return NextResponse.json({ error: 'Enter a valid reel URL.' }, { status: 400 });

  const caption = String(body.caption || '').trim().slice(0, 180);
  const shared_by = String(body.shared_by || 'A friend').trim().slice(0, 40) || 'A friend';

  const { data, error } = await db
    .from('reels')
    .insert({ platform: parsed.platform, url: parsed.url, caption, shared_by })
    .select('id,platform,url,caption,shared_by,created_at')
    .single();

  if (error) {
    console.error('[api/reels] Supabase POST failed', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json({ error: 'Could not save this reel.' }, { status: 500 });
  }

  return NextResponse.json({ reel: data }, { status: 201 });
}
