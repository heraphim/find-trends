# research/tourism/ — tourist provenience (origin) data & estimates

Offline reference data on **where tourists to Romania / Brașov / Sibiu come from**, compiled
**August 2026**. Like `research/businesses/`, this is **not loaded by the app**, **not in
`tabs.json`**, and **not on any refresh schedule** — static, sourced snapshots that will drift.

## ⚠️ The core data limitation (read first)

Romania's INS (Institutul Național de Statistică) publishes foreign arrivals **by country of
origin only at the NATIONAL level** — Tempo matrices **TUR104A** (arrivals) / **TUR104B**
(overnight stays), *pe țări de proveniență*, **monthly** since 2008.

At **county level** (Brașov = BV, Sibiu = SB) the monthly matrix **TUR104F** splits tourists
only into **Romanian vs. foreign (total)** — **never by specific country**. So a
`city × country` table **does not exist in official data** and has to be **modelled**. That's
what the `estimated-*` file here is.

## Files

| File | What it is | Nature |
|---|---|---|
| `romania-arrivals-by-country-2025.csv` | National top-20 countries of origin, full-year 2025, exact INS figures. | **REAL** |
| `city-arrivals-totals.csv` | Brașov & Sibiu (and Romania) arrivals totals: Romanian / foreign / total, foreign share, overnights. | **REAL** |
| `estimate_city_provenance.py` | Reproducible estimator — reads the two real CSVs, applies the model below, writes the estimate. Edit the constants and re-run. | script |
| `estimated-city-by-country-2025.csv` | Modelled per-country foreign arrivals for Brașov & Sibiu, 2025. | **ESTIMATE** |

## What the real data already tells us (2025)

- **National foreign mix:** Germany 246.5k · Italy 225.0k · Israel 182.6k · USA 151.4k · UK 150.6k … (see CSV). Foreigners ≈ **18.6%** of all arrivals.
- **Brașov skews *domestic*:** 201,719 foreign / 1,389,000 total → **14.5% foreign** (below national). Rank 3 nationally (10.0% of all arrivals); the 2025 dip was almost entirely Romanian tourists (−10.4%) while foreigners rose ~10%.
- **Sibiu skews *international*:** ~150,000 foreign / ~591,000 total → **~25% foreign** (well above national). Strongly seasonal — Jul/Aug peak plus a December Christmas-market spike.

So your intuition held in spirit but split by city: **Sibiu over-indexes on foreigners, Brașov under-indexes** — and both have a genuine German affinity (Transylvanian-Saxon heritage, German-language schooling, German-market tourism).

## The estimation model (assumptions, all adjustable in the script)

1. **Locals are locals** — the Romanian count is taken from real data, never modelled.
2. **Base mix = national proportions** — absent city-level origin data, each city's foreign mix is assumed to follow the national top-20 distribution.
3. **Tail bucket** — the top-20 doesn't cover 100% of foreigners; the remainder is `Other countries` (via `NAT_FOREIGN_TOTAL ≈ 2.585M`).
4. **German uplift** — Germany's share is multiplied per city (Brașov ×1.35, **Sibiu ×1.55** — stronger), then everything is renormalised to 100%. This is the one deliberate departure from national proportions.
5. **Scale** — renormalised shares × the city's **real** foreign total (Brașov 201,719; Sibiu ~150,000).

Result (2025, estimate): Germany becomes the clear #1 foreign origin in both — **~25.1k in Brașov (12.5%)** and **~21.1k in Sibiu (14.0%)** — ahead of Italy/Israel. Everything after Germany tracks the national ranking.

⚠️ Every number in `estimated-city-by-country-2025.csv` is **modelled, not measured.** Tune the constants (uplift factors, foreign totals, tail) and re-run to test sensitivity.

## Next step — making it monthly (not yet built)

The estimate is **annual 2025**, because that's the finest real by-country data. To get a
**monthly city × country** series (what the app ultimately wants):

1. Pull the **real monthly county totals** — Tempo **TUR104F**, filtered to BV / SB, giving
   `foreign arrivals per month` for each city. (INS ships these; note `insse.ro` currently
   serves a **bad TLS cert** — use the `tempo-online.gov2.ro` mirror.)
2. Split each city's **annual** per-country estimate across months **in proportion to that
   city's real monthly foreign-arrival curve** (seasonality anchors: Jul/Aug peak; Sibiu also
   December). This keeps the seasonality real and only the *mix* modelled.

Ask before building — it needs the Tempo monthly pull first.

## Sources

- National by-country 2025 — [economica.net top-20](https://www.economica.net/cati-turisti-straini-au-venit-in-romania-in-2025-top-20-tari-care-au-adus-cei-mai-multi-vizitatori-in-tara-noastra_911180.html), [mediafax](https://www.mediafax.ro/social/ins-sosirile-in-structurile-de-primire-turistica-din-romania-au-scazut-cu-24-in-2025-din-ce-tari-vin-cei-mai-multi-turisti-straini-23682787)
- Brașov 2025 — [bizbrasov](https://bizbrasov.ro/2026/02/06/structurilor-de-primire/)
- Sibiu 2025 — [oradesibiu](https://www.oradesibiu.ro/2025/04/16/strainii-atrasi-mai-mult-de-sibiu-crestere-importanta-a-numarului-de-turisti-de-peste-hotare/), [tribuna](https://www.tribuna.ro/turistii-straini-au-adus-in-sibiu-800-de-milioane-de-euro-in-ultimii-zece-ani-numarul-vizitatorilor-revine-la-nivelul-de-dinaintea-pandemiei/)
- Official primary — [Tempo Online](https://tempo-online.gov2.ro/) (TUR104A/B national by-country; TUR104F county totals), [DJS Sibiu – Turism](https://sibiu.insse.ro/produse-si-servicii/statistici-judetene/turism/)
