# find-trends

A **no-backend** React SPA that reads a public Google Sheet and charts daily/weekly/
monthly/yearly trends across cities and markets, alongside a curated feed of world
events. Hosted on GitHub Pages. Everything runs in the browser — no server, no API keys.

**End goal:** the user will upload their shop's **sales** CSV and correlate it against
weather + economic factors to find trends. Sales upload + comparison views are the main
pending work.

## Stack & hosting

- Vite + React + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), Recharts v3, PapaParse, fflate.
- Live: https://heraphim.github.io/find-trends/ — repo `heraphim/find-trends`.
- Deploy: push to `main` → `.github/workflows/deploy.yml` builds and publishes to Pages.
- `vite.config.ts` sets `base: '/find-trends/'` and injects `__COMMIT_DATE__` / `__BUILD_DATE__` (shown in the floating pill; frozen at dev-server start in `npm run dev`).

## Working conventions (important)

- **GitHub account is `heraphim`**, NOT the default-active `bezier-development`. Commit/push as `heraphim` / `andi_bvro@yahoo.com` (use `git -c user.name=... -c user.email=...`).
- **PowerShell here-strings mis-parse** multi-line commit messages — commit with `git commit -F <file>` or repeated `-m`.
- Verify visually via the in-app Browser pane, but note it often runs **without compositing** (0×0 viewport): screenshots/synthetic pointer events don't reach Recharts. Drive React controls with native `.click()` / setting input values + dispatching `change`; read results from the DOM.
- After changes: `npm run build` (runs `tsc -b`), then commit/push; the Actions run must go green.

## Data source

Public Google Sheet `1EalVOfYpeJ0HQPUkeJClQ3M8rtlskBFmMTivvbUVR7Y`, multi-tab. Both the
gviz CSV (`/gviz/tq?tqx=out:csv&sheet=NAME`) and the `.xlsx` export are CORS-clean.
- Tab discovery: fetch the xlsx, unzip with fflate, read `xl/workbook.xml` (`lib/workbook.ts`).
- Per-tab data: gviz CSV, lazy-loaded, parsed by `lib/sheet.ts`.
- **Tabs:** `days` (per-day reference/filters — first sheet), `brasov-weather`, `sibiu-weather`, `commodities`, `euro`.
- **Naming rule:** `xxx-yyy` → city `xxx` (an include-checkbox) + category `yyy`; a no-hyphen sheet is a **global** category shown for every city. `days`/`date` is the filter sheet, not a category.
- **Column rule:** numeric col = plottable **metric**; non-numeric (text/TRUE-FALSE) = **event**/day-classifier. `weather_code` is force-classified as an event.

## App architecture

`Dashboard.tsx` owns almost all state and composes everything. Key pieces:

- `lib/workbook.ts` — discover tabs, build the city/category model.
- `lib/sheet.ts` — fetch + parse a tab into `{rows, columns}`; classify metric vs event.
- `lib/data.ts` — types, date parsing, bucketing/aggregation (`aggregateMerged`), % rebasing, Pearson correlation, day-count-per-bucket, `bucketToRange` (clicked point → period).
- `lib/metricMeta.ts` — per-column unit/label/roll-up (°C, mm summed, seconds→hours, EUR/RON, commodity price, etc.).
- `lib/dayFilters.ts` — parse the `days` sheet into filter dimensions (weekend/season/holiday…) + date→attributes map; excludes the redundant `is_weekday` name column.
- `lib/dateRange.ts` — range math + option lists for the Range picker.
- `lib/events.ts` — Wikipedia events + heuristic importance scoring (see below).
- `lib/chartColors.ts` — validated colorblind-safe palette (light/dark).
- `hooks/useTheme.tsx` — theme context; **dark is default**; no-flash script in `index.html`.
- `hooks/usePersistedState.ts` — localStorage-backed state; ALL config persists under `ft.*` keys.

Components: `CityControls` (city checkboxes + overlap), `DateRangePicker` (Range: Day/Week/
Month/Year/All), `GranularityToggle` (Time units, clamped ≤ range), `Sidebar` +
`DayFilters` (categories + day filters; closable on mobile), `MultiTrendChart` (Recharts;
click a point → focus events), `EventsPanel`, `BuildInfo`, `ThemeToggle`.

### Behaviour notes

- Cities are multi-select checkboxes (no tabs). Metric selection is city-agnostic (`category::column`); a checked metric plots for every included city that has it.
- **Overlap** on → all series on one chart; off → one chart per city (+ a "Markets" chart for globals).
- Chart shows **actual values** (Scale toggle also offers **% change** to compare different-magnitude series). All non-sales data **averages**; the total/average radio is reserved for future sales data.
- Correlation (Pearson r) shown per chart; per-series color pickers; matching-day counts in the total line + tooltip.
- **Events panel:** ≤10-day ranges → Wikipedia Current Events daily digest; longer → year-article "Events" (curated majors), filtered to range. Heuristically scored (topic weight + impact keywords + casualties + coverage), tiered major/notable/minor, "Important only" hides minor. Clicking a chart point focuses the panel on that point's period. Recharts v3 `onClick` gives `activeIndex` (NOT v2's `activePayload`).

## Pending / ideas

- **Sales CSV upload + comparison** (aligned time-series, scatter + r, correlation ranking) — the main goal, blocked on a sample sales file.
- **Event overlays** on the chart from day-classifier columns (`season`, `nice_day_label`, `weather_code`, etc.).

## API gotchas (verified)

- Wikipedia REST "on this day" only has **historic** events (nothing ≥2020) — unusable here.
- **GDELT is CORS-blocked** from the browser (needs a backend) and is article-level, not curated.
- Energy-prices / FRED / Stooq are CORS-blocked; Frankfurter (FX) and World Bank (annual) work but weren't added.
