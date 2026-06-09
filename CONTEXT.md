# CONTEXT — Eclor Waterfall / Power BI Custom Visual

> **Design rationale & decisions** for the project. Pair this with [CHANGELOG.md](CHANGELOG.md) (version history).
>
> This file captures the **why** — what was tried, what didn't work, what's load-bearing. The **what** is in the code; the **history** is in `git log`.

---

## Project structure

```
eclor-waterfall/
# ── Manifest ──
├── pbiviz.json              # Manifest (apiVersion 5.11.0, ECLOR2026 GUID)
├── capabilities.json        # Data roles + format pane object definitions
# ── Shipped in the .pbiviz bundle ──
├── src/
│   ├── visual.ts            # Main IVisual class (constructor, update, parse, layout, render, destroy)
│   ├── settings.ts          # FormattingSettingsModel (cards, CompositeCards, fx slices)
│   ├── format.ts            # Pure number/format-string helpers (scale-then-format)
│   ├── tooltip.ts           # Pure tooltip-payload builder
│   ├── yRange.ts            # Pure Y-axis range computation
│   └── paneLayout.ts        # Display-only format-pane re-layout (§21)
├── style/visual.less        # Container, hover, focus, HC styles
├── assets/icon.png          # 300×300 brand icon
├── stringResources/         # en-US + fr-FR resjson (i18n)
# ── Repo support (not shipped) ──
├── test/                    # Jest suites
├── sample/                  # CSV demo data + .pbix instructions
├── docs/                    # PRIVACY.md + CERT_AUDIT.md
├── tools/audit-render.mjs   # Offline SVG → PNG render
├── releases/                # Packaged .pbiviz artifacts
├── .github/workflows/ci.yml # lint → tsc → jest → pbiviz package
# ── Config & meta ──
├── package.json             # npm dependencies
├── tsconfig.json            # TypeScript strict ES2020
├── tsconfig.jest.json       # Test build (includes src/ + test/)
├── jest.config.js           # Jest + jsdom + ts-jest
├── .eslintrc.json           # plugin:powerbi-visuals/recommended + no-eval/no-implied-eval
├── CONTEXT.md               # This file — design rationale
├── CHANGELOG.md             # Keep-a-Changelog history
└── README.md                # Setup guide + feature overview
```

---

## Critical design decisions (must respect when fixing bugs)

These decisions are deliberate and were validated iteratively. Don't redo them without understanding the rationale.

### 1. Cumulative vs Comparison modes
- **Cumulative**: any number of pillars, bridges chain between them
- **Comparison**: 2+ pillars (start + end), bridges explain the variance

### 2. Pillar y0/y1 logic
- For positive pillars: `y0 = 0`, `y1 = actual`
- For negative pillars: `y0 = actual`, `y1 = 0`
- Pillar label always at `yTop - 8` (above visual top, NOT below)

### 3. Connectors
- Horizontal lines between bars
- Junction Y = `runningAfter` (running total after the bar)
- Show the gap between pillar real value and bridges sum (visual indicator of the actual variance)

### 4. Bridge clipping for negative running
- If `running < 0` and bridge crosses zero → `y0Vis = 0` (clip to baseline visually)
- Real value preserved in label (so the user sees -305 even if visually rendered from 0)

### 5. Y-axis margin and floor offset (the trickiest part)

**Y axis margin** (slider 0-20%): symmetric padding above and below the data range. Always available.

**Y axis floor offset** (slider 0-95%, COMPARISON MODE ONLY):
- **Case 1 — All pillars positive** (`maxVisual > 0 && minVisual >= 0`):
  - Raises `yMin` to `maxVisual × offset/100`
  - Pillars stay anchored to X axis but appear shorter
  - Broken axis stripes shown at BOTTOM of pillars
- **Case 2 — All pillars negative** (`minVisual < 0 && maxVisual <= 0`):
  - Lowers `yMax` to `minVisual × offset/100` (mirror effect)
  - Pillars stay anchored to TOP (y=0) but appear shorter from top
  - Broken axis stripes shown at TOP of pillars
- **Case 3 — Mixed positive + negative pillars**:
  - Auto-disabled (no clipping, full range visible)

This is a **deliberate "honest cheat"** to make small variations visible when pillars are huge — common in Comparison mode where pillars are absolute amounts (2500, 2600) and bridges are deltas (+200, -150).

