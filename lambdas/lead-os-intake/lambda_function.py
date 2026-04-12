
import json, os, urllib.request, re
from datetime import datetime, timezone

SB_URL = os.environ["SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_KEY"]
CANON_BRIDGE = os.environ.get("BRIDGE_URL","https://zdgnab3py0.execute-api.ap-southeast-2.amazonaws.com/prod/lambda/invoke")

FIELD_MAP = {
    "email":   ["email","e-mail","your email","work email","email address"],
    "name":    ["name","full name","your name","first name","contact name"],
    "company": ["company","organisation","organization","business","employer"],
    "phone":   ["phone","mobile","contact number","telephone"],
    "message": ["message","enquiry","inquiry","how can","tell us","question"],
}

def fuzzy_extract(fields, label):
    label_lower = label.lower()
    for canon_key, keywords in FIELD_MAP.items():
        if any(kw in label_lower for kw in keywords):
            return canon_key
    return None

def sb_insert(table, row):
    data = json.dumps(row).encode()
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{table}", data=data,
        headers={"apikey":SB_KEY,"Authorization":f"Bearer {SB_KEY}",
                 "Content-Type":"application/json","Prefer":"return=minimal"})
    req.get_method = lambda: "POST"
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status

def handler(event, context):
    body = event if isinstance(event,dict) else json.loads(event.get("body","{}"))
    brand = (event.get("queryStringParameters") or {}).get("brand","T4H")

    # Tally webhook format: data.fields[] with label + value
    fields_raw = (body.get("data") or {}).get("fields", [])
    extracted = {}
    for f in fields_raw:
        lbl = f.get("label","")
        val = (f.get("value") or "")
        if isinstance(val,list): val = " ".join(str(v) for v in val)
        canon = fuzzy_extract(None, lbl)
        if canon: extracted[canon] = str(val)

    # Also accept flat format
    for k in ["email","name","company","phone","message"]:
        if k not in extracted and k in body:
            extracted[k] = str(body[k])

    email = extracted.get("email")
    if not email:
        return {"statusCode":400,"body":json.dumps({"error":"email required"})}

    row = {
        "email":      email,
        "name":       extracted.get("name"),
        "company":    extracted.get("company"),
        "phone":      extracted.get("phone"),
        "message":    extracted.get("message"),
        "source":     body.get("source","tally-webhook"),
        "biz_key":    brand.upper(),
        "lead_type":  body.get("lead_type","inbound"),
        "raw_payload":json.dumps(body)[:2000],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        status = sb_insert("cap_leads", row)
        print(json.dumps({"action":"lead_intake","email":email,"brand":brand,"http":status}))
        return {"statusCode":200,"body":json.dumps({"ok":True,"email":email})}
    except Exception as e:
        print(json.dumps({"action":"lead_intake_error","error":str(e)}))
        return {"statusCode":500,"body":json.dumps({"error":str(e)})}
