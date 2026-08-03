#!/usr/bin/env python3
"""Estimate per-country foreign-tourist arrivals for Brasov & Sibiu (2025).

OFFLINE research helper — NOT part of the app, NOT on any refresh schedule.
Reads the two REAL-DATA CSVs in this folder and writes ONE clearly-labelled
ESTIMATE CSV. Re-run after editing the assumptions below.

WHY an estimate is needed
-------------------------
Romania's INS publishes foreign arrivals *by country of origin* only at the
NATIONAL level (Tempo matrices TUR104A/B, monthly). At COUNTY level (Brasov,
Sibiu; TUR104F) the split is only Romanian-vs-foreign TOTAL, never per country.
So a city x country table does not exist officially and must be modelled.

THE MODEL (all assumptions are explicit + adjustable)
-----------------------------------------------------
1. Locals are locals: the Romanian-tourist count is taken as-is from real data,
   never modelled.
2. Base mix = national proportions: absent city-level origin data, assume each
   city's foreign mix follows the national top-20 distribution.
3. Tail bucket: the national top-20 does not cover 100% of foreigners; the rest
   is grouped as "Other countries" using NAT_FOREIGN_TOTAL.
4. German uplift: Brasov (Kronstadt) and Sibiu (Hermannstadt) are historic
   Transylvanian-Saxon towns with living German communities and heavy German
   tourism marketing, so Germany is over-represented vs the national average.
   Modelled as a per-city multiplier on Germany's share, then everything is
   renormalised back to 100%. Sibiu's affinity is stronger than Brasov's.
5. Scale: renormalised shares x the city's REAL foreign total.

Everything downstream is an ESTIMATE, not a measurement. Tune the constants and
re-run; the output header restates them.
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# --- assumptions (edit me) -------------------------------------------------
NAT_FOREIGN_TOTAL = 2_585_000   # ~18.6% x 13.9M national arrivals (2025)
GERMAN_UPLIFT = {               # multiplier on Germany's national share
    "Brasov": 1.35,
    "Sibiu": 1.55,
}
# Real foreign totals per city (from city-arrivals-totals.csv, 2025)
CITY_FOREIGN_TOTAL = {
    "Brasov": 201_719,
    "Sibiu": 150_000,           # ~ approximate
}
# ---------------------------------------------------------------------------


def load_national():
    path = os.path.join(HERE, "romania-arrivals-by-country-2025.csv")
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return {r["country"]: int(r["arrivals_2025"]) for r in rows}


def main():
    national = load_national()
    top20_sum = sum(national.values())
    # national shares of ALL foreigners (top-20 + a modelled tail)
    nat_share = {c: v / NAT_FOREIGN_TOTAL for c, v in national.items()}
    tail_share = 1.0 - (top20_sum / NAT_FOREIGN_TOTAL)  # "Other countries"

    out_rows = []
    for city, foreign_total in CITY_FOREIGN_TOTAL.items():
        g = GERMAN_UPLIFT[city]
        # bump Germany, keep all others' RELATIVE weights, renormalise to 1.0
        shares = dict(nat_share)
        shares["Other countries"] = tail_share
        shares["Germany"] = nat_share["Germany"] * g
        total = sum(shares.values())
        shares = {c: s / total for c, s in shares.items()}

        for country, share in sorted(shares.items(), key=lambda kv: -kv[1]):
            out_rows.append({
                "city": city,
                "country": country,
                "estimated_foreign_arrivals_2025": round(share * foreign_total),
                "share_of_foreign_pct": round(share * 100, 2),
                "basis": ("national-proportion + %.2fx German uplift" % g)
                         if country == "Germany" else "national-proportion",
            })

    out_path = os.path.join(HERE, "estimated-city-by-country-2025.csv")
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        f.write("# ESTIMATE - modelled, not measured. See estimate_city_provenance.py.\n")
        f.write("# Assumptions: NAT_FOREIGN_TOTAL=%d; German uplift Brasov=%.2f Sibiu=%.2f;\n"
                % (NAT_FOREIGN_TOTAL, GERMAN_UPLIFT["Brasov"], GERMAN_UPLIFT["Sibiu"]))
        f.write("# city foreign totals: Brasov=%d Sibiu=%d (real, 2025).\n"
                % (CITY_FOREIGN_TOTAL["Brasov"], CITY_FOREIGN_TOTAL["Sibiu"]))
        w = csv.DictWriter(f, fieldnames=[
            "city", "country", "estimated_foreign_arrivals_2025",
            "share_of_foreign_pct", "basis"])
        w.writeheader()
        w.writerows(out_rows)
    print("wrote", out_path, "-", len(out_rows), "rows")


if __name__ == "__main__":
    main()
