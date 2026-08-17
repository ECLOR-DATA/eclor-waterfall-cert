# Sample — the demo report Microsoft reviews

One folder, one report: the sample offered on the AppSource listing.

| File | Purpose |
|---|---|
| `demo-report/eclor_waterfall.pbix` | **The submitted artifact** — uploaded to Partner Center and offered on the listing. Binary, **data embedded, opens with no refresh and no external source**. This is the file to hand to anyone asking "show me the visual". |
| `demo-report/eclor_waterfall.pbip` | **Versionable source of that pbix** — same 4 pages, same model, as reviewable TMDL + PBIR text. |

## The data model

`demo-report/eclor_waterfall.SemanticModel/` carries the complete TMDL:
`DIM_TIME` ⟵ `FACT_ECLOR_FINANCIALS` (Microsoft's **Financial Sample**
workbook, unpivoted into `Category`/`Amount` with costs negative and an
`Order_Category` sort key) plus `_MEASURES` — Actual, Actual M-1, Δ M-1,
Δ M-1 % and the `_Color_*` colour measures bound as field-value conditional
formatting.

The theme is « eclor — Light » (emerald `#1EF5B1`, ink `#091612`, Arial,
radius-16 cards), registered inside the report under
`demo-report/eclor_waterfall.Report/StaticResources/`.

**Nothing external is needed to review the sample**: `eclor_waterfall.pbix`
embeds its data and opens straight away.

## Working on the PBIP

Only the `.pbip` needs a data source. The FACT query reads the workbook through
the **`DataFolder` parameter**, which ships with a neutral placeholder default:
point it (**Transform data → Manage parameters**) at a folder containing
`Financial Sample.xlsx`, then **Refresh**.

To regenerate the pbix for Partner Center: open the `.pbip`, Refresh,
**File → Save as → `eclor_waterfall.pbix`** over the committed copy. Keep the
two in sync — the pbix is what reviewers and users open, the pbip is what code
review can actually read.

**MAX_PATH**: open the PBIP from a short root (`C:\eclor-waterfall\` or
equivalent), never from a deep OneDrive path. A PBIR tree eats ~95 characters
before your own names (`<report>.Report\definition\pages\<page>\visuals\<visual>\visual.json`)
and Power BI Desktop enforces the limit strictly — it refuses to open the
project rather than truncating.

## The 4 pages, and what each one teaches

1920×1080, header band + page navigator + strict single-select `YearMonth`
slicer preset to 2026-12. **The 💡 panels are a usage notice for the visual
only** — Microsoft expects the sample to teach how the visual is used, so every
tip names the bucket or the format-pane path behind what is shown.

1. **Getting started** — onboarding: field buckets, the two modes, five quick
   wins, tour of the file, support links.
2. **Cumulative** — « Profit breakdown »: `Category` cascade with Gross Sales /
   Sales / Profit pinned as pillars (per-point Is pillar), fx field-value
   pillar colours (`_Color_Category`), variation arcs with conditional label
   backgrounds on `Δ M-1`, Country analysis table.
3. **Comparaison** — Actual M-1 → Actual pillars, bridges by country,
   `Δ M-1 %` variance rails, floor offset 75 %, conditional bridge fills.
4. **Legend** — net sales by country stacked by `Category` (segment labels),
   Canada/USA demoted from the first/last pillar default, grand total
   « Actual net sales ».

## No `CustomVisuals/` folder, on purpose

`report.json` declares `"publicCustomVisuals": ["eclorWaterfallECLOR2026"]`.
Desktop substitutes the AppSource copy for any GUID it recognises in the
marketplace and **deletes** an embedded folder on the next save, so embedding a
build under the published GUID never held. A pre-release build has to be
republished under a private GUID to be visible in Desktop at all.

The same substitution explains a detail inside the `.pbix`: its
`Report/CustomVisuals/eclorWaterfallECLOR2026/` metadata records
`"version": "1.3.3.0"` — the build that was *imported* in the authoring
session. Desktop stamps the imported version but renders the AppSource copy, so
the pages in this file were produced by the published **1.1.76.0** build, the
one in [releases/](../releases/) and the one this repo describes.

## What the AppSource cert team does with it

The validators open the `.pbix` in Power BI Desktop to check that the visual
loads without throwing, that every data role accepts the field types, that
selection / cross-filter works, and that the Format pane renders without
missing labels. These 4 pages cover both modes, legend stacking, the
broken-axis cutout, fx-driven colour resolution and segment labels.
