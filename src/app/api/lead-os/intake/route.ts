import { NextRequest, NextResponse } from "next/server";

/**
 * Lead OS — Tally Webhook Intake
 * POST /api/lead-os/intake?brand=ahc
 *
 * Fuzzy field mapping — tolerant of any Tally label wording.
 * Exact label match tried first, then keyword match.
 */

const BRIDGE_URL = "https://m5oqj21chd.execute-api.ap-southeast-2.amazonaws.com/lambda/invoke";
const BRIDGE_KEY = process.env.BRIDGE_API_KEY!;

// keyword → scoring key
// First keyword hit in lowercased label wins
const KEYWORD_MAP: Array<[string[], string]> = [
  [["your name", "full name", "first name", "name"],         "name"],
  [["email"],                                                  "email"],
  [["company name", "organisation", "organization", "company"],"company"],
  [["role", "job title", "position", "title"],                "role"],
  [["industry", "sector", "field"],                           "industry"],
  [["company size", "team size", "employees", "headcount"],   "company_size"],
  [["based", "location", "country", "geography", "region"],   "geography"],
  [["budget", "spend", "investment"],                         "budget"],
  [["problem", "challenge", "pain", "issue", "struggle"],     "problem"],
  [["impact", "severity", "urgency level"],                   "impact"],
  [["hours", "wasted", "time lost"],                          "hours_wasted"],
  [["owner", "champion", "internal", "sponsor"],              "has_owner"],
  [["stack", "tools", "software", "current system"],          "stack_type"],
  [["timeline", "timeframe", "when", "deadline", "need"],     "timeline"],
];

function mapField(label: string): string | null {
  const l = label.toLowerCase();
  for (const [keywords, key] of KEYWORD_MAP) {
    if (keywords.some((k) => l.includes(k))) return key;
  }
  return null;
}

function norm(key: string, raw: unknown): unknown {
  let v: unknown = Array.isArray(raw)
    ? (raw as string[]).filter(Boolean).join(", ")
    : raw;
  if (typeof v !== "string") return v;
  v = (v as string).toLowerCase().trim();
  const s = v as string;

  switch (key) {
    case "company_size":
    case "hours_wasted":
      return parseInt(s.replace(/[^0-9]/g, "")) || 0;

    case "timeline":
      if (/now|immediately|asap|urgent|today|this week/.test(s)) return "now";
      if (/quarter|3 month|90 day/.test(s))                       return "this_quarter";
      return "later";

    case "budget":
      if (/confirm|approved|have|yes|allocated/.test(s)) return "confirmed";
      return "unclear";

    case "has_owner":
      return /yes|have|assigned|confirmed/.test(s) ? "yes" : "no";

    case "stack_type":
      return /modern|cloud|saas|digital/.test(s) ? "modern" : "legacy";

    case "impact":
      if (/high|critical|severe|major/.test(s)) return "high";
      if (/medium|moderate/.test(s))            return "medium";
      return "low";

    case "geography":
      if (/australia|au\b/.test(s))    return "Australia";
      if (/new zealand|nz\b/.test(s))  return "New Zealand";
      return v;

    default:
      return v;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Support both Tally envelope and raw flat payload
    const fields: Array<{ label?: string; key?: string; value: unknown }> =
      body?.data?.fields ?? body?.fields ?? [];

    if (!fields.length) {
      return NextResponse.json({ error: "No fields in payload" }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      source_quality:    4,
      tally_response_id: body?.data?.responseId ?? body?.responseId,
      tally_form_id:     body?.data?.formId     ?? body?.formId,
    };

    for (const f of fields) {
      const label = (f.label ?? f.key ?? "").toString();
      const key   = mapField(label);
      if (key) payload[key] = norm(key, f.value);
    }

    // Need at least one meaningful field
    const hasContent = ["name","email","industry","problem","company"].some((k) => payload[k]);
    if (!hasContent) {
      return NextResponse.json({ error: "No recognisable fields mapped" }, { status: 400 });
    }

    const brand = req.nextUrl.searchParams.get("brand") ?? "ahc";

    const bridgeRes = await fetch(BRIDGE_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-api-key": BRIDGE_KEY },
      body:    JSON.stringify({
        fn:     "lead-os-processor",
        action: "process_lead_v2",
        data:   { brand, payload },
      }),
    });

    if (!bridgeRes.ok) {
      const errText = await bridgeRes.text();
      console.error("[LEAD-OS] bridge error:", errText);
      return NextResponse.json({ error: "Bridge error", detail: errText }, { status: 502 });
    }

    const result = await bridgeRes.json();

    console.log(
      `[LEAD-OS] brand=${brand} state=${result.state} score=${result.score} id=${result.lead_id}` +
      ` mapped=${Object.keys(payload).filter(k => !["source_quality","tally_response_id","tally_form_id"].includes(k)).join(",")}`
    );

    return NextResponse.json({
      ok:      true,
      lead_id: result.lead_id,
      state:   result.state,
      score:   result.score,
      mapped:  Object.keys(payload).filter(k => !["source_quality","tally_response_id","tally_form_id"].includes(k)),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[LEAD-OS] intake unhandled:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
