"""Download daily weather for Romanian cities and compute "nice day" scores.

Writes one CSV per city (city column removed) for easy copy-paste into the
matching Google Sheet tab:
    weather_brasov.csv  -> brasov-weather tab
    weather_sibiu.csv   -> sibiu-weather tab

Data source: Open-Meteo (free, no API key).
  - Archive API  : finalized history, 2020-01-01 -> yesterday.
  - Forecast API : recent past (to bridge the archive lag) + next 7 days.
Rows are tagged is_forecast so predicted days are distinguishable from history.

Two scoring systems are emitted side by side:
  * v1  -- an exact 1:1 port of the original Google Sheet formulas.
  * v2  -- a research-based revision grounded in the Tourism Climate Index
           (Mieczkowski 1985) and Holiday Climate Index (Scott/Rutty 2016):
             - thermal comfort from feels-like temperature, as a comfort BAND
               (not distance from a monthly "ideal"), asymmetric (heat bites
               faster than cold);
             - precipitation weighted higher (0.30) and non-linear;
             - wind scored on the daily MEAN with a gentle band;
             - a weather_code hazard multiplier (thunderstorm / freezing / fog),
               which the v1 model ignored entirely;
             - outdoor_score_v2 uses a multiplicative physical "veto" so a mild,
               sunny-but-stormy day cannot score well.
All thresholds/weights are constants below -- tune freely.
"""

import time
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import requests

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
START_DATE = "2020-01-01"
FORECAST_DAYS = 7          # days of forecast to append
FORECAST_PAST_DAYS = 14    # forecast-API history, to bridge the archive lag

HERE = Path(__file__).parent

# city -> (lat, lon, output filename)
CITIES = {
    "Brasov": (45.657975, 25.601198, "weather_brasov.csv"),
    "Sibiu": (45.798327, 24.125582, "weather_sibiu.csv"),
}

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
TIMEZONE = "Europe/Bucharest"

# Open-Meteo daily variables (identical names on both endpoints) -> friendly.
DAILY_VARS = {
    "temperature_2m_max": "temp_max",
    "temperature_2m_min": "temp_min",
    "temperature_2m_mean": "temp_mean",
    "apparent_temperature_max": "apparent_temp_max",
    "apparent_temperature_min": "apparent_temp_min",
    "precipitation_sum": "precipitation",
    "rain_sum": "rain",
    "snowfall_sum": "snowfall",
    "wind_speed_10m_max": "wind_max",
    "wind_speed_10m_mean": "wind_mean",
    "sunshine_duration": "sunshine_duration",
    "daylight_duration": "daylight_duration",
    "weather_code": "weather_code",
}

# Output column order: raw fields, then v1 scores, then v2 scores. (The dropped
# columns apparent_temp_mean/solar_radiation/sunshine_hours were in the old sheet
# tabs, so paste into a cleared tab rather than overlaying the old columns.)
OUTPUT_COLUMNS = [
    # --- raw ---
    "date", "temp_max", "temp_min", "temp_mean",
    "apparent_temp_max", "apparent_temp_min",
    "precipitation", "rain", "snowfall",
    "wind_max", "wind_mean", "weather_code", "is_forecast",
    # --- v1 scores (exact port of the sheet) ---
    "ideal_temp", "temp_score", "rain_score", "wind_score",
    "sunshine_percentage", "snow_bonus",
    "nice_day_score", "nice_day_label", "heavy_rain", "sunny_day", "outdoor_score",
    # --- v2 scores ---
    "comfort_score_v2", "rain_score_v2", "wind_score_v2", "hazard_factor",
    "nice_day_score_v2", "nice_day_label_v2", "outdoor_score_v2",
]

# --- v1 scoring params (original sheet) ------------------------------------ #
IDEAL_TEMP_BY_MONTH = {
    1: 0, 2: 2, 3: 8, 4: 15, 5: 20, 6: 24,
    7: 26, 8: 25, 9: 21, 10: 15, 11: 8, 12: 2,
}

