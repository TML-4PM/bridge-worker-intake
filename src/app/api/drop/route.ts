import { NextRequest, NextResponse } from 'next/server';

const SUPA_URL = 'https://lzfgigiyqpuuxslsygjt.supabase.co/rest/v1/rpc/exec_sql';
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY!;

async function supaRPC(fn: string, body: object) {
  const r = await fetch(`https://lzfgigiyqpuuxslsygjt.supabase.co/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
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

    if (!data || data.error) throw new Error(data?.message || data?.error || 'enqueue failed');
    return NextResponse.json({ id: data, status: 'pending' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
