# Eclor Waterfall — reference base (data model + theme)

> **This folder is the DEFAULT base for every agent/skill building demo or
> sample material for this project.** Extracted 2026-08-09 from the pbix
> actually submitted & published with the 1.1.76.0 AppSource listing
> (`eclorWaterfallECLOR2026.1.1.76.0.pbix`). Any new demo report, screenshot,
> listing asset or doc example starts from this model and this theme unless
> Nicolas says otherwise.

## Files

| File | What it is |
|---|---|
| `Financial Sample.xlsx` | Source workbook (Microsoft Financial Sample, 700 rows, sheet table `financials`). The FACT M query reads it. |
| `eclor-light.theme.json` | The **« eclor — Light »** report theme (brand emerald `#1EF5B1`, ink `#091612`, Arial, radius-16 cards, top legends, dotted gridlines). Apply to every report. |
| `logo.svg` | ECLOR mark (ink `#091612`), used as an image visual top-left of every page. |
| `model-dump.txt` | Full TOM dump of the published model: every M partition, column, measure DAX, relationship. Ground truth. |
| `layout-reference.json` | Full report layout of the published pbix (pages, positions, every visual's format-pane objects incl. per-point `isPillar` selectors and fx rules). Ground truth for page composition. |
| `MODEL.md` | This synthesis. |

## The model (star, culture fr-FR in the pbix)

```
FACT_ECLOR_FINANCIALS (Date) ──Many:One──> DIM_TIME (Date)      _MEASURES (measure table)
```

### FACT_ECLOR_FINANCIALS — M import from the xlsx
The Financial Sample sheet, transformed (full M in `model-dump.txt`):
years remapped **2013→2026 / 2014→2025**; **Discounts and COGS negated**
(costs are negative — waterfall-ready); ` Sales` renamed `Sales`; measures
**unpivoted** into `Category` / `Amount`; sort key `Order_Category` added
(text: Sale Price 0 → Units Sold 1000 → Manufacturing Price 2000 → Gross
Sales 3000 → Discounts 4000 → Sales 5000 → COGS 6000 → Profit 7000).

Columns: `Segment`, `Country`, `Product`, `Discount Band`, `Date`,
`Category` (**sortBy `Order_Category`**), `Order_Category`, `Amount`
(currency, `"€"` format).

### DIM_TIME — M calendar 2025-01-01 → 2026-12-31
Rich generated calendar: Year/Month/Day, `YearMonth` (`yyyy-MM`, the slicer
field), YearMonthNumber, Quarter/YearQuarter, ISO week + weekday, fiscal
year/quarter (start month parameter), flags (IsWeekend/IsToday/IsCurrent*/
IsYTD), MonthOffset/YearOffset, DateKey.

### _MEASURES — display folder `Financial`
| Measure | DAX | Format |
|---|---|---|
| `Actual` | `SUM(FACT_ECLOR_FINANCIALS[Amount])` | `#,0` |
| `Actual M-1` | `CALCULATE([Actual], DATEADD('DIM_TIME'[Date], -1, MONTH))` | `#,0.###############\ "€"` (3-part) |
| `Δ M-1` | `[Actual] - [Actual M-1]` | idem € |
| `Δ M-1 %` | `DIVIDE([Δ M-1], ABS([Actual M-1]), 0)` | `0.0\ %` (3-part) |
| `Ratio to Gross Sales` | `ABS(IF(SELECTEDVALUE(…Category) IN {"Gross Sales"}, BLANK(), DIVIDE([Actual], CALCULATE([Actual], REMOVEFILTERS(FACT), Category="Gross Sales", KEEPFILTERS(DIM_TIME)), 0)))` | `#,0.00\ %` |

Folder `UI & UX` — **fx colour measures** (bound as field-value conditional
formatting on the visual):
- `_Color_Category`: SWITCH on Category → Gross Sales `#1EF5B1`, Sales `#46EAFF`, Profit `#8958FE`, else `#808080`
- `_Color_Country`: SWITCH on Country → Canada `#8958FE`, France `#FFB454`, Germany `#46EAFF`, else `#808080`

## The published report (4 pages, 1920×1080) — composition patterns

Every page: `YearMonth` slicer (top right), `pageNavigator` (bottom),
`logo.svg` image (top left), a header `shape`, one hero visual with
padding 20 and a 20pt title.

1. **Cumulative** — waterfall `Category` × `Actual`, **Table = Country**
   (analysis table under the bars). Format pane: `isPillar = true` forced on
   **Gross Sales, Sales, Profit** (intermediate + closing pillars — first/last
   are pillars by default, the P&L reads Sale Price → … → Profit);
   `pillarColor` = fx **field value** `_Color_Category` (wildcard selector);
   variation arcs `auto-pct` with **conditional `labelBgColor`** (Δ M-1 < 0 →
   `#FF4D6D`, > 0 → `#1EF5B1`), `showArc=false` on Profit, `arrowEnds='end'`
   on Sales; connectors ON. Title « Profit breakdown : ».
2. **Comparaison** — waterfall mode comparison, `Country` ×
   [`Actual M-1`, `Actual`], **variance rail = `Δ M-1 %`** (X-grain engine
   subtotal), `yMinOffset = 75`, yAxis displayUnits none + dashed gridlines,
   bridges `colorBridge` = conditional fx on Δ M-1 (red/green), per-measure
   pillar fills (metadata selectors), rails: height 40 / gapGauge 10.
   Title « Total profit M vs M-1 - Breakdown by country : ».
3. **Legend** — cumulative, `Country` × `Actual`, **Legend = Category**,
   `isPillar = false` forced on Canada & USA (kills the first/last default —
   all countries are bridges), **Grand total ON** labelled « Actual net
   sales », segment labels ON (14pt, tinted backgrounds), `barWidth = 80`.
4. **Detail** — `tableEx` of the FACT dimensions + the Financial measures.

## Conventions to carry into any new demo work

- Costs negative in the data; the waterfall never needs sign hacks.
- Sort `Category` by `Order_Category` (model-level `sortBy`).
- Colour logic through the `_Color_*` measures (fx field value), not
  hard-coded per-point fills.
- Scale-sensitive labels: the € format lives on the measures; the visual
  respects it verbatim (no display-unit double scaling).
- Theme first: « eclor — Light » supplies backgrounds, cards, fonts;
  avoid per-visual style overrides the theme already covers.

## PBIR authoring notes (learned rebuilding the demo)

- TMDL: a `formatString` containing quote markers must be emitted fully
  quoted with doubled inner quotes (`"""TRUE"";""TRUE"";""FALSE"""`).
- tableEx: do NOT set `"active": true` on a `Values` projection — the
  table then renders only that column. `active` is for grouping roles
  (category/legend) and slicers.
- Don't carry a pbix's persisted `columnWidth`-style objects into a
  rebuilt tableEx — stale metadata selectors blank the columns.
- Engine (TMSL) refresh right after a `pbir desktop refresh` hot-reload
  deadlocks; refresh only on a freshly opened instance.
