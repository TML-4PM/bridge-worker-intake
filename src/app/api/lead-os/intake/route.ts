import { NextRequest, NextResponse } from "next/server";

/**
 * Lead OS — Tally Webhook Intake
 * POST /api/lead-os/intake?brand=ahc
 */

const BRIDGE_URL = "https://m5oqj21chd.execute-api.ap-southeast-2.amazonaws.com/lambda/invoke";
const BRIDGE_KEY = process.env.BRIDGE_API_KEY!;

const FIELD_MAP: Record<string, string> = {
  "What industry are you in?":      "industry",
  "Company size (employees)":       "company_size",
  "Where are you based?":           "geography",
  "What is your budget?":           "budget",
  "What is your main problem?":     "problem",
  "How high is the impact?":        "impact",
  "Hours wasted per week":          "hours_wasted",
  "Do you have an internal owner?": "has_owner",
  "Current tools / stack":          "stack_type",
  "When do you need a solution?":   "timeline",
  "Your name":                      "name",
  "Your email":                     "email",
  "Company name":                   "company",
  "Your role":                      "role",
};

function norm(key: string, raw: unknown): unknown {
  let v: unknown = Array.isArray(raw) ? (raw as string[]).join(", ") : raw;
  if (typeof v !== "string") return v;
  v = (v as string).toLowerCase().trim();
  if (key === "company_size" || key === "hours_wasted") return parseInt(v as string) || 0;
  if (key === "timeline")   return (v as string).includes("now") || (v as string).includes("immediately") ? "now" : (v as string).includes("quarter") ? "this_quarter" : "later";
  if (key === "budget")     return (v as string).includes("confirm") ? "confirmed" : "unclear";
  if (key === "has_owner")  return (v as string).includes("yes") ? "yes" : "no";
  if (key === "stack_type") return (v as string).includes("modern") || (v as string).includes("cloud") ? "modern" : "legacy";
  return v;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fields: Array<{ label: string; value: unknown }> = body?.data?.fields ?? [];
    if (!fields.length) return NextResponse.json({ error: "No fields" }, { status: 400 });

    const payload: Record<string, unknown> = {
      source_quality:    4,
      tally_response_id: body?.data?.responseId,
      tally_form_id:     body?.data?.formId,
    };
    for (const f of fields) {
      const key = FIELD_MAP[f.label];
      if (key) payload[key] = norm(key, f.value);
    }

    const brand = req.nextUrl.searchParams.get("brand") ?? "ahc";

    const bridgeRes = await fetch(BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": BRIDGE_KEY },
      body: JSON.stringify({ fn: "lead-os-processor", action: "process_lead_v2", data: { brand, payload } }),
    });
    const result = await bridgeRes.json();
    console.log(`[LEAD-OS] brand=${brand} state=${result.state} score=${result.score} id=${result.lead_id}`);
    return NextResponse.json({ ok: true, lead_id: result.lead_id, state: result.state, score: result.score });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[LEAD-OS] intake:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
