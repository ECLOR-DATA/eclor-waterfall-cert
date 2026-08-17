# Sample datasets & demo report

The reference base plus the demo report Microsoft expects with the
AppSource submission.

## Files

| File | Purpose |
|---|---|
| `base/` | **The reference base** — data model + theme of the pbix actually submitted & published (1.1.76.0). Starting point for every demo report, screenshot and listing asset. See [base/MODEL.md](base/MODEL.md). |
| `demo-report/eclor_waterfall.pbix` | **The submitted artifact** — the sample `.pbix` uploaded to Partner Center and offered on the AppSource listing. Binary, data embedded, opens with no refresh. This is the file to hand to anyone asking "show me the visual". |
| `demo-report/eclor_waterfall.pbip` | **Versionable source of that pbix** — same 4 pages, same model, diffable TMDL + PBIR. Built on `base/`. |
| `pnl-detailed-2y.csv` | Legacy 10 080-row monthly P&L extract (kept for the manual demo recipe below). |

## `demo-report/` — the sample, as pbix and as PBIP

`eclor_waterfall.pbix` is the built deliverable; `eclor_waterfall.pbip` is
the same report in reviewable form. Both sit on [base/](base/MODEL.md): the
published model (`DIM_TIME` ⟵ `FACT_ECLOR_FINANCIALS` from
`base/Financial Sample.xlsx`, unpivoted `Category`/`Amount` with costs
negative, plus the `_MEASURES` table — Actual / Actual M-1 / Δ M-1 /
Δ M-1 % / `_Color_*` fx measures), the « eclor — Light » theme and the
ECLOR logo.

The PBIP carries **no** `CustomVisuals/` folder, and that is correct, not a
loss: its `report.json` declares
`"publicCustomVisuals": ["eclorWaterfallECLOR2026"]`. Desktop substitutes
the AppSource copy for any GUID it recognises in the marketplace and
**deletes** an embedded folder on the next save, so embedding under the
published GUID never held. A pre-release build has to be republished under a
private GUID to be visible in Desktop at all.

The same substitution explains a detail inside the `.pbix`: its
`Report/CustomVisuals/eclorWaterfallECLOR2026/` metadata records
`"version": "1.3.3.0"` — the build that was *imported* in the authoring
session. Desktop stamps the imported version but renders the AppSource copy,
so the pages in this file were produced by the published **1.1.76.0** build,
the one in [releases/](../releases/) and the one this repo describes.

The FACT query reads the workbook through the **`DataFolder` parameter**
(neutral default `C:\eclor-waterfall\sample\base`, sanitized for publication)
— repoint it in **Transform data → Manage parameters** to wherever this repo
is cloned, then Refresh.

Four pages (1920×1080, header band + page navigator + strict single-select
`YearMonth` slicer preset to 2026-12). **The 💡 panels are a usage notice
for the visual only** — Microsoft expects the sample to teach how the
visual is used, so every tip states the bucket or format-pane path behind
what is shown:

1. **Getting started** — dedicated onboarding page: field buckets, the two
   modes, five quick wins, tour of the file, support links.
2. **Cumulative** — « Profit breakdown » : Category cascade with Gross
   Sales / Sales / Profit pinned as pillars (per-point Is pillar), fx
   field-value pillar colours (`_Color_Category`), variation arcs with
   conditional label backgrounds on Δ M-1, Country analysis table.
3. **Comparaison** — Actual M-1 → Actual pillars, bridges by country,
   `Δ M-1 %` variance rails, floor offset 75 %, conditional bridge fills.
4. **Legend** — net sales by country stacked by Category (segment labels),
   Canada/USA demoted from the first/last pillar default, grand total
   « Actual net sales ».

To regenerate the `.pbix` for Partner Center: open `eclor_waterfall.pbip` in
Power BI Desktop, **Refresh** (the M queries read
`base/Financial Sample.xlsx`), then **File → Save as →
`eclor_waterfall.pbix`** over the committed copy. Keep the two in sync —
the pbix is what reviewers and users open, the pbip is what code review
can actually read.

## How to build the demo `.pbix` manually (legacy path)

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
