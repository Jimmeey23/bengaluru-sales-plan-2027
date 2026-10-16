#!/usr/bin/env python3
"""
derive_analytics.py — build the platform's grounded evidence base from the operational CSVs.

Every number written here is an aggregate of the supplied exports (no estimates).
The application labels these as OBSERVED data, and keeps user-editable ASSUMPTIONS separate.

Outputs (data/derived/):
  sales_performance.json  revenue, units, realised price and discount-code performance (Bengaluru)
  customer_base.json      segment sizes and behaviour of the Bengaluru member/lapsed base
  lead_funnel.json        enquiry -> trial -> sale funnel by studio and source
  capacity_utilisation.json  real off-peak / peak attendance map by weekday and time band
"""
import csv, json, pathlib, collections, statistics, datetime as dt

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC_DIR = ROOT.parent / "uploads"
OUT = ROOT / "data" / "derived"
OUT.mkdir(parents=True, exist_ok=True)

BLORE_SALES_LOC = {"Kenkere House", "the Studio by Copper + Cloves", "The Studio by Copper + Cloves",
                   "Plash Pilates", "Plash Pilates "}
LOC_CANON = {
    "Kenkere House": "Physique 57 Bengaluru (Vittal Mallya Road)",
    "the Studio by Copper + Cloves": "Studio by Copper + Cloves, Indiranagar",
    "The Studio by Copper + Cloves": "Studio by Copper + Cloves, Indiranagar",
    "Plash Pilates": "Plash Pilates, Sadashivnagar",
    "Plash Pilates ": "Plash Pilates, Sadashivnagar",
}
SESSION_CANON = LOC_CANON
CENTER_CANON = {
    "Kenkere House, Bengaluru": "Physique 57 Bengaluru (Vittal Mallya Road)",
    "the Studio by Copper + Cloves, Indiranagar": "Studio by Copper + Cloves, Indiranagar",
    "Plash Pilates": "Plash Pilates, Sadashivnagar",
    "Plash pilates studios": "Plash Pilates, Sadashivnagar",
}

def money(x):
    try:
        return float(str(x).replace(",", "").replace("₹", "").replace("-", "0").strip() or 0)
    except Exception:
        return 0.0

def read(name):
    p = SRC_DIR / name
    if not p.exists():
        return []
    with open(p, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))

TODAY = dt.date(2026, 10, 16)

# ---------------------------------------------------------------- sales
sales = read("Sales - Raw - Sales (23).csv")
monthly = collections.defaultdict(lambda: {"lines": 0, "revenue": 0.0})
products = collections.defaultdict(lambda: {"units": 0, "revenue": 0.0, "discountGiven": 0.0,
                                            "firstSale": "", "lastSale": "", "units90": 0, "revenue90": 0.0})
codes = collections.defaultdict(lambda: {"uses": 0, "revenue": 0.0, "discountGiven": 0.0, "first": "", "last": "", "products": collections.Counter()})
cat_mix = collections.defaultdict(lambda: {"units": 0, "revenue": 0.0})
cut90 = TODAY - dt.timedelta(days=90)
for r in sales:
    if (r.get("Calculated Location") or "").strip() not in BLORE_SALES_LOC:
        continue
    if r.get("Payment Status") != "succeeded":
        continue
    date = (r.get("Payment Date") or "")[:10]
    rev = money(r.get("Payment Value"))
    disc = money(r.get("Discount Value In Currency"))
    prod = (r.get("Cleaned Product") or r.get("Payment Item") or "").strip()
    month = date[:7]
    m = monthly[month]; m["lines"] += 1; m["revenue"] += rev
    p = products[prod]
    p["units"] += 1; p["revenue"] += rev; p["discountGiven"] += disc
    p["firstSale"] = min(p["firstSale"] or date, date); p["lastSale"] = max(p["lastSale"], date)
    try:
        if dt.date.fromisoformat(date) >= cut90:
            p["units90"] += 1; p["revenue90"] += rev
    except Exception:
        pass
    c = (r.get("Cleaned Category") or "Uncategorised").strip()
    cat_mix[c]["units"] += 1; cat_mix[c]["revenue"] += rev
    code = (r.get("Discount Code") or "").strip()
    if code and code not in ("-",):
        cc = codes[code]; cc["uses"] += 1; cc["revenue"] += rev; cc["discountGiven"] += disc
        cc["first"] = min(cc["first"] or date, date); cc["last"] = max(cc["last"], date)
        cc["products"][prod] += 1

