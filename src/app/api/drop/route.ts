import { NextRequest, NextResponse } from 'next/server';

const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY!;
const SUPA_BASE = 'https://lzfgigiyqpuuxslsygjt.supabase.co/rest/v1/rpc';

/**
 * Hardened Supabase RPC caller.
 * Fixes memory-trap-26-04-29 #3: previously swallowed pg errors by only
 * calling r.json() without checking r.ok, and checking data.error instead
 * of the actual Supabase error shape { code, message, details, hint }.
 */
async function supaRPC(fn: string, body: object) {
  const r = await fetch(`${SUPA_BASE}/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });

  const data = await r.json();

  if (!r.ok) {
    // Supabase/pg error shape: { code, message, details, hint }
    const pgCode = data?.code ?? 'UNKNOWN';
    const pgMsg  = data?.message ?? data?.error ?? JSON.stringify(data);
    const pgDetail = data?.details ?? data?.hint ?? '';
    throw new Error(
      `supaRPC ${fn} failed [HTTP ${r.status}] pg_code=${pgCode}: ${pgMsg}${pgDetail ? ` | detail: ${pgDetail}` : ''}`
    );
  }

  return data;
}

export async function POST(req: NextRequest) {
  try {
    const { raw_content, source_url, project, tags, notes, content_type } = await req.json();
    if (!raw_content?.trim()) return NextResponse.json({ error: 'raw_content required' }, { status: 400 });

    const data = await supaRPC('bwd_enqueue', {
      p_raw_content: raw_content,
      p_source_url: source_url || null,
      p_project: project || null,
      p_tags: tags?.length ? tags : null,
      p_notes: notes || null,
      p_content_type: content_type || 'instruction',
    });

    return NextResponse.json({ id: data, status: 'pending' });
  } catch (e: any) {
    console.error('[drop/route] error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
