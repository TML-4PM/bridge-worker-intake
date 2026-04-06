import { NextRequest, NextResponse } from "next/server";

/**
 * Lead OS — Signal Ingestion
 * POST /api/lead-os/signal  — webhook
 * GET  /api/lead-os/signal  — email pixel (1x1 GIF)
 */

const BRIDGE_URL    = "https://m5oqj21chd.execute-api.ap-southeast-2.amazonaws.com/lambda/invoke";
const BRIDGE_KEY    = process.env.BRIDGE_API_KEY!;
const SIGNAL_SECRET = process.env.LEAD_OS_SIGNAL_SECRET;

const VALID = new Set([
  "email_opened","link_clicked","replied","no_response_48h",
  "site_revisit","booking_completed","meeting_attended",
  "proposal_sent","proposal_viewed","unsubscribed",
]);

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

async function fire(lead_id: string, signal_type: string, source: string) {
  return fetch(BRIDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": BRIDGE_KEY },
    body: JSON.stringify({ fn: "lead-os-processor", action: "ingest_signal", data: { lead_id, signal_type, source } }),
  }).then((r) => r.json());
}

export async function GET(req: NextRequest) {
  const lead_id = req.nextUrl.searchParams.get("lead_id");
  const type    = req.nextUrl.searchParams.get("type") ?? "email_opened";
  if (lead_id) fire(lead_id, type, "email_pixel").catch(console.error);
  return new NextResponse(PIXEL, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  if (SIGNAL_SECRET && req.headers.get("x-signal-secret") !== SIGNAL_SECRET)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { lead_id, signal_type, source = "api" } = await req.json();
    if (!lead_id || !signal_type) return NextResponse.json({ error: "lead_id + signal_type required" }, { status: 400 });
    if (!VALID.has(signal_type)) return NextResponse.json({ error: `Unknown signal: ${signal_type}` }, { status: 400 });

    const result = await fire(lead_id, signal_type, source);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