sales_out = {
    "source": "Sales - Raw - Sales (23).csv (Momence payments export)",
    "scope": "Bengaluru studios only (Kenkere House / Vittal Mallya Road, Studio by Copper + Cloves, Plash Pilates)",
    "generatedFor": "2026-10-16",
    "dateRange": [min(monthly) if monthly else None, max(monthly) if monthly else None],
    "totals": {"lines": sum(m["lines"] for m in monthly.values()),
               "revenue": round(sum(m["revenue"] for m in monthly.values()), 2)},
    "monthly": [{"month": k, **{kk: round(vv, 2) if isinstance(vv, float) else vv for kk, vv in v.items()}}
                for k, v in sorted(monthly.items())],
    "products": sorted([{"product": k, "units": v["units"], "revenue": round(v["revenue"], 2),
                         "avgRealisedPrice": round(v["revenue"] / v["units"], 2) if v["units"] else None,
                         "discountGiven": round(v["discountGiven"], 2),
                         "firstSale": v["firstSale"], "lastSale": v["lastSale"],
                         "unitsLast90d": v["units90"], "revenueLast90d": round(v["revenue90"], 2)}
                        for k, v in products.items()], key=lambda x: -x["revenue"]),
    "discountCodes": sorted([{"code": k, "uses": v["uses"], "revenue": round(v["revenue"], 2),
                              "discountGiven": round(v["discountGiven"], 2),
                              "impliedDepthPct": round(100 * v["discountGiven"] / (v["revenue"] + v["discountGiven"]), 1) if (v["revenue"] + v["discountGiven"]) else 0,
                              "firstUse": v["first"], "lastUse": v["last"],
                              "topProducts": [p for p, _ in v["products"].most_common(3)]}
                             for k, v in codes.items()], key=lambda x: -x["revenue"]),
    "categoryMix": [{"category": k, "units": v["units"], "revenue": round(v["revenue"], 2)}
                    for k, v in sorted(cat_mix.items(), key=lambda x: -x[1]["revenue"])],
}
(OUT / "sales_performance.json").write_text(json.dumps(sales_out, indent=1), encoding="utf-8")

# ---------------------------------------------------------------- leads
leads = read("❖ PM - Leads ❖ - ◉ Leads (31).csv")
funnel = collections.defaultdict(lambda: {"leads": 0, "trials": 0, "converted": 0, "withMemberId": 0})
source_funnel = collections.defaultdict(lambda: collections.defaultdict(lambda: {"leads": 0, "trials": 0, "converted": 0}))
lead_monthly = collections.defaultdict(lambda: {"leads": 0, "converted": 0})
for r in leads:
    loc = CENTER_CANON.get((r.get("Center") or "").strip())
    if not loc:
        continue
    f = funnel[loc]
    f["leads"] += 1
    trial = (r.get("Trial Status") or "").strip() == "Trial Completed"
    conv = (r.get("Conversion Status") or "").strip() == "Converted"
    f["trials"] += 1 if trial else 0
    f["converted"] += 1 if conv else 0
    f["withMemberId"] += 1 if r.get("Member ID") else 0
    s = (r.get("Source Name") or "Unknown").strip()
    source_funnel[loc][s]["leads"] += 1
    source_funnel[loc][s]["trials"] += 1 if trial else 0
    source_funnel[loc][s]["converted"] += 1 if conv else 0
    mon = (r.get("Created At") or "")[:7]
    if mon:
        lead_monthly[mon]["leads"] += 1
        lead_monthly[mon]["converted"] += 1 if conv else 0