### 6. yScaleClamped
Critical helper:
```ts
const yScaleClamped = (v) => Math.min(padTop + chartH, Math.max(padTop, yScale(v)));
```
This ensures pillars always stay anchored to the chart floor when `yMin > 0` (offset case). Without this, pillars would render below the X axis as a "negative" value visually.

### 7. Broken axis indicator (oblique stripes)
- Two parallel oblique zigzag stripes
- Double-stroke: 3px black outer + 1px white inner (visible on any color background)
- Position adapts to sign:
  - All positive → `breakY = yBot - 25` (stripes near bottom of pillar)
  - All negative → `breakY = yTop + 25` (stripes near top of pillar)
- Only shown when `yMinOffset > 0 && pillar context is consistent (all positive OR all negative)`

### 8. Colour scheme defaults
- Pillar default: `#FF7900`
- Favorable bridge: `#50be87`
- Unfavorable bridge: `#dd3f3f` / `#cd3c14`
- Pillar label / X axis: `#000000`
- Y axis: `#595959`
- Connector: `#666666`, dashed `5 4`
- Background: transparent (Power BI handles it)

### 9. Comparison mode bridges — same compression as pillars
A `pillarCompression` factor existed historically; it was removed because the Y-axis floor offset achieves the same goal more elegantly while keeping the cascade closing visually.

### 10. Comparison mode supports M≥3 measures (multi-pillar cascade)
Comparison was originally strictly 2 pillars (start + end); it now supports M measures → M pillars + (M-1)·N bridges, structured as `(M-1)` blocks of `(1 pillar + N bridges)` + 1 trailing pillar. Column-index mapping in the table footnote:
```
blockSize = 1 + N
col % blockSize === 0 → pillar for measure (col / blockSize)
else → bridge: k = ⌊col / blockSize⌋, j = col - k·blockSize - 1
```
The brittle check `pointsToRender.length === origCatCount + 2` is a M=2 special case — it silently fails for M≥3. Use the explicit blockSize mapping above.

### 11. Variation arcs between consecutive pillars
Symmetric arrows over each pillar-to-pillar transition, with a per-arc measure picker (fx descriptors require all three: `selector` + `altConstantSelector` + `instanceKind: ConstantOrRule`). The Arc card is a CompositeCard with one collapsible sub-block per secondary pillar. Default text uses Δabs or Δ% mode; per-arc static-text override available.

### 12. Footnote table (Excel-like) aligned to bars
"Table" analysis dimension. Rows below the chart, columns aligned to each bar:
- Per-row and per-cell tooltips
- Click toggle on rows = same selection semantics as bars; cell click = matrix-style (category × analysisDim) composite cross-filter
- Matrix-style cross-highlight: the selected intersection stays full opacity, orthogonal cells dim
- No blue selection tint on selected rows — selection feedback is via opacity / focus ring instead
- fx on the per-column value colour

### 13. Legend stacked on each bar (drag-and-drop dimension)
When a Legend dimension is bound, each bar (pillar or bridge) renders as a stacked segment chart instead of a single rect. Per-segment value labels, per-legend-value segment label controls, fx on segment label colours + global label background. The Grand Total pillar honours the legend too — stacked instead of mono.

### 14. No-category + comparison routing
No-category mode (measures-only, no dim) + user mode = comparison is routed **internally** to cumulative. The comparison branch hardcodes "first+last = pillars" which can't work without a dim to differentiate. Keep `userMode` as user intent, switch on `internalMode` in the renderer:
```ts
let internalMode = userMode;
if (userMode === "comparison" && isNoCategoryMode) internalMode = "cumulative";
```

### 15. Two empty-state branches (the ghost-frame fix)
`parseDataView` returns `null` for the **transient** page-switch case (`dv.categorical === undefined`) → `update()` replays from `lastValidRenderInput` cache, preserving the previous frame so the visual doesn't blink. It returns a **well-formed empty ParseResult** (`buildEmptyParseResult()`) when the user explicitly empties buckets → `update()` wipes caches + nulls `lastValidRenderInput` so a subsequent page-switch can't resurrect a stale frame ("ghost X-axis" bug).

### 16. fx ColorPicker persistence cascade
PBI persists fx-resolved fills in **four** different places depending on the DataView shape. Both readers (`patchFxSlice` for the Format pane, `fxAcrossRows` for the render) scan all four in priority order:
1. `dv.categorical.categories[*].objects[r][objName][propName]` — per-row category-column objects (every bound category column: primary, legend, analysis dimension)
2. `dv.metadata.objects[objName][propName]` — global metadata
3. `dv.categorical.values[i].source.objects[objName][propName]` — per-measure column-level objects (no-category mode)
4. `dv.categorical.values[i].objects[r][objName][propName]` — per-row VALUE-column objects, where a measure-driven fx RULE lands its resolved per-data-point fill

