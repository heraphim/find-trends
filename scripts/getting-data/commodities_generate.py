"""Generate commodities.csv: daily close + day-over-day % change for a trimmed,
Romania-relevant set of commodity futures.

Source: Yahoo Finance (yfinance). One wide table keyed on date.

Selection rationale (down from the original 15 tickers):
  Brent    BZ=F  - European oil benchmark; drives Romanian fuel prices.
  EuroGas  TTF=F - Dutch TTF, the European gas benchmark (the 2022 energy-crisis
                   driver). Replaces the old US Henry Hub (NG=F), which is not
                   the price Romania pays.
  Wheat    ZW=F  - Romania is a top-5 EU producer; pairs with the weather data.
  Corn     ZC=F  - Same; major Romanian crop, weather-linked.
  Gold     GC=F  - Inflation / safe-haven / RON savings behaviour.
  Copper   HG=F  - "Dr. Copper", global growth bellwether.

Dropped: WTI (0.945 corr with Brent), Soybeans/Coffee/Sugar/Cotton (little RO
relevance), Platinum (niche), Palladium/Aluminum (niche + junk Yahoo data).

Columns kept per commodity: <name>_close, <name>_change_pct.
Dropped per commodity: open (overnight gap ~0.5% vs ~3% intraday range -- no
signal), high/low (intraday volatility, not needed here), adj_close (== close
for futures), volume (patchy on Yahoo).
"""

from datetime import date
from pathlib import Path

import pandas as pd
import yfinance as yf

START_DATE = "2020-01-01"
OUTPUT_FILE = Path(__file__).with_name("commodities.csv")

# display name -> Yahoo ticker
COMMODITIES = {
    "Brent": "BZ=F",
    "EuroGas": "TTF=F",
    "Wheat": "ZW=F",
    "Corn": "ZC=F",
    "Gold": "GC=F",
    "Copper": "HG=F",
}


def fetch_close(name: str, ticker: str) -> pd.Series | None:
    """Return a date-indexed close Series (actual trading days only)."""
    df = yf.download(ticker, start=START_DATE, progress=False, auto_adjust=False)
    if df.empty:
        print(f"  {name} ({ticker}): no data, skipping")
        return None

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]

    s = df["Close"].dropna()
    s.index = pd.to_datetime(s.index)
    return s.sort_index()


def main() -> None:
    print("Downloading commodities...")

    # Full daily calendar shared by every commodity.
    full = pd.date_range(START_DATE, date.today(), freq="D")
    merged = pd.DataFrame({"date": full})
    coverage = {}

    for name, ticker in COMMODITIES.items():
        print(f"  {name}...")
        s = fetch_close(name, ticker)
        if s is None:
            continue
        coverage[name] = int(len(s))
        # Reindex to every calendar day; carry the last close forward over
        # weekends/holidays, bfill the lead-in before the first trading day.
        daily = s.reindex(full).ffill().bfill()
        merged[f"{name}_close"] = daily.round(4).values
        # change_pct on the daily series: filled days show 0%.
        merged[f"{name}_change_pct"] = (daily.pct_change() * 100).round(3).values

    if not coverage:
        raise RuntimeError("No commodity data downloaded.")

    merged["date"] = merged["date"].dt.strftime("%d-%m-%y")
    merged.to_csv(OUTPUT_FILE, index=False)

    n_total = len(merged)
    print(f"\nSaved {n_total} calendar days -> {OUTPUT_FILE}")
    print("actual trading days per commodity (rest carried forward):")
    for n, c in coverage.items():
        print(f"  {n:8} {c}")


if __name__ == "__main__":
    main()
