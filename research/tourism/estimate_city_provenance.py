#!/usr/bin/env python3
"""Estimate per-country foreign-tourist arrivals for Brasov & Sibiu, 2020-2025.

OFFLINE research helper — NOT part of the app, NOT on any refresh schedule.
Reads the REAL-DATA CSVs in this folder and writes ONE clearly-labelled
ESTIMATE CSV per city x year x country. Re-run after editing the assumptions.

WHY an estimate is needed
-------------------------
INS publishes foreign arrivals *by country of origin* only NATIONALLY (annual
press releases; there is no by-country Tempo matrix for accommodation). At
COUNTY level (Brasov, Sibiu; Tempo TUR104F, monthly) the split is only
Romanian-vs-foreign TOTAL, never per country. So a `city x country` table does
not exist officially and must be modelled.

THE MODEL (all assumptions explicit + adjustable)
-------------------------------------------------
1. Locals are locals: Romanian counts are taken as-is from real data.
2. Base mix = national proportions: each city's foreign mix is assumed to
   follow the national distribution. The full shape comes from the one complete
   real distribution (2025 top-20), with a modelled "Other countries" tail.
3. Per-year top-3 override: Germany/Italy/Israel — the persistent national
   top-3 — are re-anchored to each year's REAL national shares, and the rest of
   the vector is rescaled to fit. This lets the mix drift year to year with the
   real data (e.g. Israel's share falling after 2023) instead of being frozen.
4. German uplift: Brasov (Kronstadt) & Sibiu (Hermannstadt) are historic
   Transylvanian-Saxon towns with living German communities and heavy German
   tourism marketing, so Germany is over-represented vs the national average.
   Modelled as a per-city multiplier on Germany's share, then renormalised.
   Sibiu's affinity is set stronger than Brasov's.
5. Scale: renormalised shares x the city's REAL foreign total for that year
   (from city-arrivals-annual.csv, which is straight from Tempo TUR104F).

Everything in estimated-city-by-country.csv is MODELLED, not measured.
Only city-arrivals-*.csv and the non-blank cells of romania-foreign-by-country.csv
are real.
"""
import csv, os

HERE = os.path.dirname(os.path.abspath(__file__))
YEARS = [2020, 2021, 2022, 2023, 2024, 2025]

# --- assumptions (edit me) -------------------------------------------------
GERMAN_UPLIFT = {"Brasov": 1.35, "Sibiu": 1.55}   # multiplier on Germany's share
TAIL_LABEL = "Other countries"
# ---------------------------------------------------------------------------


def read_csv(name):
    with open(os.path.join(HERE, name), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def to_int(s):
    s = (s or "").strip().lstrip("~")
    return int(s) if s.replace(".", "").isdigit() else None


def load_national_shares():
    """Return {year: {country: share}} incl. TAIL, summing to 1.0 per year."""
    bycountry = read_csv("romania-foreign-by-country.csv")
    totals = {int(r["year"]): to_int(r["national_foreign_total"])
              for r in read_csv("romania-annual-totals.csv")}

    # 2025 is the reference shape (full top-20 present)
    ref = {r["country"]: to_int(r["2025"]) for r in bycountry if to_int(r["2025"])}
    ref_total = totals[2025]
    ref_share = {c: v / ref_total for c, v in ref.items()}
    ref_tail = 1.0 - sum(ref_share.values())

    out = {}
    for y in YEARS:
        nf = totals[y]
        # real anchors for this year (only cells that are filled)
        anchor = {r["country"]: to_int(r[str(y)]) for r in bycountry if to_int(r.get(str(y)))}
        top3 = {c: anchor[c] / nf for c in ("Germany", "Italy", "Israel") if c in anchor}
        # start from 2025 shape + tail
        shares = dict(ref_share)
        shares[TAIL_LABEL] = ref_tail
        # override the top-3 with this year's real shares, rescale the rest to fit
        rest_keys = [k for k in shares if k not in top3]
        rest_ref_sum = sum(shares[k] for k in rest_keys)
        target_rest = 1.0 - sum(top3.values())
        for k in rest_keys:
            shares[k] = shares[k] / rest_ref_sum * target_rest
        shares.update(top3)
        out[y] = shares
    return out


def main():
    nat = load_national_shares()
    city_foreign = {(r["city"], int(r["year"])): int(r["arrivals_foreign"])
                    for r in read_csv("city-arrivals-annual.csv")}

    rows = []
    for city in ("Brasov", "Sibiu"):
        g = GERMAN_UPLIFT[city]
        for y in YEARS:
            F = city_foreign.get((city, y))
            if not F:
                continue
            shares = dict(nat[y])
            # German uplift, renormalise the remainder
            g_new = shares["Germany"] * g
            scale = (1.0 - g_new) / (1.0 - shares["Germany"])
            shares = {c: (g_new if c == "Germany" else s * scale) for c, s in shares.items()}
            for country, s in sorted(shares.items(), key=lambda kv: -kv[1]):
                rows.append({
                    "city": city, "year": y, "country": country,
                    "estimated_foreign_arrivals": round(s * F),
                    "share_of_foreign_pct": round(s * 100, 2),
                })

    out = os.path.join(HERE, "estimated-city-by-country.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        f.write("# ESTIMATE - modelled, not measured. See estimate_city_provenance.py.\n")
        f.write("# Real inputs: city-arrivals-annual.csv (Tempo TUR104F) + "
                "romania-foreign-by-country.csv (INS annual, national).\n")
        f.write("# German uplift: Brasov=%.2f Sibiu=%.2f.\n"
                % (GERMAN_UPLIFT["Brasov"], GERMAN_UPLIFT["Sibiu"]))
        w = csv.DictWriter(f, fieldnames=["city", "year", "country",
                                          "estimated_foreign_arrivals", "share_of_foreign_pct"])
        w.writeheader()
        w.writerows(rows)
    print("wrote", out, "-", len(rows), "rows")

    # sanity: top-5 per city for first & last year
    for city in ("Brasov", "Sibiu"):
        for y in (2020, 2025):
            top = sorted((r for r in rows if r["city"] == city and r["year"] == y),
                         key=lambda r: -r["estimated_foreign_arrivals"])[:5]
            print(f"{city} {y}:", ", ".join(f"{r['country']} {r['estimated_foreign_arrivals']:,}" for r in top))


if __name__ == "__main__":
    main()
