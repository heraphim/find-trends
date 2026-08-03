"""Generate eurron.csv: the official EUR/RON daily reference rate.

Source: National Bank of Romania (BNR) official reference rates -- free XML,
authoritative, no market noise or bad ticks. One rate per BANKING day (no
weekends/holidays; the rate is not forward-filled).

Why BNR instead of Yahoo (EURRON=X): Yahoo's OHLC for this pair is largely
synthetic (open == close ~74% of days) and glitch-prone -- its biggest daily
"moves" were corrupt prints, not events. On the clean BNR series the biggest
moves ARE real events (e.g. May 2025 election crisis, 2022 energy/war, COVID
2020-03), so a day-over-day change is a usable event signal.

Columns:
    date, eur_ron, change_pct, big_move
  - change_pct : day-over-day % change vs the previous banking day.
  - big_move   : |change_pct| >= EVENT_THRESHOLD_PCT. RON is tightly managed by
                 the BNR (daily vol ~0.10%), so the threshold is deliberately
                 low; ~0.4% captures the 99th percentile / genuine events.
"""

from datetime import date
from pathlib import Path
import xml.etree.ElementTree as ET

import pandas as pd
import requests

START_DATE = "2020-01-01"
START_YEAR = int(START_DATE[:4])
CURRENCY = "EUR"
EVENT_THRESHOLD_PCT = 0.4     # |change_pct| at/above this flags big_move

OUTPUT_FILE = Path(__file__).with_name("eurron.csv")

ARCHIVE_URL = "https://www.bnr.ro/files/xml/years/nbrfxrates{year}.xml"
RECENT_URL = "https://www.bnr.ro/nbrfxrates10days.xml"   # tops up latest days


def _localname(tag: str) -> str:
    # BNR archives use an http:// namespace, live files use https:// -- parse
    # namespace-agnostically so both are handled.
    return tag.rsplit("}", 1)[-1]


def _parse_rates(xml_text: str) -> list[tuple[str, float]]:
    root = ET.fromstring(xml_text)
    rows = []
    for cube in root.iter():
        if _localname(cube.tag) != "Cube":
            continue
        day = cube.get("date")
        for rate in cube:
            if _localname(rate.tag) == "Rate" and rate.get("currency") == CURRENCY:
                rows.append((day, float(rate.text)))
    return rows


def _fetch(url: str) -> list[tuple[str, float]]:
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    if not r.text.lstrip().startswith("<"):
        return []
    return _parse_rates(r.text)


def build_series() -> pd.DataFrame:
    rows: list[tuple[str, float]] = []
    for year in range(START_YEAR, date.today().year + 1):
        print(f"  archive {year}...")
        rows += _fetch(ARCHIVE_URL.format(year=year))

    print("  recent (10 days)...")
    rows += _fetch(RECENT_URL)

    df = pd.DataFrame(rows, columns=["date", "eur_ron"])
    df["date"] = pd.to_datetime(df["date"])
    df = (df.drop_duplicates("date")
            .sort_values("date")
            .reset_index(drop=True))
    return df


def main() -> None:
    print("Fetching BNR EUR/RON reference rates...")
    df = build_series()
    n_actual = len(df)

    # Reindex to every calendar day and carry the last rate forward over
    # weekends/holidays. bfill covers the Jan 1-2 lead-in (before the first
    # published rate) so the series starts on 2020-01-01.
    full = pd.date_range(START_DATE, date.today(), freq="D")
    df = df.set_index("date").reindex(full).rename_axis("date").reset_index()
    df["eur_ron"] = df["eur_ron"].ffill().bfill()

    # change_pct on the daily series: filled weekend/holiday days show 0%, and a
    # Fri->Mon move lands on Monday.
    df["change_pct"] = (df["eur_ron"].pct_change() * 100).round(3)
    df["big_move"] = df["change_pct"].abs() >= EVENT_THRESHOLD_PCT

    out = df.copy()
    out["date"] = out["date"].dt.strftime("%d-%m-%y")   # match the sheet tabs
    out.to_csv(OUTPUT_FILE, index=False)

    n_events = int(df["big_move"].sum())
    print(f"\nSaved {len(df)} calendar days "
          f"({df['date'].min().date()} -> {df['date'].max().date()}), "
          f"{n_actual} actual + {len(df) - n_actual} carried forward, "
          f"{n_events} flagged big_move -> {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