# --- v2 scoring params (research-based) ------------------------------------ #
# Thermal comfort on feels-like daytime high (apparent_temp_max), degrees C.
COMFORT_LOW, COMFORT_HIGH = 20.0, 27.0   # full-score plateau
COLD_ZERO, HOT_ZERO = -5.0, 40.0         # score reaches 0 at these extremes
# Wind comfort on daily mean wind (km/h).
WIND_FULL, WIND_ZERO = 20.0, 50.0
# nice_day_score_v2 weights (HCI/TCI-style): thermal .40, precip .30, sun .20, wind .10
W2_TEMP, W2_RAIN, W2_SUN, W2_WIND = 0.40, 0.30, 0.20, 0.10
# Hazard multipliers by WMO weather_code group.
HAZARD_THUNDERSTORM = ({95, 96, 97, 98, 99}, 0.4)
HAZARD_FREEZING_RAIN = ({66, 67}, 0.5)
HAZARD_FREEZING_DRIZZLE = ({56, 57}, 0.7)
HAZARD_FOG = ({45, 48}, 0.8)

LABEL_BINS = [90, 75, 60, 40, 20]
LABEL_NAMES = ["Excellent", "Nice", "Pleasant", "Average", "Poor", "Miserable"]


# --------------------------------------------------------------------------- #
# Fetching
# --------------------------------------------------------------------------- #
def _parse_daily(payload: dict, city: str) -> pd.DataFrame:
    daily = payload["daily"]
    df = pd.DataFrame({"date": daily["time"], "city": city})
    for api_name, friendly in DAILY_VARS.items():
        df[friendly] = daily.get(api_name)
    return df


def _get(url: str, params: dict) -> dict:
    for attempt in range(5):
        try:
            r = requests.get(url, params=params, timeout=60)
            # Archive API rejects end_date past its allowed max; it reports the
            # max in the reason string, so retry pinned to that date.
            if r.status_code == 400 and "out of allowed range" in r.text:
                reason = r.json().get("reason", "")
                allowed_max = reason.split("to ")[-1].strip().strip(".")
                params = {**params, "end_date": allowed_max}
                continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            print(f"  attempt {attempt + 1} failed: {e}")
            time.sleep(2)
    raise RuntimeError(f"Failed to fetch {url}")


def fetch_city(city: str, lat: float, lon: float) -> pd.DataFrame:
    common = {
        "latitude": lat,
        "longitude": lon,
        "daily": ",".join(DAILY_VARS),
        "timezone": TIMEZONE,
    }

    print("  archive...")
    archive = _parse_daily(
        _get(ARCHIVE_URL, {**common, "start_date": START_DATE,
                           "end_date": date.today().isoformat()}),
        city,
    )
    # Drop any all-null tail rows the archive hasn't finalized yet.
    archive = archive.dropna(subset=["temp_max"])

    print("  forecast...")
    forecast = _parse_daily(
        _get(FORECAST_URL, {**common, "past_days": FORECAST_PAST_DAYS,
                            "forecast_days": FORECAST_DAYS}),
        city,
    )

    archive_dates = set(archive["date"])
    # Archive wins on overlap; forecast fills the recent gap + the future.
    forecast = forecast[~forecast["date"].isin(archive_dates)]

    df = pd.concat([archive, forecast], ignore_index=True)
    df["is_forecast"] = ~df["date"].isin(archive_dates)
    return df


# --------------------------------------------------------------------------- #
# Scoring
# --------------------------------------------------------------------------- #
def _label(score: pd.Series) -> np.ndarray:
    conds = [score >= b for b in LABEL_BINS]
    return np.select(conds, LABEL_NAMES[:-1], default=LABEL_NAMES[-1])