Don't simplify the cascade. Each layer covers a different DataView shape.

### 17. CompositeCard `Group.name` must be globally unique
PBI caches Format-pane state by an internal UID derived from `Group.name`. Two CompositeCards both using `name: "general"` collide → slices leak between cards. Use `bridgesGeneral`, `pillarsGeneral`, `pillarsGrandTotal`, etc. — keep `displayName: "General"` so the user-visible label is unchanged.

### 18. Hover highlight via sibling `<rect>`, not `filter: brightness`
`filter: brightness(1.1)` on a `<g>` blurs `<text>` subpixel rendering. The hover effect toggles a soft fill on a sibling `<rect>` instead.

### 19. Label background padding — text baseline ≠ text top
SVG text baseline is **not** the top of the glyph. Segoe UI / Arial place glyph extents at ~0.78×fontSize above the baseline, ~0.22×fontSize below. Use `ascent = fontSize * 0.78`, `descent = fontSize * 0.22` for symmetric padding around labels.

### 20. Variance rails are X-only via the matrix mapping + engine row subtotals (the 1.1.40 → 1.1.51 saga)

**The requirement:** the variance rails above the chart must depend ONLY on the X axis. Binding a Table (`analysisDim`) or Legend dimension splits each X into `(X × member)` DataView rows and PBI re-evaluates the measure per leaf — but the rail must keep showing the X-grain value.

**Why it cannot be reconstructed client-side:** an additive measure can be re-summed over the leaves (Σ leaves = X total), but a non-additive measure (`Proforma % = DIVIDE([Δ Proforma],[Proforma])`) is NOT a function of its leaves — the X-grain ratio simply does not exist in a leaf-grain DataView. Any client-side "aggregate" (sum, first, average) is wrong by construction.

**The dead ends (keep them dead):**
1. **Co-resident `matrix` facet in the same dataViewMappings object (1.1.44)** — PBI populated it, but at the *leaf grain*: facets of one mapping share ONE query grouped by every bound dim. `for:{in:"category"}` does not restrict the grain of a shared query.
2. **Separate matrix-only `dataViewMappings` object (1.1.46)** — crashed PBI's query generator (`Cannot read properties of undefined (reading 'additionalProjections')` in `QueryGenerator.rewriteQuery`); the visual stopped rendering entirely. **Multiple `dataViewMappings` are ALTERNATIVES the host picks from via `conditions` — never simultaneous queries.** "Each valid mapping produces a data view" is folklore; the documented reality is one query per visual.
3. **Client-side heuristics (1.1.40–43, still present as the fallback)** — `aggregateVarianceValue`: identical-on-every-member → take verbatim; `%` format → first leaf; else sum. Right for table-independent and additive measures, wrong for ratios that genuinely vary per member.

**The working design (1.1.49 → 1.1.51):** the visual's ONE mapping is `matrix` (`rows = [category, legend?, analysisDim?]`, values unchanged) with **engine row subtotals** (Total/SubTotal API): the DAX engine re-evaluates every measure at the category grain (ROLLUP) and ships it as an `isSubtotal` child of each category node — the genuine X-only value, correct for ratios. `synthesizeCategoricalFromMatrix` flattens the leaves back into the categorical shape the whole existing pipeline consumes (parse, fx cascade, table, legend, selection ids, highlights, focus), so the migration rewrote nothing load-bearing. `buildMatrixVarianceLookup` harvests the subtotal per **deepest-category-level** node (the level bars are keyed on — last-write-wins role scan; level 0 in the single-field case) into `matrixVarianceByLabel`; `resolveVarianceValues` uses it per measure and falls back to `aggregateVarianceValue` when a key/measure is absent — degraded-but-correct, never a crash.

