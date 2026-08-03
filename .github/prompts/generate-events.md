# Propose events for find-trends

You are updating curated event datasets that feed a sales-vs-context correlation
app. **Accuracy matters more than volume.** These rows are analysed as real
signal — a fabricated event, wrong date, or invented importance actively corrupts
the analysis. When unsure, add nothing.

## Files (all under `public/data/events/`)

All share one schema:
`Start Date,End Date,Event Name,Event Type,Impact Category,Positive or Negative,Importance (1-100),Description`

- `brasov_events.csv` — events in/around Brașov, Romania.
- `sibiu_events.csv` — events in/around Sibiu, Romania.
- `romania_events.csv` — national Romanian events (politics, economy, disasters, major movements).
- `global_events.csv` — major world events with plausible spillover to Romanian retail (pandemics, wars, energy shocks, big EU-wide changes).

## Rules (strict)

1. **Append only — never modify or delete an existing row.** Do not change ANY cell of
   any row already present, including empty cells. Read each file first to see what
   exists; match on Event Name + Start Date to avoid duplicates.
2. **Your only job is to APPEND brand-new event rows** that are not already present.
   Fill every column you reasonably can for the rows you add; leave a field blank only
   if genuinely unknown. Do not go back and edit older rows.
3. **New events:** add genuinely real events (recent or credibly scheduled/upcoming)
   that are not already present, in the correct city/national/global file. Recurring
   annual events (festivals, markets) should get a row for each new edition with that
   edition's actual dates.
4. **Format:** dates strictly `YYYY-MM-DD`; `Importance (1-100)` an integer; `Positive
   or Negative` is exactly `Positive`, `Negative`, or `Mixed`; quote any field
   containing a comma. Keep rows roughly date-sorted.
5. **Scope:** edit ONLY the four CSVs above. Do not change any other file, code, or config.
6. If you cannot verify new events for a file, leave that file unchanged. It is
   correct and expected to add few or zero rows.

Make your edits directly to the CSV files. A reviewer will inspect the diff in a
pull request before anything is merged, so keep changes conservative and easy to check.
