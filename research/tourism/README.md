# research/tourism/ — tourist provenience (origin) data & estimates, 2020–2025

Offline reference data on **where tourists to Romania / Brașov / Sibiu come from**, compiled
**August 2026**. Like `research/businesses/`, this is **not loaded by the app**, **not in
`tabs.json`**, and **not on any refresh schedule** — static, sourced snapshots that will drift.

## ⚠️ The core data limitation (read first)

INS (Institutul Național de Statistică) publishes foreign arrivals **by country of origin only
at the NATIONAL level** (annual press releases; there is **no by-country Tempo matrix** for
accommodation — the old border series `TUR107C` is discontinued/empty).

At **county level** (Brașov, Sibiu) the monthly Tempo matrix **TUR104F** splits tourists only
into **Romanian vs. foreign (total)** — **never by specific country**. So a `city × country`
table **does not exist in official data** and is **modelled** here (`estimated-*`).

## Files

| File | Nature | What it is |
|---|---|---|
| `city-arrivals-monthly.csv` | **REAL** | Brașov & Sibiu monthly arrivals (Romanian / foreign / total), Jan 2020 – Dec 2025. Straight from Tempo TUR104F. 288 rows. |
| `city-arrivals-annual.csv` | **REAL** | Annual roll-up of the above + `foreign_pct`. |
| `romania-foreign-by-country.csv` | **REAL** | National foreign arrivals by country & year. Full top-20 for 2025; the persistent top-3/top-5 for 2020–2024 (as INS published them); blanks where a country wasn't broken out that year. |
| `romania-annual-totals.csv` | **REAL** | National totals per year: total arrivals, foreign %, foreign total (2020 approx). Feeds the share maths. |
| `fetch_tempo.py` | script | Reproducibly pulls `city-arrivals-monthly.csv` from the Tempo REST API. Re-run to add 2026. |
| `estimate_city_provenance.py` | script | Reads the real CSVs, applies the model below, writes the estimate. |
| `estimated-city-by-country.csv` | **ESTIMATE** | Modelled per-country foreign arrivals, per city × year × country. 252 rows. |

## What the REAL data shows (2020–2025)

**The two cities diverged** — foreign share of arrivals:

| Year | Brașov foreign | Brașov % | Sibiu foreign | Sibiu % | National % |
|---|---|---|---|---|---|
| 2020 | 26,667 | 3.7 | 20,897 | 8.0 | ~5.8 |
| 2021 | 53,110 | 4.7 | 56,163 | 12.6 | 9.1 |
| 2022 | 106,112 | 7.7 | 89,885 | 17.3 | 14.0 |
| 2023 | 164,062 | 10.8 | 127,204 | 22.5 | 15.4 |
| 2024 | 182,846 | 12.1 | 144,703 | 25.7 | 16.7 |
| 2025 | 201,719 | 14.5 | 166,062 | 27.3 | 18.6 |

So your intuition held in spirit but splits by city: **Sibiu over-indexes on foreigners**
(~27%, well above national), **Brașov under-indexes** (~14.5%, below national) — even though
Brașov draws ~2.3× Sibiu's *total* tourists. Both recovered steadily from the COVID trough; the
foreign share climbed every year in both. (Cross-checks: Brașov 2025 foreign 201,719 and Sibiu
2025 Romanian 441,410 match INS press figures exactly.)

**National mix** (real, `romania-foreign-by-country.csv`): Germany is #1 every year; Italy and
Israel trade #2/#3. Notable real drift the estimate honours: 2021's pandemic anomaly (France
briefly ahead of Israel), Israel's share peaking 2022–23 then easing, Germany's steady lead.

## The estimation model (assumptions, all adjustable in the script)

1. **Locals are locals** — Romanian counts are real, never modelled.
2. **Base mix = national proportions** — full shape from the one complete real distribution (2025 top-20) + a modelled `Other countries` tail.
3. **Per-year top-3 override** — Germany/Italy/Israel re-anchored to each year's *real* national shares, the rest rescaled to fit, so the mix drifts year to year with real data.
4. **German uplift** — Germany's share ×1.35 (Brașov) / ×1.55 (Sibiu) for the Transylvanian-Saxon affinity, then renormalised.
5. **Scale** — shares × the city's **real** foreign total for that year.

Result (estimate): Germany is the largest single foreign origin in both cities every year
(~26.0k Brașov / ~24.5k Sibiu in 2025), ahead of Italy and Israel; the long tail follows the
national shape. ⚠️ Every number in `estimated-city-by-country.csv` is **modelled, not measured**
— tune the constants and re-run to test sensitivity.

## Making it monthly (the app-ready form)

`city-arrivals-monthly.csv` is already real monthly **totals** (foreign/Romanian) — directly
chartable. To get a monthly *by-country* series, split each city's annual per-country estimate
across months **in proportion to that city's real monthly foreign curve** (in the monthly CSV;
seasonality is genuine — Jul/Aug peak, Sibiu also December). Ask before building — small.

## Sources

- Tempo REST API (matrix **TUR104F**, monthly county arrivals) — [tempo-online.gov2.ro](https://tempo-online.gov2.ro/) / `statistici.insse.ro:8077` (see `fetch_tempo.py`)
- National by-country & totals — [economica 2025 top-20](https://www.economica.net/cati-turisti-straini-au-venit-in-romania-in-2025-top-20-tari-care-au-adus-cei-mai-multi-vizitatori-in-tara-noastra_911180.html), [news.ro 2024](https://www.news.ro/economic/ins-in-2024-sosirile-inregistrate-in-structurile-de-primire-turistica-au-crescut-cu-4-5-fata-de-anul-2023-la-14-26-milioane-persoane-16-7-au-fost-turisti-straini-veniti-din-germania-italia-si-israel-1922405605412025020921923525), [hotnews 2023](https://hotnews.ro/romnia-a-primit-136-milioane-de-turisti-n-2023-din-care-doar-15-din-strainatate-o-comparatie-cu-turismul-din-turcia-19038), [news.ro 2022](https://www.news.ro/economic/ins-turismul-2022-sosirile-inregistrate-structurile-primire-turistica-anul-2022-au-insumat-11-299-100-persoane-crestere-21-8-fata-2021-14-au-turisti-straini-cei-multi-turisti-straini-au-venit-1922405703492023020921004074), [agerpres 2021](https://www.agerpres.ro/economic-intern/2022/02/03/ins-sosirile-in-structurile-de-primire-turistica-in-crestere-cu-46-4-in-2021-9-1-au-fost-turisti-straini--858590)
- City totals cross-check — [bizbrasov](https://bizbrasov.ro/2026/02/06/structurilor-de-primire/), [oradesibiu](https://www.oradesibiu.ro/2025/04/16/strainii-atrasi-mai-mult-de-sibiu-crestere-importanta-a-numarului-de-turisti-de-peste-hotare/)