**The bug that made it "not work" at runtime (1.1.51):** the capabilities `subtotals` block was incomplete — the Total/SubTotal API activates ONLY when **all switch mappings** are defined, and `columnSubtotalsPerLevel` was missing → the whole API stayed silently dormant (no ROLLUP in the query, zero `isSubtotal` nodes, not even a grand total). Additionally `rowSubtotalsPerLevel` defaulted `true`, routing subtotals through per-field toggles nothing ever persists; it must be `false` so global `rowSubtotals: true` drives the query. **The failure is silent** — the host logs nothing; the only way to see it is dumping the matrix tree at runtime. Diagnosed via the on-screen diagnostic overlay (1.1.45–1.1.51, removed in 1.1.52 after runtime confirmation): 16 category nodes, `subChild=none` everywhere, `matrixVarianceByLabel.size = 0`.

**Degraded-but-correct guards (don't remove):** duplicate deepest-level labels across parents (same month under two years → ONE merged bar) evict the key — no engine value exists at a merged grain; non-contiguous category levels bail entirely; both routes land on the fallback rather than a wrong-grain subtotal.

### 21. Format-pane hierarchy is a display-only re-layout of the built model (1.1.60)

**The constraint:** the formattingmodel util binds persistence to the card name (`objectName = card.name` for every slice — §17's cousin, learned the hard way in 1.1.37 when per-measure variance colours pushed into the `rails` card silently stopped persisting). So the pane could never be re-organised by merging cards in settings.ts without breaking every saved report.

**The design:** [src/paneLayout.ts](src/paneLayout.ts) `relayoutPane()` runs AFTER `buildFormattingModel()` (single call site, end of `getFormattingModel`). At that point every slice carries its complete persistence descriptor and the host only ever writes through descriptors — the card/group tree is pure presentation. The module: merges Layout→General and the dynamic varianceMeasure card→Variance, splits the big cards into native-style sub-groups (Values/Title, Colors/Data labels, …), promotes `show` ToggleSwitches to card/group header toggles (`topLevelToggle` + `suppressDisplayName`), and reorders the cards into reading order. Dynamic groups (per-measure, per-category isPillar, per-legend-value, per-arc) are never named in the spec — they keep trailing their host card untouched. **Header-toggle nuance:** the host grays every group when a card's toggle is off; groups whose canvas effect does NOT depend on that `show` must opt out via `inheritDisabled: false` (axis Title groups, yAxis Values/Range, legend Segment labels + dynamic `legend_N` groups — `legend.show` only hides the strip, the segment colours keep rendering). When promoting a new toggle, audit what the renderer actually gates on it first.

**Invariants (pinned by [test/pane-layout.test.ts](test/pane-layout.test.ts)):** descriptor multiset unchanged; `revertToDefaultDescriptors` follow their slices across merges (per-card Reset-to-default); group uids globally unique and deterministic across calls (host pane state is keyed on them); unknown cards stay top-level and unknown slices park at the end of the host card's first group — a future slice can never silently vanish because someone forgot the spec.

**Don't:** move slices between capabilities objects to "clean up" the pane (that IS a persistence break); dissolve a dynamic group in the spec; reuse a group uid.

---

## Constraints (don't violate)

- **No CDN** — everything bundled locally (Microsoft cert requirement)
- **No fetch / XHR external** — Power BI sandbox blocks anything outside localhost dev server
- **No localStorage / sessionStorage** — blocked in Power BI sandbox
- **No eval, no new Function, no innerHTML with raw user data** — security
- **TypeScript strict types** — for cert
- **All XML escaped** — `escapeXml()` helper in visual.ts must be used for any string going into SVG attributes/text

## Reference files (read before suggesting changes)

- [src/visual.ts](src/visual.ts) — Main `IVisual` class (constructor, update, parseDataView, computeLayout, buildSVG, destroy, event handlers)
- [src/settings.ts](src/settings.ts) — `FormattingSettingsModel`, CompositeCards, fx slices, dynamic per-row Groups
- [src/format.ts](src/format.ts) — scale-then-format pipeline, Excel format-string parser
- [src/tooltip.ts](src/tooltip.ts) — pure tooltip payload builder
- [src/yRange.ts](src/yRange.ts) — pure Y-axis range computation
- [src/paneLayout.ts](src/paneLayout.ts) — display-only re-layout of the built formatting model (§21)
- [capabilities.json](capabilities.json) — data roles + format pane object definitions
- [pbiviz.json](pbiviz.json) — manifest (apiVersion, GUID, stringResources)
- [CHANGELOG.md](CHANGELOG.md) — version trail with per-feature rationale

---

**TL;DR**: read this file (CONTEXT.md) for the **why** behind each design decision. The 21 decisions above are load-bearing — understand them before proposing a redesign.

Last updated: 2026-07-04
