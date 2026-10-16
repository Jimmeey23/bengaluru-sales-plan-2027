#!/usr/bin/env python3
"""
parse_catalogue.py — structure the supplied membership export into a reviewable catalogue.

Input : data/source/momence-membership-export.txt   (verbatim as supplied; header row of 98
        field names followed by one concatenated block per membership record)
Output: data/derived/catalogue.parsed.json           (per-record structured + raw + confidence)

Design notes
------------
* The export has lost its column delimiters, and records contain different numbers of
  populated columns, so deep positional recovery of all 98 columns is not reliably possible.
  Rather than invent values, this parser recovers the commercially critical columns and
  records an explicit confidence + warning list per record for human review.
* Every record keeps its full raw block and a content hash for traceability.
* Non-retail records (complimentary / influencer / staff / partner / test / sign-up links)
  are classified separately so they are never treated as standard retail memberships.
"""
import json, re, hashlib, pathlib, html
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "source" / "momence-membership-export.txt"
OUT = ROOT / "data" / "derived"
raw = SRC.read_text(encoding="utf-8")

header_line = next(l for l in raw.split("\n") if l.strip())
FIELDS = re.findall(r"[a-zA-Z]+", header_line)
body = raw[raw.index(header_line) + len(header_line):]

MARKER = re.compile(r"(subscription|package-events)absolute")
matches = list(MARKER.finditer(body))
segments, cursor = [], 0
for m in matches:
    segments.append(body[cursor:m.start()])
    cursor = m.end()
segments.append(body[cursor:])

raw_records = []
for i in range(1, len(segments)):
    seg = segments[i]
    tail = re.search(r"(\d{3,})$", seg)
    id_run = tail.group(1) if tail else ""
    blk = (seg[: tail.start()] if tail else seg).strip()
    raw_records.append({"id_run": id_run, "raw": blk})
raw_records[0]["id_run"] = segments[0].strip()

def num(s):
    try:
        return float(str(s).replace(",", ""))
    except Exception:
        return None

LOC_RULES = [
    (r"copper \+ cloves", "Studio by Copper + Cloves, Indiranagar"),
    (r"plash pilates", "Plash Pilates, Sadashivnagar"),
    (r"virtual private", "Virtual / Online"),
    (r"hosted class", "Hosted / off-site"),
]
CLASS_RULES = [
    (r"^test\d*$|^test\b", "internal", "excluded_test_product"),
    (r"sign ?up link", "operational", "signup_link"),
    (r"complimentary|free class|free influencer", "complimentary", "complimentary_access"),
    (r"staff family|studio staff", "complimentary", "staff_benefit"),
    (r"influencer", "complimentary", "influencer_access"),
    (r"\bx\b|mama heals|cava|peakst8|scoop|bytwo|bold & beyond", "partner", "partner_or_collab"),
]
PROMO_HINTS = r"anniversary|festive|diwali|women's day|men's health|summer bootcamp|new year|referral|referrer"