def rate(n, d):
    return round(100 * n / d, 1) if d else None

funnel_out = {
    "source": "❖ PM - Leads ❖ - ◉ Leads (31).csv (CRM lead export)",
    "scope": "Bengaluru enquiries only",
    "generatedFor": "2026-10-16",
    "byStudio": [{"studio": k, **v, "trialRatePct": rate(v["trials"], v["leads"]),
                  "conversionOfLeadsPct": rate(v["converted"], v["leads"]),
                  "conversionOfTrialsPct": rate(v["converted"], v["trials"])}
                 for k, v in sorted(funnel.items(), key=lambda x: -x[1]["leads"])],
    "bySource": [{"studio": loc, "source": s, **v,
                  "conversionOfLeadsPct": rate(v["converted"], v["leads"])}
                 for loc, d in source_funnel.items() for s, v in sorted(d.items(), key=lambda x: -x[1]["leads"])[:12]],
    "monthly": [{"month": k, **v, "conversionOfLeadsPct": rate(v["converted"], v["leads"])}
                for k, v in sorted(lead_monthly.items())],
}
(OUT / "lead_funnel.json").write_text(json.dumps(funnel_out, indent=1), encoding="utf-8")

# ---------------------------------------------------------------- customer base
lapsed = read("Lapsed New - Lapsed (20).csv")
BLORE_MEMBER_LOCS = {"Kenkere House", "the Studio by Copper + Cloves", "the Studio By Copper + Cloves", "Plash Pilates", "Plash Pilates "}
status_counts = collections.Counter()
memb_counts = collections.Counter()
spm, gap, dslv, rps = [], [], [], []
high_value = 0
low_freq = 0
total_rows = 0
seen_members = set()
preferred_time = collections.Counter()
favorite_format = collections.Counter()
for r in lapsed:
    if (r.get("Primary Location") or "").strip() not in BLORE_MEMBER_LOCS:
        continue
    total_rows += 1
    mid = (r.get("Member ID") or "").strip()
    if mid:
        seen_members.add(mid)
    status_counts[(r.get("Derived Status") or r.get("Status") or "Unknown").strip()] += 1
    memb_counts[(r.get("Membership Name") or "Unknown").strip()] += 1
    def fnum(key):
        try:
            return float(str(r.get(key, "")).replace("%", "").replace(",", "").strip())
        except Exception:
            return None
    v = fnum("Average Sessions Per Month")
    if v: spm.append(v)
    v = fnum("Lapse Gap (Days)")
    if v is not None: gap.append(v)
    v = fnum("Days Since Last Visit")
    if v is not None: dslv.append(v)
    v = fnum("Revenue Per Session")
    if v: rps.append(v)
    v = fnum("Average Sessions Per Month") or 0
    if v <= 2: low_freq += 1
    t = fnum("Total Sessions Completed") or 0
    if t >= 30: high_value += 1
    preferred_time[(r.get("Favorite Time") or "").strip()] += 1
    favorite_format[(r.get("Favorite Format") or "").strip()] += 1

def pct(arr, p):
    if not arr: return None
    a = sorted(arr); k = max(0, min(len(a) - 1, int(round((p / 100) * (len(a) - 1)))))
    return round(a[k], 2)

