# Sample datasets & demo report

A detailed P&L dataset plus instructions for building the demo `.pbix`
Microsoft expects with the AppSource submission.

`pnl-detailed-2y.csv` is a static, self-contained extract — no generator
script to run, just import it in Power BI Desktop.

## Files

| File | Purpose |
|---|---|
| `pnl-detailed-2y.csv` | 10 080-row monthly P&L (2024-01 → 2025-12): 7 entities × 3 business units × 20 P&L lines. Signed amounts (income +, cost −) and three measures `Prior_Year` / `Budget` / `Actual`. Drives both demos below. |

## How to build the demo `.pbix`

Power BI Desktop reads the CSVs directly and embeds the data inside
`.pbix` files, so the deliverable is self-contained — no external data
source is needed at run time.

### Demo 1 — Cumulative waterfall (`Eclor Waterfall – Cumulative.pbix`)

1. **File → Get data → Text/CSV** → pick `sample/pnl-detailed-2y.csv` → **Load**.
2. **Insert → More visuals → From a file** → pick the latest
   `dist/eclorWaterfallECLOR2026.X.X.X.X.pbiviz`.
3. Sort `PnL_Line` by `PnL_Order` (**Column tools → Sort by column**) so the
   cascade reads top-down (Revenue → COGS → OpEx → Net).
4. Add slicers on `Entity`, `BusinessUnit` and `Date` (a single month) so the
   bars form one consolidated statement.
5. Drop fields into the visual's buckets:
   - `PnL_Line` → **Category**
   - `Actual` → **Value**
6. Format pane:
   - **General → Waterfall mode** = `Cumulative`
   - **General → Show grand total** = ON
   - **General → Grand total label** = `Net Income`
   - **Bridges → Bridge color** = your favourable green
   - **Pillars → Pillar color** = a contrasting tone for the synth total
7. **File → Save as** → `sample/Eclor Waterfall – Cumulative.pbix`.

### Demo 2 — Comparison Prior Year / Actual / Budget with Legend (`Eclor Waterfall – Comparison.pbix`)

1. **File → Get data → Text/CSV** → pick `sample/pnl-detailed-2y.csv` → **Load**.
2. **Insert → More visuals → From a file** → pick the same `.pbiviz`.
3. Add a `Date` slicer (e.g. full-year 2025) and an `Entity` slicer so the
   three pillars stay readable.
4. Drop fields:
   - `PnL_Line` → **Category**
   - `PnL_Category` → **Legend**
   - `Prior_Year` → **Value** (first)
   - `Actual` → **Value** (second)
   - `Budget` → **Value** (third)
5. Format pane:
   - **General → Waterfall mode** = `Comparison`
   - **Y axis → Y axis floor offset (%)** = `30` (lifts the floor so the
     variations stand out; the broken-axis indicator activates)
   - **Y axis → Show broken axis indicator** = ON
   - **Legend → Show** = ON, **Position** = `Top centered`
   - In each legend value's sub-block, tweak the colour — `Revenue`
     gets the brand emerald, `COGS` a coral tone.
6. **File → Save as** → `sample/Eclor Waterfall – Comparison.pbix`.

## What the AppSource cert team uses

When you submit through Partner Center, the validators open the `.pbix`
in Power BI Desktop to check that:

- the visual loads without throwing,
- every data role accepts the field types,
- selection / cross-filter works,
- the Format pane renders without missing labels.

A `.pbix` produced from this dataset covers every code path in
`src/visual.ts` — both modes, the legend stacking, the broken-axis
cutout, the fx-driven colour resolution, the segment labels.
