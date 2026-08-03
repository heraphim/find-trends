#!/usr/bin/env python3
"""Monthly city x country foreign-arrival estimate, 2020-2025.

OFFLINE research helper. Takes the ANNUAL per-country estimate
(estimated-city-by-country.csv) and spreads each country's yearly figure across
the 12 months IN PROPORTION TO THE CITY'S REAL MONTHLY FOREIGN CURVE
(city-arrivals-monthly.csv, straight from Tempo TUR104F).

    monthly[c,y,m,country] = annual[c,y,country] * (real_foreign[c,y,m] / real_foreign[c,y])

Consequences / assumptions:
- Seasonality is REAL (the shape comes from measured monthly foreign totals:
  Jul/Aug peak, Sibiu's December bump, the COVID collapse in 2020).
- The country MIX is held constant within a year: every nationality is assumed
  to follow the city's overall foreign seasonality. We have no per-country
  monthly data, so a German and an Israeli visitor share the same month-shape.
  (In reality mixes shift seasonally — e.g. more Israelis in summer, more
  Germans around Christmas markets — this model does NOT capture that.)
- Per city-year the monthly figures sum exactly to the annual estimate; months
  with missing real data (a few early-2020 Sibiu months) are dropped, and the
  remaining months are the normalisation base.

Output: estimated-city-by-country-monthly.csv (ESTIMATE, ~3,000 rows).
Run estimate_city_provenance.py first (this reads its output).
"""
import csv, os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))


def read_csv(name, skip_comments=False):
    with open(os.path.join(HERE, name), newline="", encoding="utf-8") as f:
        if skip_comments:
            lines = [ln for ln in f if not ln.startswith("#")]
            return list(csv.DictReader(lines))
        return list(csv.DictReader(f))


def main():
    # real monthly foreign totals: (city,year) -> {month: foreign}
    monthly = defaultdict(dict)
    for r in read_csv("city-arrivals-monthly.csv"):
        v = r["arrivals_foreign"].strip()
        if v:
            monthly[(r["city"], int(r["year"]))][int(r["month"])] = int(v)

    # annual per-country estimate: (city,year) -> [(country, arrivals)]
    annual = defaultdict(list)
    for r in read_csv("estimated-city-by-country.csv", skip_comments=True):
        annual[(r["city"], int(r["year"]))].append(
            (r["country"], int(r["estimated_foreign_arrivals"])))

    rows = []
    for (city, year), months in sorted(monthly.items()):
        base = sum(months.values())
        if not base:
            continue
        for country, yearly in annual.get((city, year), []):
            for m in sorted(months):
                rows.append({
                    "city": city, "year": year, "month": f"{m:02d}", "country": country,
                    "estimated_foreign_arrivals": round(yearly * months[m] / base),
                })

    out = os.path.join(HERE, "estimated-city-by-country-monthly.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        f.write("# ESTIMATE - modelled, not measured. See estimate_monthly_by_country.py.\n")
        f.write("# Annual per-country estimate spread over months by the city's REAL "
                "monthly foreign curve (Tempo TUR104F).\n")
        f.write("# Country mix is constant within a year; only the month-shape is real.\n")
        w = csv.DictWriter(f, fieldnames=["city", "year", "month", "country",
                                          "estimated_foreign_arrivals"])
        w.writeheader()
        w.writerows(rows)
    print("wrote", out, "-", len(rows), "rows")

    # sanity: Germany in Brasov across 2025 months, and yearly-sum check
    g = [r for r in rows if r["city"] == "Brasov" and r["year"] == 2025 and r["country"] == "Germany"]
    print("Brasov 2025 Germany by month:",
          ", ".join(f"{r['month']}:{r['estimated_foreign_arrivals']}" for r in g))
    print("  sum months =", sum(r["estimated_foreign_arrivals"] for r in g),
          "(annual estimate was",
          next(v for c, v in annual[("Brasov", 2025)] if c == "Germany"), ")")


if __name__ == "__main__":
    main()
