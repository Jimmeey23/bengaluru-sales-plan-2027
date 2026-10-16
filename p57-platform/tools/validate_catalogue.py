#!/usr/bin/env python3
"""Validate the parsed catalogue against the reference prices supplied by the business,
and against observed selling prices in the Bengaluru sales export."""
import json, pathlib, csv, collections, re

ROOT = pathlib.Path(__file__).resolve().parents[1]
recs = json.loads((ROOT / "data/derived/catalogue.parsed.json").read_text())
by_name = {}
for r in recs:
    by_name.setdefault(r["name"].strip().lower(), []).append(r)

REFERENCE = {
    "Studio Single Class": 1350, "Studio 4 Class Package": 4450, "Studio 8 Class Package": 8300,
    "Studio 12 Class Package": 12500, "Studio 1 Month Unlimited": 13900, "Studio 3 Month Unlimited": 40200,
    "Studio 6 Month Unlimited": 78300, "Studio Annual Unlimited": 148800, "Studio Private Class": 3925,
    "Studio Happy Hour Private Class": 2750, "Studio 4 Private Class Package": 11000,
    "Studio Hybrid 1 Month Unlimited": 17750, "New Client Intro Pack": 675,
}
ALIASES = {
    "Studio 1 Month Unlimited": "Studio 1 Month Unlimited Membership",
    "Studio 3 Month Unlimited": "Studio 3 Month Unlimited Membership",
    "Studio 6 Month Unlimited": "Studio 6 Month Unlimited Membership",
    "Studio Annual Unlimited": "Studio Annual Unlimited Membership",
    "Studio Hybrid 1 Month Unlimited": "Studio Hybrid 1 Month unlimited",
}
print("=== A. Reference-price validation (business-supplied table vs parsed export) ===")
ok = fail = 0
for ref, expected in REFERENCE.items():
    target = ALIASES.get(ref, ref).lower()
    cands = by_name.get(target, [])
    if not cands:
        print(f"  MISSING  {ref}"); fail += 1; continue
    got = {c["price"] for c in cands}
    if expected in got:
        print(f"  OK       {ref:<34} parsed={int(expected):>7,}  (records: {len(cands)})"); ok += 1
    else:
        print(f"  MISMATCH {ref:<34} expected={expected:>7,} parsed={sorted(got)}"); fail += 1
print(f"  -> {ok} matched, {fail} failed\n")

print("=== B. Observed selling price vs listed price (Bengaluru sales export, succeeded lines) ===")
sales = ROOT.parent / "uploads" / "Sales - Raw - Sales (23).csv"
agg = collections.defaultdict(lambda: {"n": 0, "rev": 0.0, "last": "", "disc": 0.0})
if sales.exists():
    with open(sales, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row.get("Calculated Location") != "Kenkere House" or row.get("Payment Status") != "succeeded":
                continue
            p = (row.get("Cleaned Product") or "").strip()
            v = float((row.get("Payment Value") or "0").replace(",", "") or 0)
            d = float((row.get("Discount Value In Currency") or "0").replace(",", "") or 0)
            a = agg[p]; a["n"] += 1; a["rev"] += v; a["disc"] += d
            pd = (row.get("Payment Date") or "")[:10]
            a["last"] = max(a["last"], pd)
    def norm(x):
        x = x.lower().replace("membership", "").replace("package", "class package").replace("pack", "class pack").strip()
        x = re.sub(r"\s+", " ", x)
        return x
    cat_norm = {norm(r["name"]): r for r in recs}
    for name, a in sorted(agg.items(), key=lambda x: -x[1]["rev"]):
        if a["rev"] < 20000: continue
        c = cat_norm.get(norm(name))
        listed = c["price"] if c else None
        avg = a["rev"] / max(a["n"], 1)
        ratio = f"{avg/listed:.2f}x" if listed else "n/a"
        print(f"  {name[:44]:<46} units={a['n']:>5} rev=₹{a['rev']:>11,.0f} avg=₹{avg:>8,.0f} listed={('₹%d' % listed) if listed else '—':>9} avg/listed={ratio:>7} last={a['last']}")