out = []
for idx, r in enumerate(raw_records):
    blk, id_run = r["raw"], r["id_run"]
    rec_id = id_run[:7] if len(id_run) >= 7 else id_run
    id_tail = id_run[7:] or None

    # ---------- name ----------
    name = ""
    for line in blk.split("\n"):
        if line.strip():
            name = re.sub(r"\s+", " ", line.strip())
            break
    # repair records whose name and value-run were concatenated in the source
    leak = re.search(r"(\d+(?:\.\d+)?)(fixed-price|free|pay-what-you-want)", name)
    if leak:
        name = name[: leak.start()].strip()

    # ---------- price / duration ----------
    pm = re.search(r"(?<![\d.])(\d{1,7}(?:\.\d{1,2})?)\s*(fixed-price|pay-what-you-want|free|included|subsidized)", blk)
    price, price_type = (num(pm.group(1)), pm.group(2)) if pm else (None, None)
    tail = blk[pm.end():] if pm else blk
    dm = re.match(r"\s*(\d{1,3})(days|weeks|months|years)", tail)
    duration, duration_unit = (num(dm.group(1)), dm.group(2)) if dm else (None, None)
    if dm:
        tail = tail[dm.end():]
    head_nums = re.findall(r"(?<![\d.])(\d{1,4})(?![\d.])", tail[:90])[:6]

    name_clean = html.unescape(name)
    low = name_clean.lower()
    if price == 0:
        product_class_forced = "complimentary"
    else:
        product_class_forced = None

    # ---------- access model ----------
    unlimited = bool(re.search(r"unlimited", low)) or "999" in head_nums
    private_count = None
    mp = re.search(r"(\d{1,3})\s*private class", low)
    if mp:
        private_count = int(mp.group(1))
    elif re.search(r"private class|private session", low):
        private_count = 1

    # ---------- credits ----------
    credits, credit_src = None, None
    cm = re.search(r"complete their (\d{1,3}) classes", blk, re.I)
    if cm:
        credits, credit_src = int(cm.group(1)), "description"
    if credits is None:
        m = re.search(r"(\d{1,3})\s*(?:class|classes|credits)\b", name_clean, re.I)
        if m and not re.search(r"unlimited|month", low):
            credits, credit_src = int(m.group(1)), "name"
    if credits is None and private_count and re.search(r"private class package", low):
        credits, credit_src = private_count, "name"
        private_count = private_count
    if credits is None and re.search(r"\bsingle class|\bcredit\b|private class$", low):
        credits, credit_src = 1, "single_unit_convention"
    credits_from_token = False
    if credits is None and product_class_forced is None and price and price > 0:
        # the export's run-on value blob usually retains numberOfEvents as a small integer,
        # but its exact column position is not recoverable. Only adopt it when it sits in a
        # plausible credit range and the name carries no other numeric signal.
        cands = [int(n) for n in head_nums if 1 <= int(n) <= 60]
        if cands and not re.search(r"\d", name_clean.replace("21", "", 1) if "21-Day" in name_clean else name_clean):
            credits, credit_src, credits_from_token = cands[0], "source_token_heuristic", True
    if credits is None:
        m = re.match(r"(\d{1,3})\b", name_clean)
        if m:
            credits, credit_src = int(m.group(1)), "name_prefix"
    mc2 = re.search(r"(\d+)\s*private classes?\s*(?:&|and)\s*(\d+)\s*studio", low)
    if mc2:
        credits, credit_src, private_count = int(mc2.group(1)) + int(mc2.group(2)), "name_composite_bundle", int(mc2.group(1))
    comp_classes = None
    mc = re.search(r"(\d+) complimentary classes", blk, re.I)
    if mc:
        comp_classes = int(mc.group(1))
    if credits is None and re.search(r"(\d+) for 1", low):
        credits, credit_src = int(re.search(r"(\d+) for 1", low).group(1)), "bogo_name"

    # ---------- dates / lifecycle ----------
    iso = re.findall(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", blk)
    created = iso[0] if iso else None
    modified = iso[1] if len(iso) > 1 else created
    soft_deleted = bool(re.search(r"2024-12-31T21:24:3|2025-01-02T03:42|2025-06-20T10:06:25\.897Z\n", blk)) and "13524385" in blk

    # ---------- prose / policies ----------
    desc = ""
    cands = re.findall(r"\n\s*\n\s*([^\n][\s\S]{60,}?)\s*\n\s*\n", blk)
    if cands:
        desc = html.unescape(max(cands, key=len)).strip()
    policy = {}
    fm = re.search(r"allowed (\d+)\s*freezes?", blk, re.I)
    if fm:
        policy["freezeAllowance"] = int(fm.group(1))
    if re.search(r"does not include any freezes|cannot be frozen", blk, re.I):
        policy["freezeAllowance"] = 0
    if re.search(r"12 hours", blk):
        policy["lateCancellationWindowHours"] = 12
    gm = re.search(r"(\d+)\s*guest passes", blk, re.I)
    if gm:
        policy["guestPasses"] = int(gm.group(1))
    if re.search(r"10% discount on all retail", blk, re.I):
        policy["retailDiscountPct"] = 10
    pmc2 = re.search(r"(\d+) free private classes?", blk, re.I)
    if pmc2:
        policy["complimentaryPrivateClasses"] = int(pmc2.group(1))
    if re.search(r"workshop", blk, re.I) and re.search(r"free workshop access|priority booking", blk, re.I):
        policy["workshopAccess"] = True
    if re.search(r"only (?:applicable|useable|usable) at|only useable at", blk, re.I):
        policy["locationExclusive"] = True
    vm = re.search(r"valid(?:ity)?[:\s]+(?:for\s*)?(\d+)\s*days", blk, re.I)
    if vm:
        policy["validityDaysStated"] = int(vm.group(1))

    location = "Physique 57 Bengaluru (Vittal Mallya Road)"
    for pat, loc in LOC_RULES:
        if re.search(pat, name_clean + " " + desc, re.I):
            location = loc
            break

    # ---------- classification ----------
    product_class, exclusion = "standard_retail", None
    for pat, cls, reason in CLASS_RULES:
        if re.search(pat, low):
            product_class, exclusion = cls, reason
            break
    if product_class == "standard_retail" and re.search(PROMO_HINTS, low):
        product_class = "promotional"
    if product_class_forced == "complimentary" and product_class in ("standard_retail", "promotional"):
        product_class = "complimentary"
        exclusion = exclusion or "zero_price_product_review"
    is_intro = bool(re.search(r"new client intro|newcomer|intro pack|kickstarter|trial|2 for 1", low)) and product_class in ("standard_retail", "promotional")
    if is_intro:
        product_class = "introductory"
    audience = {
        "partner": "partner_members_only",
        "complimentary": "invited_guests_or_members",
        "operational": "internal_signup_funnel",
        "internal": "internal_testing",
    }.get(product_class, "new_clients" if is_intro else "general_public")
    if re.search(r"referr|referral", low):
        audience = "referrers_and_referred"

    # Manual-review overrides: records whose credit count is ambiguous in the source token
    # blob but explicitly stated in the name or description. Documented, not invented.
    MANUAL_OVERRIDES = {
        "4608578": {"credits": 12, "complimentaryCredits": 2, "note": "description: '12 Class Package + 2 complimentary classes'"},
        "4992622": {"credits": 5, "note": "name states 5"},
        "6784915": {"credits": 4, "note": "description: '4 Physique 57 class credits for the price of 3'"},
        "6848":    {"credits": 4, "note": "description: '4 Physique 57 class credits for the price of 3'"},
        "6336904": {"credits": 8, "durationUnit": None, "note": "name states 8 private classes; validity absent in source"},
    }
    ov = MANUAL_OVERRIDES.get(rec_id)
    manual_note = None
    if ov:
        if "credits" in ov and credits is None:
            credits, credit_src = ov["credits"], "manual_review_override"
        if ov.get("complimentaryCredits") and comp_classes is None:
            comp_classes = ov["complimentaryCredits"]
        manual_note = ov["note"]

    warnings = []
    if credits_from_token:
        warnings.append("credits_derived_from_unlabelled_source_token")
    if price is None:
        warnings.append("price_not_recovered")
    if not name:
        warnings.append("name_not_recovered")
    if duration is None:
        warnings.append("duration_not_recovered")
    if credits is None and not unlimited and re.search(r"class|pack|package|membership", low):
        warnings.append("credits_not_recovered")
    if price_type and price_type != "fixed-price":
        warnings.append(f"non_standard_price_type:{price_type}")
    if price and credits and credits > 0 and not unlimited:
        pcp = price / credits
        if pcp < 150 or pcp > 5000:
            warnings.append(f"implausible_price_per_credit:{pcp:.0f}")
    if soft_deleted:
        warnings.append("soft_deleted_in_source")
    if product_class == "internal":
        warnings.append("excluded_from_catalogue")
    if price == 0 and product_class == "standard_retail":
        warnings.append("zero_price_retail_review")

    out.append({
        "sourceIndex": idx,
        "sourceId": rec_id,
        "sourceIdTail": id_tail,
        "sourceFile": SRC.name,
        "rawBlock": blk,
        "rawBlockHash": hashlib.sha256(blk.encode()).hexdigest()[:16],
        "name": name_clean,
        "price": price,
        "priceType": price_type,
        "duration": duration,
        "durationUnit": duration_unit,
        "credits": credits,
        "complimentaryCredits": comp_classes,
        "creditSource": credit_src,
        "unlimitedAccess": unlimited,
        "privateSessionCount": private_count,
        "productClass": product_class,
        "exclusionReason": exclusion,
        "isIntroOffer": is_intro,
        "audienceRestriction": audience,
        "location": location,
        "hostName": "Physique 57 Bengaluru" if "Physique 57 Bengaluru" in blk else None,
        "createdAt": created,
        "modifiedAt": modified,
        "softDeletedInSource": soft_deleted,
        "description": desc[:4000],
        "policy": policy,
        "headNumerics": head_nums,
        "manualReviewNote": manual_note,
        "parseConfidence": "high" if (price is not None and duration is not None and len(warnings) <= 1) else ("medium" if price is not None else "low"),
        "warnings": warnings,
    })

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "catalogue.parsed.json").write_text(json.dumps(out, indent=1), encoding="utf-8")

sellable = [r for r in out if r["productClass"] in ("standard_retail", "promotional", "introductory")]
print(f"records={len(out)}  sellable-retail={len(sellable)}")
print("productClass:", dict(Counter(r["productClass"] for r in out)))
print("confidence:", dict(Counter(r["parseConfidence"] for r in out)))
print("excluded reasons:", dict(Counter(r["exclusionReason"] for r in out if r["exclusionReason"])))
print()
print(f"{'id':>9} {'class':<13} {'price':>9} {'dur':>7} {'cred':>5} {'unl':<4} {'priv':<4} name")
for r in out:
    if r["productClass"] == "internal":
        continue
    dur = (str(int(r["duration"])) + (r["durationUnit"] or "")[:1]) if r["duration"] else "-"
    print(f"{r['sourceId']:>9} {r['productClass']:<13} {('%9.0f' % r['price']) if r['price'] is not None else '        -'} {dur:>7} {str(r['credits'] or ''):>5} {str(r['unlimitedAccess'])[0]:<4} {str(r['privateSessionCount'] or ''):>4} {r['name'][:58]}")
print("\nWARNINGS:")
for r in out:
    if r["warnings"]:
        print(f"  {r['sourceId']:>9} {r['name'][:40]:<42} {r['warnings']}")
