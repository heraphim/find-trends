# research/ — Brașov & Sibiu business/place research (offline reference data)

Hand-curated, **web-researched snapshots** compiled to explore correlating shop activity against
the trend data. **Not loaded by the app** and **not on any refresh schedule** — these are static
reference CSVs (they will drift: follower counts, "still open?" status, and financials change over
time). Compiled **August 2026**.

## Files

| File | What it is |
|---|---|
| `brasov-city-center-businesses.csv` / `sibiu-city-center-businesses.csv` | Businesses + landmarks in each historic centre. Cols: `name, category, subcategory, address, opened, closed, status, date_basis, landmark, replaced_predecessor, source, notes`. |
| `brasov-social-media.csv` / `sibiu-social-media.csv` | Official IG/FB/TikTok handles + public metrics. Cols: `name, instagram_url, ig_followers, ig_posts, facebook_url, fb_followers, tiktok_url, tiktok_followers, tiktok_likes, other_social, as_of, source`. |
| `company-entities.csv` | Trade name → operating legal entity. Cols: `name, city, legal_name, cui, caen, reg_com, confidence, source, notes`. |
| `company-financials.csv` | Public ANAF financials **in RON**. Cols: `name, cui, year, revenue_ron, net_profit_ron, employees, source, note`. |
| `google-maps-stats.csv` | Google rating / review count / open-closed status. Cols: `name, city, google_rating, google_review_count, google_status, as_of, source`. |
| `brasov-places.csv` / `sibiu-places.csv` | Malls, recreational facilities, touristic areas, mountains/nature around each city. Cols: `name, category, subcategory, area, notes`. |

## Conventions & data-quality notes

- **`~` prefix** = approximate/inferred value (e.g. `~2014` opened, `~12K` followers).
- **`date_basis`** distinguishes how an `opened`/`closed` date was obtained: `press` (news/official),
  `review` (earliest online review — a *floor*, real opening is usually a bit earlier), `official`
  (venue's own stated founding), blank (none found).
- **`replaced_predecessor`** powers the "what replaced what" timeline (e.g. Union → Old Lisbon,
  ING branch → Starbucks, Deane's → O'Peter's).
- **Financials are RON**, sourced from ANAF via quickconta.ro / totalfirme.ro. ⚠️ **Do not use
  listafirme.eu** for turnover here — it reports **EUR mislabeled as RON** (~5× understated); this
  file was rebuilt off RON sources after that was caught.
- **CUIs**: ~20 of 31 venues confidently mapped; the rest publish no operating SRL and are left
  blank rather than guessed. A few venues share/split entities (Casa Chitic, Împăratul Romanilor);
  Keller's SRL became a logistics company (later financials are not the restaurant).
- **Coverage is representative, not exhaustive** for the long tail of small shops; TikTok barely
  exists at venue level (mostly chains).

All values were only recorded when a source stated them; sources are cited per row.