customer_base = {
    "source": "Lapsed New - Lapsed (20).csv (member lifecycle export)",
    "scope": "Bengaluru studios only",
    "generatedFor": "2026-10-16",
    "purchaseRecords": total_rows,
    "uniqueMembers": len(seen_members),
    "statusCounts": dict(status_counts),
    "membershipMix": [{"membership": k, "records": v} for k, v in memb_counts.most_common(25)],
    "behaviour": {
        "avgSessionsPerMonth": {"p25": pct(spm, 25), "median": pct(spm, 50), "p75": pct(spm, 75), "mean": round(statistics.mean(spm), 2) if spm else None, "n": len(spm)},
        "lapseGapDays": {"p25": pct(gap, 25), "median": pct(gap, 50), "p75": pct(gap, 75), "n": len(gap)},
        "daysSinceLastVisit": {"p25": pct(dslv, 25), "median": pct(dslv, 50), "p75": pct(dslv, 75), "n": len(dslv)},
        "revenuePerSession": {"p25": pct(rps, 25), "median": pct(rps, 50), "p75": pct(rps, 75), "n": len(rps)},
        "lowFrequencySharePct": round(100 * low_freq / total_rows, 1) if total_rows else None,
        "highEngagementSharePct": round(100 * high_value / total_rows, 1) if total_rows else None,
    },
    "favouriteTimes": [{"time": k, "records": v} for k, v in preferred_time.most_common(10) if k],
    "favouriteFormats": [{"format": k, "records": v} for k, v in favorite_format.most_common(10) if k],
}
(OUT / "customer_base.json").write_text(json.dumps(customer_base, indent=1), encoding="utf-8")

# ---------------------------------------------------------------- capacity / utilisation
sessions = read("Day End Report - Part 3 - Sessions (19).csv")
grid = collections.defaultdict(lambda: {"capacity": 0, "checkedIn": 0, "lateCancelled": 0, "booked": 0, "sessions": 0})
DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
def band(hour):
    h = int(hour)
    if h < 9: return "6–9am early"
    if h < 12: return "9am–12pm morning"
    if h < 15: return "12–3pm midday"
    if h < 17: return "3–5pm afternoon"
    if h < 20: return "5–8pm evening"
    return "8pm+ late"
for r in sessions:
    loc = SESSION_CANON.get((r.get("Location") or "").strip())
    if not loc:
        continue
    key = (loc, (r.get("Day") or "").strip(), band((r.get("Time") or "0:00").split(":")[0]))
    g = grid[key]
    for src, dst in (("Capacity", "capacity"), ("CheckedIn", "checkedIn"), ("LateCancelled", "lateCancelled"), ("Booked", "booked")):
        try: g[dst] += int(float(r.get(src) or 0))
        except Exception: pass
    g["sessions"] += 1

cap_out = {
    "source": "Day End Report - Part 3 - Sessions (19).csv (attendance export)",
    "scope": "Bengaluru studios only",
    "generatedFor": "2026-10-16",
    "note": "Utilisation = checked-in attendees ÷ scheduled class capacity. Derived from the supplied export; treat as observed historical data.",
    "byStudioDayBand": sorted([
        {"studio": loc, "day": day, "timeBand": b, **v,
         "utilisationPct": round(100 * v["checkedIn"] / v["capacity"], 1) if v["capacity"] else None}
        for (loc, day, b), v in grid.items()
    ], key=lambda x: (x["studio"], DAY_ORDER.index(x["day"]) if x["day"] in DAY_ORDER else 9,
                      ["6–9am early", "9am–12pm morning", "12–3pm midday", "3–5pm afternoon", "5–8pm evening", "8pm+ late"].index(x["timeBand"]))),
}
(OUT / "capacity_utilisation.json").write_text(json.dumps(cap_out, indent=1), encoding="utf-8")

print("Wrote:", ", ".join(sorted(f.name for f in OUT.glob("*.json"))))
print(f"sales: {sales_out['totals']['lines']} lines / ₹{sales_out['totals']['revenue']:,.0f}  range {sales_out['dateRange']}")
print(f"leads: {sum(v['leads'] for v in funnel.values())} Bengaluru enquiries across {len(funnel)} studios")
print(f"customer base: {total_rows} purchase records / {len(seen_members)} unique members; median sessions/month={customer_base['behaviour']['avgSessionsPerMonth']['median']}")
print(f"capacity grid rows: {len(cap_out['byStudioDayBand'])}")
