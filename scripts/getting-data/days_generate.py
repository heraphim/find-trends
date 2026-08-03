"""Generate days.csv: immutable calendar facts for every day.

Unlike the weather/commodity/FX downloads, this data needs no network -- it is
pure date arithmetic, so it is fully knowable in advance. Each run rewrites
days.csv covering 2020-01-01 through today + 7 days.

Columns (the `days` tab of the source Google Sheet, plus is_holiday):
    date, year, month, day, weekday, is_weekday, is_weekend,
    day_of_year, week, season, is_holiday

is_holiday is True on Romanian public holidays.

Note: the source sheet had `weekday` / `is_weekday` scrambled. Here they are
correct: `weekday` is the day name, `is_weekday` is a True/False boolean.
"""

from datetime import date, timedelta
from pathlib import Path

import holidays
import pandas as pd

START_DATE = "2020-01-01"
DAYS_AHEAD = 7

# Output next to this script, regardless of the current working directory.
OUTPUT_FILE = Path(__file__).with_name("days.csv")

# Meteorological seasons (Northern Hemisphere), keyed by month.
SEASON_BY_MONTH = {
    12: "Winter", 1: "Winter", 2: "Winter",
    3: "Spring", 4: "Spring", 5: "Spring",
    6: "Summer", 7: "Summer", 8: "Summer",
    9: "Autumn", 10: "Autumn", 11: "Autumn",
}


def build_days(start_date: str, end_date: date) -> pd.DataFrame:
    dates = pd.date_range(start=start_date, end=end_date, freq="D")

    df = pd.DataFrame({"date": dates})

    df["year"] = df["date"].dt.year
    df["month"] = df["date"].dt.month
    df["day"] = df["date"].dt.day
    df["weekday"] = df["date"].dt.day_name()
    df["is_weekday"] = df["date"].dt.weekday < 5      # Mon-Fri
    df["is_weekend"] = df["date"].dt.weekday >= 5     # Sat-Sun
    df["day_of_year"] = df["date"].dt.dayofyear
    df["week"] = df["date"].dt.isocalendar().week.astype(int)
    df["season"] = df["month"].map(SEASON_BY_MONTH)

    ro_holidays = holidays.Romania(years=range(dates.year.min(), dates.year.max() + 1))
    df["is_holiday"] = df["date"].dt.date.isin(ro_holidays)

    # Format date as DD-MM-YY to match the source sheet.
    df["date"] = df["date"].dt.strftime("%d-%m-%y")

    return df


def main() -> None:
    end_date = date.today() + timedelta(days=DAYS_AHEAD)

    df = build_days(START_DATE, end_date)

    # Booleans render as True/False, matching the sibling download scripts
    # (romania_weather.csv, commodities_daily.csv) that feed the same app.
    df.to_csv(
        OUTPUT_FILE,
        index=False,
        columns=[
            "date", "year", "month", "day", "weekday",
            "is_weekday", "is_weekend", "day_of_year", "week", "season",
            "is_holiday",
        ],
    )

    print(f"Saved {len(df)} rows through {end_date.isoformat()}")
    print(f"-> {OUTPUT_FILE}")
    print(df.head())
    print(df.tail())


if __name__ == "__main__":
    main()