def add_scores(df: pd.DataFrame) -> pd.DataFrame:
    month = pd.to_datetime(df["date"]).dt.month

    # ---- shared: sunshine ------------------------------------------------- #
    sun_pct = np.where(
        df["daylight_duration"] == 0,
        0.0,
        df["sunshine_duration"] / df["daylight_duration"] * 100,
    )
    df["sunshine_percentage"] = sun_pct

    # ===================== v1: exact port of the sheet ===================== #
    ideal = month.map(IDEAL_TEMP_BY_MONTH)
    df["ideal_temp"] = ideal
    df["temp_score"] = (100 - (df["temp_mean"] - ideal).abs() * 5).clip(lower=0)
    df["rain_score"] = (100 - df["precipitation"] * 4).clip(lower=0)
    df["wind_score"] = (100 - (df["wind_max"] - 10).clip(lower=0) * 2).clip(lower=0)

    snow = df["snowfall"]
    winter_bonus = np.select(
        [snow < 1, snow < 5, snow < 20, snow < 40], [0, 10, 20, 10], default=-10
    )
    nonwinter_bonus = np.where(snow > 0, -20, 0)
    df["snow_bonus"] = np.where(month.isin([12, 1, 2]), winter_bonus, nonwinter_bonus)

    df["nice_day_score"] = (
        df["temp_score"] * 0.40
        + df["sunshine_percentage"] * 0.35
        + df["rain_score"] * 0.15
        + df["wind_score"] * 0.08
        + df["snow_bonus"] * 0.02
    ).clip(0, 100).round(1)
    df["nice_day_label"] = _label(df["nice_day_score"])
    df["heavy_rain"] = df["precipitation"] >= 10
    df["sunny_day"] = df["sunshine_percentage"] >= 70
    df["outdoor_score"] = (
        df["temp_score"] * 0.35
        + df["sunshine_percentage"] * 0.40
        + df["rain_score"] * 0.15
        + df["wind_score"] * 0.10
    ).round(1)

    # ===================== v2: research-based revision ===================== #
    a = df["apparent_temp_max"]
    cold = ((a - COLD_ZERO) / (COMFORT_LOW - COLD_ZERO)).clip(0, 1) * 100
    hot = ((HOT_ZERO - a) / (HOT_ZERO - COMFORT_HIGH)).clip(0, 1) * 100
    comfort = np.select([a < COMFORT_LOW, a > COMFORT_HIGH], [cold, hot], default=100.0)
    df["comfort_score_v2"] = np.round(comfort, 1)

    r = df["rain"]
    df["rain_score_v2"] = np.select(
        [r <= 0, r < 3, r < 6, r < 9, r < 12, r < 25],
        [100, 90, 75, 55, 40, 20], default=0,
    ).astype(float)

    df["wind_score_v2"] = (
        ((WIND_ZERO - df["wind_mean"]) / (WIND_ZERO - WIND_FULL)).clip(0, 1) * 100
    ).round(1)

    aesthetic = np.clip(sun_pct, 0, 100)

    c = df["weather_code"]
    df["hazard_factor"] = np.select(
        [c.isin(HAZARD_THUNDERSTORM[0]), c.isin(HAZARD_FREEZING_RAIN[0]),
         c.isin(HAZARD_FREEZING_DRIZZLE[0]), c.isin(HAZARD_FOG[0])],
        [HAZARD_THUNDERSTORM[1], HAZARD_FREEZING_RAIN[1],
         HAZARD_FREEZING_DRIZZLE[1], HAZARD_FOG[1]],
        default=1.0,
    )

    base = (
        comfort * W2_TEMP
        + aesthetic * W2_SUN
        + df["rain_score_v2"] * W2_RAIN
        + df["wind_score_v2"] * W2_WIND
    ).clip(0, 100)
    df["nice_day_score_v2"] = (base * df["hazard_factor"]).round(1)
    df["nice_day_label_v2"] = _label(df["nice_day_score_v2"])

    # Multiplicative veto: bad rain or wind tanks the outdoor score outright.
    df["outdoor_score_v2"] = (
        (comfort * 0.60 + aesthetic * 0.40)
        * (df["rain_score_v2"] / 100)
        * (df["wind_score_v2"] / 100)
        * df["hazard_factor"]
    ).round(1)

    return df


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> None:
    for city, (lat, lon, filename) in CITIES.items():
        print(f"Downloading {city}...")
        df = fetch_city(city, lat, lon)
        df = add_scores(df)
        df = df.sort_values("date").reset_index(drop=True)

        # DD-MM-YY to match the existing sheet tabs; drop the city column.
        df["date"] = pd.to_datetime(df["date"]).dt.strftime("%d-%m-%y")

        out_path = HERE / filename
        df.to_csv(out_path, index=False, columns=OUTPUT_COLUMNS)

        n_fc = int(df["is_forecast"].sum())
        print(f"  saved {len(df)} rows ({n_fc} forecast) -> {out_path}\n")


if __name__ == "__main__":
    main()
