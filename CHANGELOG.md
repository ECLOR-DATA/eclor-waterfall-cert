# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [1.1.76.0] — 2026-07-05

### Fixed (legend segments demultiplied by the Table dimension)
- **Legend stacking is now strictly X-axis-grained.** With a legend bound AND a field in the Table (analysisDim) role, each X category fans out into X×legend×analysisDim leaf rows. `buildRowSegments` used to emit **one segment per leaf row**, so every legend value repeated once per analysisDim row — the stacked pillar/bridge showed duplicated slices and the tooltip listed the same legend value several times with demultiplied values.
- Segments are now **aggregated by legend value at the X grain** (Σ over the analysisDim rows), yielding exactly one segment per legend value — the same X-only principle the variance rails already follow, and mirroring the comparison path's `buildPillarSegments`. Bar totals were always correct (`actual` sums the leaves once); only the legend breakdown and its tooltip rows were wrong. Fixes both the cumulative pillar and bridge stacks; the comparison synth-bridge path was already X-grained.

### Tests
- 416 tests (+2): new [test/legend-xgrain.test.ts](test/legend-xgrain.test.ts) — under a legend + Table split, each category exposes one segment per legend value (aggregated across analysisDim rows) and each stacked bar draws one rect per legend value, not one per leaf.

## [1.1.75.0] — 2026-07-05

### Added (dedicated Grand total card + label styling)
- **New "Grand total" format card.** The Grand total controls (show toggle, label text, bar colour) moved out of the General card into their own top-level card, joined by a full **label-style set that is independent of the Pillars card**:
  - **Label color** — the GT value-label text colour (defaults to `#000000`, matching the pillar label so an untouched chart is unchanged).
  - **Font** — family / size / bold / italic / underline for the GT label (defaults to bold 14, the pillar-label look).
  - **Label background** — show toggle + colour + transparency, same pill behaviour as the Pillars/Bridges data-label backgrounds (empty colour ⇒ no pill until you pick one).
- The renderer special-cases the synthetic Grand Total pillar: its value label now reads these slices instead of the Pillars card, so the total can be styled (bigger, coloured, with a background plate) without touching the other pillar labels. GT bar colour and the running-total math are unchanged.

### Changed (persistence)
- `showGrandTotal` / `grandTotalLabel` / `grandTotalColor` moved from the `general` capabilities object to a new **`grandTotal`** object. Reports that had explicitly changed these three GT settings will reset them to default on first load after upgrade (not yet published on AppSource, so no external impact). The pane re-layout ([src/paneLayout.ts](src/paneLayout.ts)) gives the card its native-style hierarchy: show → card header, label text + bar colour up top, a "Data labels" sub-group for the style slices.

### Tests
- 414 tests (+3): migrated every test that drove the GT via `general.showGrandTotal` to the new `grandTotal` object; added two render assertions (GT label reads the dedicated colour / font / background independent of the Pillars card; `grandTotal.showGrandTotal=false` suppresses the GT pillar); updated the pane-layout structure test for the new card. `Visual_GrandTotal` added to both `stringResources` resjson.

## [1.1.74.0] — 2026-07-05

### Removed (diagnostic scaffolding)
- **Removed the legend-persistence diagnostic overlay** (the `DIAGNOSTIC_OVERLAY` flag, its `renderDiagnosticOverlay()` method, and the gated call site in `update()`). It was the temporary top-right on-canvas dump introduced in 1.1.67 to capture the legend-colour revert at runtime. The revert is fixed (numbered metadata slots, 1.1.71) and the round-trip confirmed, so the capture tooling is no longer needed. No behaviour change — the overlay was purely developer-facing and never affected rendering. The shared `extractFill` helper and the metadata-slot design comments (production rationale) are untouched.

## [1.1.73.0] — 2026-07-05

### Changed (Table value colours — simplified to pillar + sign-aware bridge)
- **Removed the fx "Value color"** from the Table card. Its measure-driven conditional formatting (1.1.63) never resolved reliably under the matrix mapping (same opaque-identity drop as the legend colours), so the table now has **exactly two value-colour categories**, both plain pickers (no fx):
  - **"Pillar values color"** — a single colour for every pillar column cell (incl. the synth Grand Total). Defaults to the theme's neutral text colour.
  - **"Bridge positive color" / "Bridge negative color"** — bridge column cells are now **sign-aware**, exactly like the Variance rails: each cell picks the positive or negative colour from its **own value's sign**. Empty pickers fall back to the theme positive / negative.
- HC still overrides all three to the foreground colour. The old "empty picker inherits the global Value color" inheritance is gone — each category theme-defaults independently.
- Dropped the per-cell fx-fill resolution path in `buildAnalysisCells` and the `cachedAnalysisCellFxFills` / `cachedTableBaseColor` caches — dead once the fx slice was removed. The shared pillar/bridge fx cascade (`fxCtx`) is untouched.

### Tests
- 411 tests (−2): removed `test/table-cell-fx.test.ts` (the retired per-cell fx feature); rewrote the value-colour cases in [test/table-style.test.ts](test/table-style.test.ts) to cover explicit pillar / bridge-positive / bridge-negative overrides and the theme-default fallbacks (neutral / positive / negative).

## [1.1.72.0] — 2026-07-04

### Added / Fixed (Legend labels)
- **Per-value legend LABEL and LABEL-BACKGROUND colours now persist**, via the same numbered metadata slots as the item colour (`segmentLabelColor{i}` / `segmentLabelBgColor{i}`, keyed by first-appearance index). They previously used an identity selector, which the host drops under the matrix mapping — same revert bug as the item colour, now fixed the same way.
- **The "Segment labels" pane group is renamed "Legend labels"** and gains a **full font control** (family / size / bold / italic / underline) — the in-bar legend labels no longer inherit the pillar/bridge font; they have their own `segmentLabelFont` (default 10pt), consistent with every other text area.
- The per-value **show / background-on toggles were removed** from each value's sub-block (they didn't persist under matrix and were niche); show-labels and background-on are now driven by the global toggles in the "Legend labels" group, while each value overrides just the three colours (item / label / label-bg).

### Tests
- 413 tests (＋3): new [test/legend-labels.test.ts](test/legend-labels.test.ts) — the segment-label font attributes (size/bold/italic/underline) and per-value colour slots. [test/scenarios.test.ts](test/scenarios.test.ts) legend-label tests migrated from the removed fx-majority path to the metadata-slot path; [test/formatpane.test.ts](test/formatpane.test.ts) asserts each per-value block is exactly the three selector-less colour slots.

## [1.1.71.0] — 2026-07-04

### Fixed (legend colour revert — the actual fix, after two selector attempts)
- **Legend series colours now persist**, via NUMBERED METADATA SLOTS. The 1.1.70 runtime capture (with the 1.1.68 plain-selector fix) proved the pick STILL landed nowhere: `matrix nodes w/ legend.*: 0`, `legendObjRows: [-]`, no `metadata.legend.itemColor`. So BOTH selector attempts failed — the fx `altConstantSelector` (1.1.67) AND a plain `.selector` (1.1.68) — because both carry a matrix-synthesized **opaque identity**, which the host silently drops. Card-level **metadata** properties (no selector) are the one target that always round-trips under the matrix mapping (it's how `titleColor` / `grandTotalColor` already persist). Each legend value's colour now persists to `legend.itemColor{i}` (`i` = first-appearance index, up to 24 values), read back into the swatch/segment fill. **Colours are keyed by legend position** (first-appearance order), not by the value string, so re-ordering the legend field can shift persisted colours — acceptable and matches most tools. Legacy per-node `itemColor` is still read as a fallback. Per-value **segment-label** colours still use the identity selector (persist in the pure-categorical case; niche + off by default — will move to slots if needed).

### Diagnostic (still on — confirm the slot fix, then removed)
- The legend-persistence overlay now dumps each value's `slot=itemColor{i}=<value>` from `metadata.legend`. After a pick, that slot (and the `metadata.legend` line) should populate and match the chart — the round-trip proof. Once confirmed, `DIAGNOSTIC_OVERLAY` → false and the overlay is deleted.

### Tests
- 410 tests (＋2): [test/legend-color-revert.test.ts](test/legend-color-revert.test.ts) adds the metadata-slot round-trip (swatches + segment fills + `itemColor{i}` picker echo, on the matrix shape) and the theme-default override; [test/formatpane.test.ts](test/formatpane.test.ts) asserts the item-colour picker is a selector-less `itemColor{i}` slot while segment-label slices keep the identity selector.

## [1.1.70.0] — 2026-07-04

### Fixed
- **Visualizations-pane icon was blank on import.** `assets/icon.png` was **44×44**; Microsoft's spec requires the in-package pane icon to be a PNG of **exactly 20×20** (see [visual project structure](https://learn.microsoft.com/en-us/power-bi/developer/visuals/visual-project-structure)). A non-conformant size renders blank in the Visualizations pane — certified/downloaded visuals show their icon precisely because they honour 20×20. Re-rasterized from [assets/icon.svg](assets/icon.svg) at 20×20 RGBA (design unchanged). Note: PBI Desktop caches visual icons by GUID — remove/re-add the visual (or restart Desktop) after re-import to clear a previously-cached blank.

### Docs
- **Corrected the icon-spec error in the internal playbook** (repo + global copies): `assets/icon.png` is **20×20** (the pane icon), NOT 300×300. The 300×300 PNG is the **AppSource commercial logo**, uploaded separately in Partner Center — conflating the two is what produced the wrong-sized icon.

## [1.1.69.0] — 2026-07-04

### Added
- **Legend → "Apply to grand total"** (toggle, default ON): controls the Grand Total's legend stacking **independently** of the pillars/bridges "Apply to" scope. So the GT can be coloured by legend while the real pillars stay flat (scope = bridges), or kept flat while pillars stack (toggle off + scope = pillars) — any combination. The GT is no longer tied to the pillar scope it inherited in 1.1.68.

### Tests
- 408 tests (＋1 net): [test/gt-legend-stack.test.ts](test/gt-legend-stack.test.ts) now covers the dedicated GT toggle — stacks independent of scope=bridges, flat when off even under scope=both, and the mixed case (real pillars stacked + GT flat).

## [1.1.68.0] — 2026-07-04

### Fixed (legend colour revert — root cause found via the 1.1.67 runtime capture)
- **Legend colours reverted on every pick because the fx CONSTANT path is dropped under the matrix mapping.** The 1.1.67 diagnostic overlay proved it: after a pick, the colour landed NOWHERE (0 matrix-node objects, 0 legend-column object rows, no `metadata.legend.itemColor`). The per-value pickers used the fx trio (wildcard `.selector` + `.altConstantSelector` + `instanceKind = ConstantOrRule`), and the host silently drops the `altConstantSelector` persist for matrix-synthesized opaque identities. The `isPillar` toggle persists fine with a PLAIN `.selector = {data:[identity]}` (same identity shape), so all per-legend-value slices (item colour, segment-label colour + background, per-value show/bg toggles) now use that proven plain-selector path. **Trade-off:** rule-based conditional formatting is dropped on the legend series colours (never a real use case — bar-level fx still lives on Pillars/Bridges); you pick a constant colour per series, and it sticks.

### Added
- **Grand Total stacks by legend.** The synth GT bar used to stay flat whenever any pillar existed. Its per-legend segments are now computed with the SAME running as the total (a PILLAR resets each legend value to its segment there, absent values reset to 0; a BRIDGE adds its delta), so Σ segments = GT total even across resets. The GT is a pillar, so it follows the legend **"Apply to"** scope: both / pillars → stacked, bridges → flat.

### Diagnostic (still on — confirm the legend fix, then it's removed)
- The 1.1.67 legend-persistence overlay stays gated ON for one more version so the fix can be confirmed at runtime: pick a legend colour, and it should now stick (and the overlay's `legendObjRows` / `matrix nodes w/ legend.*` should populate). Once confirmed, `DIAGNOSTIC_OVERLAY` flips to false and the overlay code is deleted.

### Tests
- 407 tests (＋27 since 1.1.67): new [test/gt-legend-stack.test.ts](test/gt-legend-stack.test.ts) — per-legend running with pillar resets (all-bridge sum, mid-pillar reset, default first/last mirror), Σ segments = GT total, and the Apply-to scope (both/pillars → stacked, bridges → flat). Updated [test/formatpane.test.ts](test/formatpane.test.ts) — legend per-value slices assert the PLAIN selector (no `altConstantSelector` / `instanceKind`). Plus the 1.1.67-era [test/stress-combos.test.ts](test/stress-combos.test.ts) — systematic invariant sweep over 192 combos (categorical + matrix × cumulative/comparison × legend × table × grand total × pillar configs × value signs) + edges (M=1/M=3, zeros, nulls, blanks, single category, staleness sequences, table-focus GT recompute, HC, legend positions). **No product bug surfaced by the sweep** — it pins the invariants against regressions.

## [1.1.67.0] — 2026-07-04

### Diagnostic (temporary — remove once captured)
- **Gated legend-persistence overlay** (`DIAGNOSTIC_OVERLAY = true`, same protocol as 1.1.27): top-right dump of every surface a legend colour can persist to / read from — `metadata.objects.legend` keys+fills, matrix nodes carrying `legend.*` objects, the legend category column's identity/objects coverage, value-column per-row `legend.*` hits, and the EXACT selector each per-value picker hands the pane. Context: the reported "colour pick reverts" bug does NOT reproduce in jest ([test/legend-color-revert.test.ts](test/legend-color-revert.test.ts) proves persisted colours render and echo through `getFormattingModel`), so the failure is in the host round-trip — capture protocol: open the Format pane, screenshot the overlay, pick a legend colour (item / label / title), screenshot again. No blind fix.

## [1.1.66.0] — 2026-07-04

### Added
- **Per-arc "Arrow ends"**: each variation arc's Format-pane sub-block (the 1.1.58 "origin → destination" groups) now carries its own Arrow ends dropdown next to "Show arc" — same persistence targets (destination category in cumulative, destination measure for comparison anchors / no-category), same property name as the global dropdown. An arc without its own pick follows the global; the per-arc dropdown displays the EFFECTIVE value (override ?? global). Unknown/legacy values keep falling back to symmetric arrows.

### Tests
- 380 tests (＋5): new [test/arc-arrow-ends.test.ts](test/arc-arrow-ends.test.ts) — destination-category override vs global (incl. conflicting global), global fallback, per-measure comparison persistence, format-pane group echo with selector.

## [1.1.65.0] — 2026-07-04

### Added
- **Legend → "Apply to"** (Pillars and bridges / Pillars only / Bridges only): restricts the legend's stacked bar colouring to one bar type. An excluded bar ignores its segments and falls back to its Pillars/Bridges card colour — and that card's global colour picker STAYS visible in the pane (it used to be hidden whenever a legend was active, which would have left the fallback uncontrollable). Default "both" = existing behaviour, saved reports unchanged.

### Tests
- 375 tests (＋6): new [test/legend-scope.test.ts](test/legend-scope.test.ts) — stacked-vs-flat rendering per scope × bar type, and the fallback-picker visibility matrix.

## [1.1.64.0] — 2026-07-04

### Added
- **Table → "Pillar values color" / "Bridge values color"**: optional overrides on the footnote table — pillar-column cells (incl. the synth Grand Total) and bridge-column cells can wear distinct colours. Empty picker = inherit the global "Value color"; per-cell fx (1.1.63) still wins; HC wins over everything.
- **Table → full row-label FontControl** (family / size / bold / italic / underline + the existing colour picker) — same UX as every other text area. The bold toggle REUSES the legacy `rowLabelBold` property, so bolds persisted before the control existed keep applying. Row labels no longer inherit the table values font: reports that customised the table font may see row labels return to the theme font at 11px (one-time re-pick in Format → Table → Row labels).

### Tests
- 369 tests (＋4): new [test/table-style.test.ts](test/table-style.test.ts) — per-column-type override resolution, empty-picker inheritance, row-label font attributes, legacy `rowLabelBold` round-trip through the new control.

## [1.1.63.0] — 2026-07-04

### Fixed
- **Table conditional formatting was effectively dead**: the fx cascade patched ONE colour onto `analysisTable.color` and every cell rendered with it. Cells now resolve **per cell** — each reads the fill the fx engine deposited on its OWN leaf row(s) (`values[i].objects[r]` + category-column per-row objects), i.e. the (category × table-row) grain: the table's own values drive the colour, never the bridge/bar aggregate. Multi-leaf cells (Legend split) take the first leaf's fill (the displayed SUM was never rule-evaluated — documented proxy). Synthetic columns (Grand Total, comparison anchors) and no-category mode keep the global colour.
- **Unfilled cells fall back to the user's CONSTANT colour** (captured before `patchFxSlice` — whose last-write-wins pick could put an arbitrary rule colour on the whole table), not to the patched pane value.

### Tests
- 365 tests (＋4, incl. the legend repro pair): new [test/table-cell-fx.test.ts](test/table-cell-fx.test.ts) — categorical (`values[i].objects[r]`) and matrix (`cell.objects` through the synthesis) shapes, constant fallback, synthetic-GT-column fallback. New [test/legend-color-revert.test.ts](test/legend-color-revert.test.ts) — characterizes that persisted legend colours (metadata + per-node itemColor) render AND echo through `getFormattingModel` on a matrix dataview: the client path is sound, the reported revert lives in the host round-trip (diagnostic overlay to follow).

## [1.1.62.0] — 2026-07-04

### Fixed
- **Grand Total never appeared on a default cumulative chart**: the gate required ZERO pillars, but the cumulative default marks first + last category as pillars — so the toggle (default ON) showed nothing: pane said "on", canvas said nothing. The pillar-free requirement is gone; the GT bar now always appends in user-cumulative mode and carries the **final running total** (a pillar resets the running to its absolute value, a bridge adds its delta — same walk as `computeLayout`). All-bridge charts keep the legacy plain-sum value. Comparison configs routed internally to cumulative (synth bridge / no-category) still never grow a GT: their last pillar IS the end state.
- **Analysis-table GT column follows the same running semantics** per table row (pillar column resets, bridge column adds), preserving the invariant Σ cells = GT bar value even with pillars mid-chart.
- **Legend stacking on the GT bar is skipped when pillars are present** — a per-legend running is undefined across a pillar reset (pillar = absolute, bridge = delta); the GT bar stays flat-coloured then.
- Pane/capabilities wording updated: "Show grand total (cumulative)" — the "(no pillars)" qualifier no longer applies. Note: since the toggle defaults to ON, existing cumulative reports now show the GT bar (and its variation arc when arcs are enabled) until toggled off — the pane state finally matches the canvas.

### Tests
- 361 tests (＋5): new [test/grand-total.test.ts](test/grand-total.test.ts) — default-pillar gate, mid-walk pillar reset, all-bridge legacy sum, no-GT-in-comparison guard, table GT column running invariant. Legacy suites pin `showGrandTotal: false` where the GT bar would be noise (bar/arc/arrow counts).

## [1.1.61.0] — 2026-07-04

### Fixed
- **Variance rail data labels sat on the wrong side of the bar**: the label was placed across the centre line from its bar (positive → below the line, negative → above), which read as inverted. Labels now sit at the OUTER TIP of the bar — positive above the bar top, negative below the bar bottom — with the first rail's max-positive label clamped under the SVG top edge so it never clips.

### Tests
- 356 tests (＋2): new [test/rail-labels.test.ts](test/rail-labels.test.ts) — outer-tip placement for both signs + the top-edge clamp on a full-height first-rail bar.

## [1.1.60.0] — 2026-07-04

### Changed (format-pane UX overhaul — display-only re-layout layer)
- **New module [src/paneLayout.ts](src/paneLayout.ts)**: `relayoutPane()` re-arranges the formatting model AFTER `buildFormattingModel()`, so the pane hierarchy is pure presentation while settings.ts / capabilities.json stay the untouched persistence truth (objectName = settings-card name — the 1.1.37 contract). Every slice keeps its descriptor, reset-to-default descriptors follow their slices when cards merge, group uids stay unique and deterministic (the host keys pane expand/collapse state on them). Safety nets: a slice not named in the layout spec lands at the end of its card's first group, an unknown card stays top-level — nothing can silently vanish from the pane.
- **General becomes the chart-wide block**: Waterfall mode + Bar width (the former single-slice Layout card is absorbed) + Show items with no data up top, plus a "Grand total" sub-group gated by its own header toggle.
- **Variance becomes ONE block**: "Layout" (rail height / gaps) and "Data labels" sub-groups, followed by the per-measure colour groups — the separate "Variance — per measure" top-level card no longer appears in the pane (it still exists in the settings model: its name IS the persistence objectName).
- **Native-style header toggles**: `show` promoted to the card header on X axis, Y axis, Connectors, Legend, Table and Variation arc; sub-group toggles for Title (both axes + legend), Gridlines, Data labels (pillars / bridges / rails), Segment labels and Grand total. Groups whose canvas effect survives `show = off` escape the host's card-toggle graying via `inheritDisabled: false` (review catch): axis Title groups (titles render on `showTitle` alone), yAxis Values (units/decimals inherited by every "Auto (Y axis)" data label) and Range (floor offset + broken axis reshape the bars), the legend Segment labels group and the dynamic `legend_N` groups (`legend.show` only hides the strip — segment colours/labels keep rendering).
- **Native-like sub-groups**: X axis (Values / Title), Y axis (Values / Range / Gridlines / Title), Pillars & Bridges (Colors / Data labels — the Colors group auto-drops when an active legend hides the global colour slice), Legend (Options / Title / Text / Segment labels), Table (Values / Row labels / Separators / Layout), Variation arc (Label / Line). Dynamic groups (per-measure, per-category isPillar, per-legend-value, per-arc) keep trailing their host card.
- **New card order = reading order**: General → X axis → Y axis → Pillars → Bridges → Connectors → Variance → Variation arc → Legend → Table.
- **"Arc" card renamed "Variation arc"** (fr **"Arc de variation"**) — disambiguates it from Variance next door in the pane (both resjson + capabilities/settings displayName kept in sync).
- **Pane-path strings tracked**: `Visual_ErrCumulativePillar` (both resjson + the en-US fallback) now points to "Format → General → Grand total" (the old "Show grand total" slice label no longer exists — it became the group's header toggle); the Variation arc card description now references the 'Label' / 'Line' sub-groups instead of the dissolved 'Options' group.

### Tests
- 354 tests (＋15): new [test/pane-layout.test.ts](test/pane-layout.test.ts) — descriptor & reset-descriptor multiset preservation, uid uniqueness + cross-call determinism, unknown-card/unknown-slice survival (the future-proofing net), the full target hierarchy, the `inheritDisabled` escape list, and pipeline integration (variance per-measure absorb with the 1.1.37 objectName contract asserted post-merge, legend-active Colors drop + dynamic-group graying escape, per-arc groups, isPillar trailing groups).

## [1.1.59.0] — 2026-07-03

### Fixed (the four remaining backlog items — audit close-out)
- **Legend high-contrast override (cert-relevant)**: the legend block was the one render region ignoring `isHighContrast` — swatches kept their per-series colours and the label/title colours skipped the HC ternary. Swatches, item labels and the title are now forced to `hcForeground` like the in-bar segment stack; the pinned quirk test in [test/highcontrast.test.ts](test/highcontrast.test.ts) asserts the fix.
- **Comparison M=1 lost its isPillar toggles**: `hideIsPillarToggle` used `cachedPillarMeasureGroups.length > 0` as a synth-anchor proxy, but since 1.1.13.0 the per-measure colour groups exist for EVERY comparison config — so at M=1 (where the renderer synthesizes nothing and the user must mark ≥2 pillars manually) the toggles vanished and the mode was unreachable without pre-persisted pillars. A dedicated `cachedComparisonSynthMode` (comparison + dim + M≥2, set in update() next to the renderer's own gate) now drives the hide; the per-measure colour group still shows at M=1.
- **Display-unit vs format-embedded suffix collision (decision)**: with a multi-pattern format carrying its own literal suffix or percent, an explicit unit pick produced `+2 m€K` (suffix collision) or `+0.0%K` (divide-by-1000-then-×100 double transform). New policy — the format wins verbatim: `multiPatternCarriesAffix()` detects a `%` or a literal text suffix in any section (same `[..]`-strip + `\X`/`"X"` unescaping as the parser) and neutralises the unit pick entirely, mirroring the auto-units rule. Suffix-less multi-pattern formats still scale (`+1.5K` unchanged).
- **Runtime strings localized (audit F3, minimal scope)**: the empty-state prompt (tripled literal hoisted to one constant), the 10k-row data-cap warning and the two mode-error messages now resolve through the host localization manager against `stringResources/{en-US,fr-FR}` (5 new keys in both files) with a guarded fallback to the en-US literal (covers both the undefined-on-miss and key-echo-on-miss API behaviours). The format-pane slice labels stay English by design — a deliberate, documented posture.

### Tests
- 339 tests (＋2): the three pinned-quirk characterizations flipped to fixed-behaviour assertions (legend HC, isPillar M=1, both suffix-collision classes) and a new `localize()` suite (key-echo fallback + resolved-key path).

## [1.1.58.0] — 2026-07-03 (branch `feat/arc-arrow-ends`)

### Added (per-arc visibility + the audit's test-gap backlog closed)
- **Format → Arc → per-arc "Show arc" toggles**: one collapsible sub-block per drawn arc, named "origin → destination", persisted on the DESTINATION pillar — per category in cumulative mode (`{data: [identity]}` selector), per measure for comparison anchors and no-category pillars (`withMeasure(queryName)`). The renderer skips an arc whose destination carries `variationArc.showArc = false`; default = shown, saved reports unchanged. The synthetic Grand Total pillar has no persistence target → its arc has no toggle (always shown). +7 tests (render gate cumulative/comparison, round-trip, dynamic groups, group-name uniqueness, measure selectors).
- **Eleven audit test gaps closed, +86 tests across 10 new suites** (337 total): `layout` (computeLayout running-total engine, pillar y0/y1 signs, both zero-crossing clips, comparison anchors, minRunning), `keyboard` (arrow/Home/End nav with wrap-around, Enter/Space/legacy-Space selection, multi-modifiers, Escape, the allowInteractions gate — WCAG/cert), `highcontrast` (bars/rails/texts/label-pills/connectors/arcs forced to the HC palette, with a non-vacuous HC-off control), `brokenaxis` (wf-break masks + diagonals + yScaleClamped floor anchoring, offset-0 and toggle-off gates), `selection-visuals` (the three-signal AND-gate incl. the table-row-origin guard with its counterfactual), `arclabels` (auto-pct/abs/both, legacy measure-N routing, zero-baseline guard), `formatpane` (dynamic legend/cat_N/var_ groups, legendActive slice hiding, Group.name global-uniqueness invariant — gotcha #17), `comparison-m3` (the never-asserted Σbridges-per-block = Δpillars invariant, M=4 blockSize guard), `format-multipattern` (multi-pattern × explicit units characterization incl. the pinned "+2 m€K" suffix collision), `perf` (the playbook-mandated 10k-row budget: full update < 1 s on 10k matrix leaves, parse+layout < 1 s on 10k unique categories, PERF-1/2/6 shapes).
- **Test harness extracted to [test/_harness.ts](test/_harness.ts)** (mock host, Visual factory, dvBuild/mtxBuild) so every suite shares one fixture vocabulary.
- Suites documented five pinned quirks for the backlog (legend block has NO high-contrast override — cert-relevant; comparison M=1 hides the isPillar toggles the mode still needs; the two format suffix-collision classes; preventDefault fires before the allowInteractions gate).

## [1.1.57.0] — 2026-07-03 (branch `feat/arc-arrow-ends`)

### Changed (audit lot 4 — duplication; −184 net lines, output byte-identical, 244 tests green)
- **One `sumOrNull` helper** replaces the sum-with-presence tooltip aggregation copy-pasted five times (parse, focus, no-category, comparison synth, grand total) — same null/undefined/NaN guards, "no data ≠ 0" semantics preserved.
- **`drawSegmentStack`** — the ~55-line stacked-segment renderer duplicated between the pillar and bridge branches of buildSVG becomes one closure (parameterised by font/units/decimals/withSign); pillar labels still route under the break mask, bridge labels still wrap in their click-resolving group.
- **`scanRowsForFill`** dedupes patchFxSlice's four per-row scan loops — the documented 4-layer cascade ORDER is untouched and the chaining stays falsy-fallthrough (`""` keeps cascading; `??` would have stopped on the `{value: ""}` persistence shape). `valueRowObjectsArr` hoisted out of the closure (was re-materialised on each of its 11 calls).
- **Shared parse builders**: `buildRowSegments` (parseDataView + buildFocusedCategory's hand-maintained mirror), `buildActualMeasureBase` + `buildTooltipMeasures` (parseDataView + parseNoCategory column mapping), the three inline clones of `formatActualForTooltip` now call the method.
- **`readFontConfig`** replaces the readFont/readTitleFont twins (11 call sites); **`safeHex`/`safeHexOrEmpty` move to format.ts** (tooltip.ts's divergent local copy deleted, its trim behaviour preserved at the call site); **focus-nav unified** (`focusSiblingIn`/`focusAtIn` for bars AND table rows); **`mapSelectedAdimRows`** shared by applySelectionVisuals + refreshFocusFromSelection.
- **settings.ts factories**: `makeDisplayUnitsDropdown` (×5), `makeDecimalPlaces` (×5), `makeLabelBgShow`/`makeLabelBgTransparency` (×4) — and the exported `DISPLAY_UNIT_VALUES` list is now single-sourced with visual.ts's validation whitelist and the dynamic per-measure dropdowns.
- **Named consts for the magic numbers**: `CHAR_W_RATIO` (six 0.55 font-metric literals), `FOCUS_RING_COLOR`, a `clamp()` helper (decimals/transparency clamps ×12), and an `isComparisonUserMode` getter for the five mode reads.

## [1.1.56.0] — 2026-07-02 (branch `feat/arc-arrow-ends`)

### Changed (audit lot 3 — cleanup; output byte-identical)
- **`formatActualLabel` drops its never-read `autoScale` option** (DC-03): the parameter was kept "for signature compatibility" but the destructure omitted it — the pipeline derives the scale from `cardUnits` + `dataMaxAbs` internally. All 17 call sites cleaned (several fabricated throwaway `getDisplayScale()` computations per label, including one inside the analysis-table row loop); the playbook's scale-then-format snippet updated to the real signature.
- **Dead exports/imports removed from tooltip.ts** (DC-01/02): the `void formatVarianceValue` unused-import keeper (with its factually wrong "tree-shaking" comment) and the `_formatActualForTooltipInternal` re-export that never gained an importer (visual.ts's own variant is a deliberately different, thinner formatter for ARIA labels).
- **Obsolete host casts removed** (F2): `hostCapabilities.allowInteractions`, the full `colorPalette` structural type and `displayWarningIcon` are all typed by `powerbi-visuals-api` 5.11 — three `as unknown as` casts deleted; the one remaining cast (synthesized `DataViewValueColumns` branded array) now carries a comment stating why it's deliberate.
- **Ghost comments de-staled** (DC-04/05/08, F4): the orphaned 24-line `formatActualLabel` doc block left behind by the format.ts extraction; four comments still describing the dead 1.1.44 "co-resident matrix facet" design as current; two references to the `colorBridgeLabelPos/Neg` bridge slices removed in 1.0.53; two references to the 1.1.52-deleted diagnostic overlay and to "innerHTML rewrites" that never existed in the DOMParser/replaceChildren pipeline.
- **`tools/audit-render.mjs` runs again** (DC-07): the PNG step's `@resvg/resvg-js` import crashed the whole tool (`ERR_MODULE_NOT_FOUND` — never a devDependency). The SVG always writes; the PNG is a dynamic import that skips gracefully with an install hint (native-binary package kept out of `npm ci` on purpose). Docs updated (playbook §3.7, repo + global copies).
- **Formatting-model drift fixed** (FM-4/5): the `defaultSource` items list was re-assigned per `getFormattingModel()` call with a byte-identical literal (leftover of the pre-1.0.83 dynamic presets) — settings.ts is now the single source; two dead fallback constants realigned with their slice defaults (`labelOrientation` "horizontal", `maxHeightPct` 30).

## [1.1.55.0] — 2026-07-02 (branch `feat/arc-arrow-ends`)

### Changed (audit lot 2 — performance; zero behaviour change by construction)
- **Resize fast path** (PERF-6): a PURE `Resize`/`ResizeEnd` update (Data bit absent) now re-runs only layout+render from the cached parse instead of the full pipeline (matrix walk → parse → selection ids → analysis cells) on every tick of an interactive resize. Deliberately conservative gate: any other bit (Data, Style/theme, ViewMode…) or an undefined `options.type` falls through to the full path — format-pane changes carry the Data bit and are unaffected.
- **Selection ids built lazily** (PERF-3): the eager per-leaf-row id arrays cost up to 10 000 host builder round-trips per update under a Table/Legend split, while only the per-category representative is needed until an actual click/Enter. The full union is now built at interaction time (`getCategorySelectionIds`, memoised per parse) via a new `parseCatIdx` carried on the display info — which survives the comparison-mode spread (whose `categoryIndex` is a synthetic block index), so bridges keep selecting every contributing row; synth anchors/no-category entries keep their prebuilt ids.
- **fx resolution short-circuits when no per-row fx exists** (PERF-5): `resolveCategoryFx` ran 8 props × (sum + 2 tallies) full row-scans per category even with zero persisted fx objects (>1M wasted probes per update at the cap). A `hasRowObjects` precomputation returns the identical all-undefined result immediately; the documented sign-aware vote is untouched when fx IS present.
- **Cross-highlight remap and empty-category drop de-quadratified** (PERF-1/2): `indexOf`/`includes` linear scans inside row loops become Map/Set lookups with identical keys — O(rows) instead of O(rows × uniqueCats) during cross-highlights and O(U²) on sparse datasets.
- **Tooltip payload memoised per hover target** (PERF-7): mousemove fires at pointer frequency and rebuilt the identical items + formatters per event; the payload is now cached per bar/cell and invalidated on every re-render and on mouse leave. +4 tests (244 total: lazy union multi/single-row + memoisation, pure-Resize skips the parse, Resize-without-cache full path, tooltip rebuild count per target).

## [1.1.54.0] — 2026-07-02 (branch `feat/arc-arrow-ends`)

### Fixed (audit lot 1 — the four confirmed bugs)
- **fx fills reach the SVG attribute-escaped** (audit F1): the fx-resolved / DataView-persisted colours (rails colorPos/colorNeg, pillar/bridge per-category fills, legend segment + swatch colours, label backgrounds, every `fontAttrs` text fill) were injected verbatim — a conditional-formatting "Field value" rule makes the fill a data-derived arbitrary string, and one stray quote broke the attribute → DOMParser `parsererror` → the frame silently froze. Every site now routes through `escapeXmlAttr` (same helper the font-family already used): zero behaviour change for valid colours, breakout impossible. The variation-arc path already validated via `safeHex` and is unchanged.
- **Legacy reports no longer crash the render** (audit FM-1 + the mechanism proven while testing 1.1.53): a report saved on 1.0.69–82 with a persisted `variationArc.defaultSource = "measure-N"` resolves to an out-of-items enum → the formattingmodel util leaves `slice.value` **undefined** → the bare `.value.value` read threw and the visual rendered NOTHING. Every ItemDropdown read (mode, orientations, display units ×5, dashes, gridline/separator styles, legend position, arc label source) now optional-chains to its default. The stale capabilities enum is also cleaned: `defaultSource` now declares exactly the three live values (`auto-abs`/`auto-pct`/`auto-both`, displayName "Label contents") instead of the pre-1.0.83 set that was missing the actual default.
- **`barWidth` / `connectorWidth` clamped** (audit FM-3): the only two NumUpDowns without pane min/max — a typed negative reached the SVG as an invalid negative width (bars silently vanish). Pane bounds added (5–300 / 1–10) + render-side floor at 1 for values persisted before the clamp existed.
- **The 1.1.8.0 "Variance" card rename finally shows** (audit FM-2): the localized `Visual_Rails` resjson value ("Variance rails" / "Rails de variance") takes precedence over the settings.ts displayName in every locale, so the pane still showed the old name. Both resjson values updated to "Variance". +4 tests (240 total: attribute-breakout frame parses, legacy `measure-2` renders with the auto-both label, negative widths clamped, resjson rename guarded).

## [1.1.53.0] — 2026-07-02 (branch `feat/arc-arrow-ends`)

### Added (variation arc: choose which end carries the arrow head)
- **Format → Arc → "Arrow ends"** — new dropdown selecting where the bracket's downward arrow heads render: **Both pillars** (default — the historical symmetric look, saved reports unchanged), **Start pillar only** (departure) or **End pillar only** (arrival). The arrow-less drop line then runs all the way to its anchor, exactly like `Arrow size = 0` does. Honors the per-pillar anchor logic (arrow lands just above the value label when it renders above the bar) and high-contrast mode unchanged.
- Defensive read of the new dropdown: the formattingmodel util resolves a persisted enum through `items.find()`, so an out-of-items value leaves the slice value `undefined` — the reader optional-chains and falls back to "both" instead of throwing mid-render (a latent pattern found while testing; the audit tracks the same hazard on the pre-existing dropdowns). +5 tests (236 total: both/default/explicit, start-side tip position, end-side tip position, unknown-value fallback).

## [1.1.52.0] — 2026-07-02 (branch `feat/matrix-subtotals`)

### Removed (X-only variance CONFIRMED at runtime → diagnostic scaffolding retired)
- **Runtime confirmation received (PBI Desktop, real report):** with 1.1.51 the engine ships the row subtotals and the `%` variance rail shows the X-grain value, insensitive to the Table split. The **diagnostic overlay** (1.1.45.0 → 1.1.51.0) is removed as planned: `renderDiagnosticOverlay`, the `showDiagnostic` toggle (settings + capabilities `general` object) and the `DIAG_BUILD` const. No behavior change — the overlay was dev-only, default OFF.

### Docs
- **[CONTEXT.md](CONTEXT.md) §20** — the full variance-X-only design decision: why a ratio can't be reconstructed client-side, the two dead ends (co-resident facet = wrong grain; second dataViewMappings = query-generator crash), the working design (matrix mapping + Total/SubTotal API + deepest-level harvest + fallback guards), and the silent capabilities-activation bug that kept it broken until 1.1.51.
- Portable lessons recorded in the internal playbook: multiple `dataViewMappings` are alternatives (never simultaneous queries), and an incomplete `subtotals` block silently disables the whole Total/SubTotal API (all six switch mappings required; `rowSubtotalsPerLevel` must be `false` unless per-level props are actually persisted).
- Contributor notes — the matrix mapping + `subtotals` block are load-bearing and fail silently (see [CONTEXT.md](CONTEXT.md) §20).

## [1.1.51.0] — 2026-07-02 (branch `feat/matrix-subtotals`)

### Fixed (the host was never computing subtotals — the capabilities `subtotals` block didn't satisfy the Total/SubTotal API's activation contract)
- **First runtime screenshot of the matrix mapping (1.1.50 overlay) proved the engine ships ZERO subtotal nodes** — 16 category nodes, no `isSubtotal` child anywhere, not even a grand total → the X-grain lookup was empty on EVERY shape and all variance rails silently used the leaf-aggregate fallback (additive looked right by coincidence, `%`/ratio showed the first Table leaf). Root cause per the official Total/SubTotal API doc: *"The API is automatically enabled for a visual whenever the subtotals structure and **all switch mappings** are defined"* — our block was missing the **`columnSubtotalsPerLevel`** switch (and its `perColumnLevel` object property), so the whole API stayed dormant and the query never got its ROLLUP. Also flipped **`rowSubtotalsPerLevel` default to `false`** (doc/sample value): `true` put subtotals on the per-field toggle path whose per-level properties nothing ever persists — global `rowSubtotals: true` now drives the query directly. No `dataViewMappings` change (the 1.1.46 crash lesson), no new UI, client code untouched.
- Diagnostic overlay header now reads its build from a `DIAG_BUILD` const bumped with the version (the stale hardcoded "1.1.49" label on the 1.1.50 build cost a confused round-trip).

## [1.1.50.0] — 2026-07-02 (branch `feat/matrix-subtotals`)

### Fixed (multi-level Category no longer loses the X-only variance — the harvest follows the bars to the DEEPEST category level)
- **The 1.1.49 "expand-all bail" silently sacrificed `%`/ratio variance rails on every multi-level Category shape** (expanded date/user hierarchy, drill "Expand all", 2+ fields in the Category bucket): the subtotal lookup returned empty, every rail fell back to the leaf aggregate — additive measures still looked right (sum of leaves = X total) but a non-additive measure like `Proforma % = DIVIDE([Δ Proforma],[Proforma])` showed the FIRST Table-member's leaf value instead of the X-grain ratio. The harvest now **walks down to the deepest category level** — the level the parse keys the bars on (last-write-wins role scan) — and reads THAT node's engine subtotal (`isSubtotal` child first, own values second), which is the full category-path grain = the bar grain. `isSubtotal` nodes are skipped at every depth (grand total + per-level rollups), duplicate deepest labels across parents (Jan under 2025 AND 2026 → one merged bar) are still evicted to the fallback (no engine value exists at a merged grain), and non-contiguous category levels (legend/adim interleaved) still bail — degraded-but-correct, never wrong-grain. Root cause confirmed line-by-line against 1.1.49; the fix also hardens the composite (field-parameter) single-level case: the shared `resolveMatrixHarvestTarget` helper keys the harvest on the **last category-role source** exactly like the parse, instead of hardcoding source 0.
- **Diagnostic overlay upgraded for one-glance runtime forensics** (dev-only, removed before cert): prints the harvest target (`level`/`srcIdx`/`catLevels`) and any **BAIL reason verbatim**, dumps the member nodes AT the harvested level (key + own values + subtotal child — exactly what the lookup walks, via the same shared key helper instead of the diverging `c.value ?? levelValues[0]` shortcut), and lists the first lookup keys next to the parsed labels so a key/label mismatch is directly visible. +3 tests (231 total: deep-level subtotal wins over first leaf and over the wrong-grain Year subtotal, duplicate-label eviction at the deep grain, deepest-level-is-leaf own-values path).

## [1.1.49.0] — 2026-07-01 (branch `feat/matrix-subtotals`)

### Changed (the visual now reads a MATRIX DataView — variance rails are X-only, like the fx colours)
- **The whole visual migrated from a categorical to a `matrix` dataViewMapping** (`rows = [category, legend?, analysisDim?]`, `values = [actual, variance, tooltips, grandTotalLabel]`) **with engine row subtotals** (Total/SubTotal API, always on, no new UI). This is the same move that fixed the conditional-formatting colours: let the ENGINE compute the per-X result and read it from where it lands. Power BI now re-evaluates each variance measure **at the X grain** (rolling up the Table/Legend split) and ships it as the category node's subtotal — the rail shows that value verbatim: **strictly dependent on the X-axis dimension, no recalculation over the Table dimension, no DAX change, correct even for non-additive `%`/ratio measures** (it's an engine ROLLUP, not a client-side sum — which is mathematically impossible for a ratio).
- **Zero rewrite of the hard-won pipeline:** a new adapter (`synthesizeCategoricalFromMatrix`) flattens the matrix leaves into the exact categorical shape the existing code consumes — parse, 4-layer fx cascade, format-pane persistence, legend, footnote table, selection ids (real node identities + identityFields), highlights, focus/replay all run unchanged. The X-only subtotal is harvested per category node (`isSubtotal` child first, node's own values second — `rowSubtotalsType` agnostic; grand-total node skipped) into the existing `matrixVarianceByLabel` carrier; when no subtotal exists the rail falls back to the 1.1.43 leaf aggregate — never worse, never a crash (every read optional-chained).
- **Composite (field-parameter) levels safe:** the adapter and the subtotal harvest share one group-value helper (`levelValues` by `levelSourceIndex`, `node.value` only when levelValues is absent), so their keys can't diverge and field parameters in the Table role keep working.
- The diagnostic overlay now dumps the rows hierarchy (levels→roles, per-X node: own values vs `isSubtotal` child) **and the fx-persistence layers** (node/cell `objects` counts) to verify the runtime shape. The 1.1.48 full-screen probe is removed.
- **Review hardening (8 confirmed findings fixed):** (1) *drill "Expand all" / 2+ fields in Category*: several hierarchy levels carry the category role while bars are keyed on the deepest one — the subtotal harvest now **bails to the leaf aggregate** for that shape instead of handing a bar the subtotal of an unrelated same-named node one level up (e.g. region "France" vs country "France"); (2) two distinct level-0 members stringifying to the same key (null vs `""`, sub-second datetimes) merge into one bar — the harvest evicts the key so the merged bar falls back instead of showing only the last member's subtotal; (3) `update()` no longer mutates the host's DataView (a cached host object could have masked fresh matrix data with a stale graft) — the synthesis lives on a local shallow wrapper rebuilt every update; (4) the data-reduction warning now tracks the flattened LEAF row count (it keyed on unique-X count and would never fire under a Table/Legend split). +15 tests (228 total: adapter parity, subtotal child/own-values/fallback, grand-total skip, legend level, highlights, measures-only, empty, composite level, the user's `%` scenario, expand-all bail, merged-key eviction, fx node-objects layer, fx cell-objects layer).

## [1.1.48.0] — 2026-07-01 (branch `feat/matrix-subtotals`, probe — superseded by 1.1.49.0)

### Added (throwaway diagnostic probe)
- Switched capabilities to a single matrix mapping + subtotals and dumped the node structure full-screen to confirm the runtime shape before the real migration. Not for release.

## [1.1.47.0] — 2026-07-01

### Fixed (HOTFIX: 1.1.46 crashed Power BI's query generator — visual would not render)
- **The separate `matrix` `dataViewMappings` object introduced in 1.1.46.0 crashed Power BI Desktop's query generation** (`TypeError: Cannot read properties of undefined (reading 'additionalProjections')` in `QueryGenerator.rewriteQuery`), so the visual failed to render at all — even with no Table dimension bound. A second mapping that re-projects the same `variance`/`category` roles is not a supported shape for this host. **Reverted to the single categorical `dataViewMappings` object** (the 1.1.43-equivalent shape that renders reliably). The matrix-reader code + diagnostic overlay remain in place but dormant (no matrix facet arrives → the variance rails use the per-X categorical aggregate, exactly as in 1.1.43). The X-only delivery mechanism is being reworked with a non-crashing approach.

## [1.1.46.0] — 2026-06-19

### Fixed (variance rails now genuinely X-only — matrix moved to its OWN dataViewMapping)
- **Root cause found via the runtime diagnostic:** the co-resident `matrix` facet (1.1.44.0) *was* populated by Power BI, but at the **wrong grain**. Because `categorical` and `matrix` shared one `dataViewMappings` object, the host built a **single query** grouped by every bound dimension (Category **and** the Table/`analysisDim`) — so `matrix.rows.root.children` came back at the `(X × member)` grain (e.g. 30 rows keyed by *Product*, not 5 keyed by *Country*). The X-keyed lookup never matched, so every rail silently fell back to the old per-X aggregate. **Fix:** the `matrix` facet now lives in a **separate `dataViewMappings` object** whose query references only the `category` role → the engine groups by X alone (ignores the Table/Legend split) and ships one row per X-category with the true X-only variance. Power BI emits both data views ("each valid mapping produces a data view"); `update()` now picks the categorical-populated view as primary and grafts the matrix facet from whichever sibling view carries it (order-independent). This delivers the strictly-X-only variance the user asked for, with **no DAX change**.
- The diagnostic overlay (1.1.45.0) is still present (bumped label to 1.1.46) so the fix can be confirmed at runtime — it is removed before the cert sync.

## [1.1.45.0] — 2026-06-19

### Added (TEMP — diagnostic overlay, dev-only, removed before cert)
- **Format → General → "Diagnostic overlay (debug)"** (default OFF). When ON, renders an on-screen dump of the runtime DataView so we can SEE what Power BI actually sends: how many `options.dataViews[]` and which facets each carries, whether the co-resident `matrix` facet is populated (its `valueSources` queryNames + per-X row values), the categorical variance columns + the per-`(X×member)` leaves the old aggregate worked from, and the final rendered `varianceValues` per X (with the matrix lookup beside them). This is throw-away scaffolding to end the guessing on the "variance changes when a Table dim is bound" report — **it is removed before the certification sync.**

### Fixed (matrix variance reader hardened against silent fallback)
- **The X-only matrix reader (1.1.44.0) could silently drop the engine value even when the host populated the facet.** Two traps closed: (1) when the matrix `valueSources` carry a different `queryName` than the categorical variance column for the same measure (aggregation-wrapping / field-parameter indirection), queryName matching failed for every column and the whole lookup fell back to the leaf aggregate — now, when nothing matches by queryName **and** the column counts agree, it falls back to **position** mapping (both facets select the same `variance` role in projection order). (2) Added a bounds + integer guard on the matrix cell column index so a malformed `values` key can't read out of range. +1 test (213 total).

## [1.1.44.0] — 2026-06-19

### Fixed (variance rails are now truly X-only — the engine evaluates them at the X grain)
- **Binding a Table dimension no longer changes the variance values.** Until now the categorical DataView only shipped the `(X × member)` leaves, so the rail had to *reconstruct* the X value from them (sum for additive measures, representative for non-additive) — and a measure that genuinely varies per Table member had **no** recoverable X value anywhere in the DataView. The visual now declares a **co-resident `matrix` facet** (`rows = [category]`, `values = [variance]`) in the same capabilities mapping: Power BI's DAX engine **re-evaluates each variance measure at the X (category) grain**, ignoring the Table/Legend split, and ships that value on `dataViews[0].matrix`. parseDataView reads the X-only value from there and the rails show it verbatim — strictly dependent on the X axis, **with no recalculation over the Table dimension** and **no DAX change required** on your side. The table-row **focus** path reuses the same X-grain value, so focusing a member no longer recomputes the variance either.
- **Graceful fallback:** when a host doesn't populate the matrix facet, the rail silently falls back to the previous per-X aggregate (`aggregateVarianceValue`) — behaviour is identical to 1.1.43, never worse. Alignment between the matrix columns and the variance measures is by **queryName** (not column order), so multiple variance measures map correctly.
- **Rail scale unchanged in spirit:** `vm.maxAbs` still tracks the **displayed** per-X values (now the matrix value), so the 1.1.41/1.1.43 "bars vanish" fix keeps holding. The per-measure variance colour/format card is untouched (it still reads the categorical column's `source.objects`).

### Fixed (currency-rounded table-independent measures no longer double)
- **Loosened the all-equal detector from `1e-9` to `1e-6` relative.** A table-independent measure whose per-member leaves differ only by display/currency rounding (e.g. `150000.4` vs `150000.5` after `ROUND`) was mis-classified as additive and **summed** (×N). `1e-6` tolerates rounding noise while genuinely additive members (differing by real magnitude) still sum. This is the no-matrix fallback path; the matrix facet above supersedes it when present. +6 tests (matrix X-grain wins, no-matrix fallback, queryName alignment, maxAbs follows matrix, null passthrough, 1e-6 tolerance).

## [1.1.43.0] — 2026-06-19

### Fixed (regression: variance rail bars vanished under a Table/Legend split)
- **The positive/negative variance rail bars disappeared (sub-pixel) when a Table dimension was bound** — a regression from the 1.1.40/1.1.41 aggregation change. The bar scale `vm.maxAbs` was computed over the **raw per-(X × member) leaf** values, while the bars now plot the **aggregated per-X** value; when the per-X aggregate was much smaller than the largest single leaf, `value / maxAbs` collapsed to near-zero and the bar became invisible. `vm.maxAbs` is now recomputed over the **displayed per-X values** (after aggregation), so every bar scales to the actual displayed range — the tallest X fills the rail, the rest are proportional. Works for additive (sum) and representative (`%` / per-X) measures, cumulative and comparison modes. **Side-effect (intended):** the variance label's auto K/M/bn unit now also tracks the displayed magnitude instead of the raw-leaf magnitude. +2 tests.
- **Note on the variance values:** the aggregation itself is unchanged and is as correct as the DataView allows. If your variance still reads wrong under a Table split, the measure genuinely **varies per table member** (a `%`/ratio whose DAX includes the member's filter context) and Power BI never ships its value re-evaluated at the X grain — author it table-independent, e.g. `CALCULATE([Variance], REMOVEFILTERS('YourTableDim'))`, so its leaves become identical and it reads exactly here (the 1.1.41 per-X detector then picks it up).

## [1.1.42.0] — 2026-06-19

### Changed (table row separators are now symmetric)
- **The table row-separator lines reached almost to the visual's left edge (~4 px) while leaving a ~30 px margin on the right**, which looked lopsided. The left margin now equals the right margin (`padRight`), so each divider is symmetric — it still underlines the row headers but stops short of the left edge by the same gap it leaves on the right.

## [1.1.41.0] — 2026-06-19

### Fixed (variance rail now table-independent for per-X measures, not just %-formatted)
- **Generalised the 1.1.40.0 fix: the variance rail is meant to depend only on the X axis, so binding a Table/Legend dimension must not change it.** 1.1.40.0 keyed only off a `%` format string, which missed per-X measures formatted as plain numbers. The detector is now value-based: when a variance measure returns an **identical value on every (X × member) leaf** — the signature of a per-X / table-independent measure — the rail shows that value **verbatim** (the breakdown can't change it), instead of summing it ×N. Additive measures (members genuinely differ) still **sum**, so they stay aligned with the bridges. `%`-formatted measures are still treated as non-additive. The variance bar's positive/negative colour follows this same table-independent value. Applies to the normal and table-row-focus paths. +1 test.
- **Known limit:** a non-additive measure that genuinely *varies* per Table member (e.g. a `%` whose DAX includes the member's filter context) has no per-X value anywhere in the DataView — PBI never ships the measure re-evaluated at the X grain. Author such a variance to be table-independent (e.g. `CALCULATE([Variance], REMOVEFILTERS(TableDim))`) so its leaves become identical and it reads exactly here.

## [1.1.40.0] — 2026-06-16

### Fixed (variance rail value didn't match the X axis under a Table/Legend split)
- **A `%` / ratio variance measure showed an inflated value (and so a wrong `%`) when a Table dimension (`analysisDim`) or Legend was bound.** Binding the Table splits each X-category into `(X × member)` DataView rows, and the rail was **summing** the variance across all members — valid for additive amounts, but mathematically invalid for a non-additive ratio (three `+5%` regions → `+15%`), so the rail no longer corresponded to the X dimension. Power BI ships only the per-member leaf values, never the measure re-evaluated at the X grain (the categorical DataView exposes no per-group aggregate), so the true per-X `%` is unrecoverable. A `%`-formatted variance now shows the **representative member value** (first non-null leaf) instead of the sum — exact when members share the `%` (the common case), otherwise one real member's value, never an impossible sum. **Additive (non-`%`) variances keep summing**, so they stay aligned with the bridges. Applied to both the normal and table-row-focus aggregation paths. +4 tests.

### Verified (no format is forced — the `%` is the measure's own)
- **Audited every value-label format site** (pillars, bridges, variance rails, variation-arc, analysis-table, tooltips): none force a format. The `%` only ever comes from the measure's own DAX format string (`isPct = pattern.includes("%")`), the `+#,0;-#,0;0` default removed in 1.1.12.0 is still absent, and the `"auto" units + a model format ⇒ no K/M scaling` policy is intact. The perceived "forced %" was the measure's real format applied to the wrong (summed) value above — fixing the aggregation fixes it. The only hardcoded format is the variation-arc's opt-in **Auto Δ%** label (a derived ratio with no measure format to honour) — left as-is by design.

## [1.1.39.0] — 2026-06-16

### Changed (variation arc no longer overlaps the pillar value labels)
- **The variation-arc bracket (drops + down-arrows) reached the pillar TOP, sitting right on top of each pillar's value label** (`yTop − 8`) — in comparison mode the arrows and the value labels overlapped and were hard to read. Each arc end now anchors **just above the pillar's value label when that label is rendered above the bar**, so the bracket floats clear of the labels (the standard pro-dashboard look). The clearance is **adaptive**: it reuses the existing `fitsAbove` test, so when the value label flips INSIDE the bar (small viewport / pillar near the top) or pillar labels are off, the arrow points to the pillar top exactly as before. No new setting; the lifted arc stays within the already-reserved arc headroom (the tallest pillar — the only clip risk — never has its label above, so it isn't lifted).

## [1.1.38.0] — 2026-06-16

### Fixed (variation-arc conditional-formatting colour was stale on filter change)
- **A measure-driven conditional-formatting rule on the variation-arc label colour / label background (e.g. ">0 green else red") stopped updating when a filter changed the value** — the colour stayed on the previous result until the Format pane was re-opened. The arc read its colour from the format-pane slice value (`s.variationArc.labelColor/labelBgColor.value.value`), a single frozen representative fill that only refreshes when the model is re-populated, rather than from the current DataView's per-data-point resolution. The arc now resolves its label/background colours **per category, fresh every render** (via the same `resolveCategoryFx → fxAcrossRows` path bridges and pillars already use), keyed on the **destination pillar** of each arc — so the rule re-evaluates immediately on any filter/slicer change. Falls back to the global slice colour for synth-anchor arcs (comparison mode / no category), and the high-contrast + empty-background short-circuits are preserved. +1 render test (arc bg follows the destination pillar's fill and flips when it changes) + 2 parametrized parse cases.
- **Audited every other fx colour site** while here: bridges and pillars already resolve fresh per render (`cat.bridgeColor`/`cat.pillarColor` first, slice only as fallback — verified, not stale); the legend per-segment colours resolve fresh via `legendFxMajority`; the analysis-table value colour is a single global picker (no per-row rule binding) and is correctly read verbatim. The arc was the only stale site.

## [1.1.37.0] — 2026-06-15

### Fixed (per-measure variance rail colours were ignored)
- **The per-measure colour pickers in the Variance card (positive/negative bar, label, label background, title) did nothing — the rails stayed on the theme positive/negative defaults.** The per-measure colour groups were being injected into the **`rails`** card, so Power BI tried to persist `colorPos`/`colorNeg`/… under the `rails` capabilities object, which has no such properties → the picks were silently dropped, and the renderer (which reads `values[i].source.objects.varianceMeasure.*`) never saw them. The groups are now injected under a card whose name is **`varianceMeasure`** (matching the capabilities object the renderer reads), and the per-measure selector uses the same `withMeasure(queryName)` builder as the working per-measure pillar colours, so each pick persists on the value column's `source.objects.varianceMeasure` and applies. +1 regression test (per-measure slices land under the `varianceMeasure` card, not `rails`; no duplicate card on re-render).

## [1.1.36.0] — 2026-06-15

### Changed (table row headers)
- **Row labels are no longer bold by default** (`rowLabelBold` default flipped to `false`). Users who want bold row headers can still enable it in Format → Table.
- **Row separator lines now extend left to span the row-header column**, not just the value cells — the divider starts at the left edge of the row-label column instead of at the chart's left padding, so each table row is fully underlined including its header.

## [1.1.35.0] — 2026-06-15

### Fixed (font dropdowns showed blank instead of the theme font)
- **After 1.1.34.0 the font-family dropdowns rendered empty** (the empty default introduced to avoid forcing a font left the picker blank, which reads as broken). The font default is now the **report theme font, shown selected** in every font dropdown: at `update()` the visual reads the family the host applies to its container (`getComputedStyle`), maps Power BI's internal `wf_standard-font` token to **Segoe UI**, skips generic keywords, and falls back to **Segoe UI** when unavailable — then sets it as the default on all 11 font controls (axis + titles, bridges, pillars, rails, table, legend + title, arc) via the same `applyThemeFont` mechanism used for theme colours, only when the user hasn't picked a font. So the picker is never blank, shows the theme font, and the chart matches it; an explicit user pick still applies. +2 assertions (post-`update()` font pickers are non-empty).

## [1.1.34.0] — 2026-06-15

### Fixed (table row-label bold could blank the visual)
- **Toggling bold on the table row labels while the table's card-level font bold was also on blanked the chart / froze it on the previous frame.** The row-label `<text>` received `font-weight="bold"` from BOTH the card font (`fontAttrs`) and the dedicated `rowLabelBold` toggle → a **duplicate attribute**, which makes the SVG fail `DOMParser` parsing (`<parsererror>`) so the frame never renders. The two bolds are now merged into a single `fontAttrs` source (`bold = card.font.bold || rowLabelBold`), keeping both controls independent without duplicating the attribute. +1 regression test (renders with both bolds on; verified to fail with the duplicate reintroduced). This was the only duplicate-attribute site — the other label/axis/segment builders append non-colliding attributes (data-*, transform, pointer-events) and are unaffected.

### Changed (no font is forced; colours follow the report theme)
- **Font family is no longer forced to "Segoe UI".** Every card's font/title-font default is now empty, and the renderer omits the SVG `font-family` attribute when unset, so text inherits the **report theme font**. An explicit user pick still applies verbatim. (`makeFontControl`/`makeTitleFontControl` defaults, `readFont`/`readTitleFont` fallbacks, `fontAttrs`, and the empty-state banner.)
- **More colour defaults now derive from the active theme** instead of hard-coded greys/blacks: table value/row-label/separator colours and the legend label colour → theme **neutral**; legend title and variation-arc line/label colours → theme **foreground**; the variance-rail divider (was a fixed `#444`, the lone non-high-contrast line) is now theme-neutral + HC-aware. Resolved via the existing `applyThemeDefault` mechanism (only when the user hasn't set the colour). **Note:** a report that left one of these at its old hard-coded default will now pick up the theme colour — consistent with how the X/Y-axis colours already themed.

## [1.1.33.0] — 2026-06-15

### Removed (diagnostic scaffolding deleted entirely)
- **Removed the gated `DIAGNOSTIC_OVERLAY` flag and the `renderDiagnosticOverlay` method** (1.1.27.0 dev-only debugging scaffolding that dumped the runtime categorical schema to a DOM overlay). It was inert (gated `false`, no forbidden APIs) but had no place in a certification-grade source tree. The colour/cross-filter bugs it was built to capture are fixed (1.1.30.0–1.1.32.0). No functional change to the visual; the `package-lock` version field is bumped to match.

## [1.1.32.0] — 2026-06-15

### Fixed (first table-row click leaked an X-axis filter; row clicks now cross-filter by the adim value only)
- **Clicking the FIRST table row applied a spurious partial highlight on the waterfall** (one bar bright, the rest pale) "as if the row value AND an X-axis value were selected", and the report cross-filter for a row click was scoped to a single `(X₀, value)` cell rather than the whole analysisDim value. Root cause: in the cross-product `(X × adim)` DataView the first row's `withCategory(adimCol, 0)` identity COINCIDES with bar 0's identity, so selecting the first row also matched bar 0 (only the first row, by construction). Two coordinated fixes:
  - **Source-aware selection visuals.** `applySelectionVisuals` now records whether the active in-visual selection came from a bar / legend / **table-row** click and, for a table-row selection, no longer derives a bar or matrix-cell highlight (the focus filter + the analysisDim-row gate already convey it). The selectionManager only ever holds ids the visual itself selected, so this is unambiguous; external cross-highlights are unaffected.
  - **Value-union cross-filter.** A table-row click now selects the UNION of one representative row per X-category for that analysisDim value (deduped, bounded to ≤ N(X) ids even on 10k-row data) instead of the single first `(X₀, value)` cell. The host therefore cross-filters the rest of the page by the analysisDim VALUE alone, ignoring the X axis — matching the requested row-header behaviour. Keyboard Enter/Space uses the same target.
  - +2 tests: the per-value union holds one id per contributing X-category (balanced and unbalanced cases), proving it is no longer the single representative id.

## [1.1.31.0] — 2026-06-15

### Fixed (table-row focus now re-evaluates conditional formatting on the filtered row)
- **Clicking a table row focuses the waterfall on that analysisDim value, but the fx (conditional-formatting) colours stayed frozen on the grand-total resolution.** Since 1.1.30.0 the per-category fx colour follows the SIGN of the aggregate, so it is row-dependent — yet `deriveFilteredParsed` copied the colours verbatim (a valid assumption only under the old row-independent resolution). Focusing a row therefore showed the right (filtered) bar heights with the wrong (full-total) colours.
  - **The fx colours are now RE-resolved over the focused row subset.** The resolver was extracted to `resolveCategoryFx(rows, ctx)` and its inputs captured on the ParseResult (`fxCtx`); `deriveFilteredParsed` replays it on the filtered rows, so a table-row click recomputes every per-category fx slice (pillar / bridge colour, label, background) for the selected member — and reverts to the full resolution when the focus clears (re-click / Esc). No DataView round-trip; the column-object refs are live for the current render.
  - +1 test: focusing Region "N" vs "S" flips a category's pillar colour to that region's own conditional-formatting result, and the unfocused parse keeps the grand-total colour.

## [1.1.30.0] — 2026-06-15

### Fixed (fx colour now follows the SIGN of the aggregate variation, not the bigger endpoint measure)
- **A measure-driven CF rule on a comparison bridge colour could resolve to the colour of an OPPOSITE-sign Table member.** 1.1.29 weighted each sub-row's vote by `max(|measure|)` across the bound actual measures — for a comparison bridge that is the bigger of the two ENDPOINTS (start / end), not the variation the bridge displays. So a favourable `+1000` endpoint row out-weighted three unfavourable `−400` variation rows, painting a bar whose net variation is `−200` (unfavorable) with the favourable colour. This is the sign mismatch the user flagged: the largest contribution's sign need not match the total's sign.
  - **The vote is now computed on the bar's true signed basis** — the primary actual for pillars / cumulative bars, and the **net variation `Σ(last) − Σ(first)`** for comparison bridges (the same `bSum − aSum` the bridge synth uses) — and is **gated by the sign of that aggregate**: only the sub-rows pulling the bar in its displayed direction are tallied (`|value|`-weighted), so an opposite-sign member can never colour the bar. Generalises to all six per-category fx slices.
  - **Monotonically ≥ 1.1.29:** in an all-same-sign category every sub-row is sign-matched, so it reduces exactly to the prior weighted vote (and to plain majority for equal magnitudes; single-row categories stay byte-identical). It only ever removes the opposite-sign members that skewed the colour.
  - **Known limit (stated honestly):** a pure `|magnitude|`-threshold rule whose aggregate crosses a bucket no single member crosses is still approximate — the rule's thresholds are not recoverable from PBI's resolved per-row fills (confirmed: PBI exposes no per-X-aggregate fill in a categorical DataView; `InstancesAndTotals` "Totals" is inert here, `grouped()` is the series axis, and a second/matrix mapping cannot carry a CF fill).
  - +3 tests: a comparison bridge whose aggregate variation is negative while the largest endpoint row is positive (verified to FAIL on 1.1.29, producing the wrong colour); a cumulative/pillar mixed-sign analog; and an all-same-sign guard proving no spurious sign gating.

## [1.1.29.0] — 2026-06-14

### Fixed (fx colour now tracks the X-aggregate, not the most-numerous Table member)
- **A measure-driven conditional-formatting RULE on any per-category fx colour (bridge / pillar / their labels & backgrounds) resolved to the wrong colour as soon as a dimension was placed in the Table (`analysisDim`) bucket.** Root cause: binding `analysisDim` splits each X-category into N DataView sub-rows `(X × Table-member)`, and PBI bakes a DIFFERENT resolved fill on each sub-row. The bar's value is the **SUM** of those sub-rows, but the 1.1.22.0 resolver used a raw row-**count** majority — so it returned the colour of the most NUMEROUS member, not the one that drives the aggregate. When a category's value crosses a threshold that no single small member crosses, every small member resolves to the "below" colour and out-votes the one big member → wrong colour (and "same colour everywhere" when the small-member colour dominates every category).
  - **The per-X vote is now weighted by each sub-row's `|value|`** (max across the bound actual measures), so the **dominant contributor** wins — matching the colour PBI resolves at the X-aggregate granularity (the no-`analysisDim` case the user validated). For same-sign contributions (the normal P&L shape) this is provably consistent with the aggregate's threshold bucket. Generalises to all six per-category fx slices at once.
  - **Invariants preserved:** category columns still scanned before value columns; ties still resolve first-seen; EQUAL-magnitude sub-rows collapse the weighted vote back to plain majority (every prior fx test stays green); single-row categories stay byte-identical. When every contributing sub-row is blank/zero, the resolver falls back to row-count majority.
  - +2 tests: a dominant-magnitude sub-row that is OUT-numbered still wins (count-majority would flip it); and a guard that a numerous-AND-dominant colour does not spuriously flip.

### Removed (diagnostic overlay disabled)
- **`DIAGNOSTIC_OVERLAY` set back to `false`** — the temporary 1.1.27/1.1.28 runtime-capture overlay is off. No diagnostic panel renders.

## [1.1.28.0] — 2026-06-14

### Diagnostic (temporary — enriched overlay)
- **Enriched the 1.1.27.0 diagnostic overlay** with a PER-X section: for the first category value it lists, per category column, the `colorBridge` fill found on each contributing sub-row. The first capture showed `analysisDim cols = 1` (a plain dimension, NOT a field parameter) and that the fills land on BOTH category columns (the X-axis `Country` and the table `Discount Band`) at `(X × sub-row)` granularity — so this section reveals whether the X-axis column carries a UNIFORM per-X colour (recoverable → fix scans the category column only) or a VARYING one (the per-X colour does not exist → needs a DAX `REMOVEFILTERS` measure). Still gated by `DIAGNOSTIC_OVERLAY`; no functional change.

## [1.1.27.0] — 2026-06-14

### Diagnostic (temporary — gated overlay to capture the field-param / colour root cause)
- **Added a gated diagnostic overlay** (`DIAGNOSTIC_OVERLAY = true` at the top of `src/visual.ts`) that renders a compact top-right panel dumping the runtime categorical schema: per category column (index, displayName, queryName, roles, identity presence, count of rows carrying a `bridges.colorBridge` fill); the **count of `analysisDim`-role columns** (the decisive number — a "plain dimension" arriving as >1 column = the field-parameter shape behind BOTH the colour and the cross-filter bugs); per value column the same fill count; `parsed.analysis` selectionId counts; and the resolved per-X `bridgeColor` list. This is the only way to inspect the runtime DataView without console access. The colour + cross-filter bugs were proven **runtime-only** — `git diff` shows the colour code path is byte-identical to the 1.1.22 version that worked, and a jest repro of the real `update()→renderWaterfall` path yields correct colours — so NO blind fix is shipped. Set `DIAGNOSTIC_OVERLAY = false` (or remove the overlay) once the screenshot is captured.

## [1.1.26.0] — 2026-06-14

### Reverted
- **Reverted the 1.1.25.0 field-parameter fx-colour change.** It did NOT fix the field-parameter case (the assumed parasitic-fill location was wrong) and was the likely cause of a colour regression: a plain dimension can ALSO arrive as more than one `analysisDim`-role column (e.g. with an associated sort-by column), which tripped the `> 1` guard and dropped genuine columns from the fx scan → "same colour everywhere" returned. Back to the full-column scan (1.1.13.0 behaviour). The field-parameter colour bug stays OPEN, pending a runtime DataView capture (no more blind guesses).

### Changed (table-row selection is now row-only)
- **Clicking a row in the analysis table now cross-filters ONLY by the table dimension's value** (row-only), no longer by a composite (category × analysisDim) cell id. The 1.1.17.0 per-cell matrix-cross selection cross-filtered the report by an X-axis value too, producing a seemingly-random X-axis filter on top of the row. Row-only keeps the report cross-filter ALIGNED with the in-visual focus: the same `analysisDim` value drives both the waterfall focus (`refreshFocusFromSelection`) and the host selection, so the waterfall and the rest of the page react identically to a table-row click. Keyboard Enter/Space on a row was already row-only.

## [1.1.25.0] — 2026-06-14

### Fixed (fx colour rule was wrong with a FIELD PARAMETER in the Table bucket)
- **A measure-driven conditional-formatting RULE on the bridge colour resolved to the WRONG colour when a Power BI FIELD PARAMETER (not a plain dimension) was placed in the Table (`analysisDim`) bucket.** A field parameter arrives as MULTIPLE category columns all carrying the `analysisDim` role (the parameter wrapper + the substituted field, sometimes an order/key column). PBI lands parameter-context fx fills on those extra columns, so `fxAcrossRows`' per-X majority mixed two fill populations and picked a Table-influenced colour. A plain dimension — or the same field dropped DIRECTLY — has exactly one `analysisDim` column and was unaffected (the 1.1.22.0 fix already worked there; user-confirmed).
  - When MORE THAN ONE `analysisDim`-role column is present (= a field parameter), the fx colour scan now DROPS the `analysisDim` columns. A measure-driven rule lands its resolved fill on the VALUE columns anyway (1.1.18.0) — still scanned — so the genuine comparison colour wins. GATED on `> 1` so the single-column (plain-dim / direct-field) path stays byte-identical: **zero regression** to the confirmed-good case. Only the fx colour scan is narrowed; the footnote table still breaks down by the `analysisDim` column unchanged.
  - +2 tests: the field-parameter (multi-`analysisDim`-column) repro — asserting the value-column rule colour wins over the wrapper column's parasitic fill (verified to FAIL without the guard) — plus a single-column no-op guard.

## [1.1.24.0] — 2026-06-14

### Removed (per-arc variation-arc label overrides)
- **Removed the per-arc "Arc N label" dropdowns and "Arc N custom text" inputs** (`arcSource1..8` / `arcCustomText1..8`) from the Arc card — they were unreliable. Every variation arc's label is now driven solely by the global **Default label source** dropdown (+ the global display-units / decimals) in Arc → Options. All general arc styling (colours, line, arrow, label background, font) is unchanged. Drops 16 format-pane slices and their dynamic per-secondary-pillar sub-blocks (capabilities, settings, render and `getFormattingModel` all cleaned up).

## [1.1.23.0] — 2026-06-14

### Added (interactive table-row focus-filter)
- **Clicking a row in the analysis table now FOCUS-FILTERS the waterfall.** Pillars, bridges, variance rails and variation arcs all recompute for the selected `analysisDim` value(s); the table itself stays fully displayed (so you can toggle / pick another row), and the existing external cross-filter (the row selection still filters the rest of the report) is preserved unchanged.
  - Internal, instant re-render — no DataView round-trip / no `applyJsonFilter`: a pure `deriveFilteredParsed` restricts each bar's `catRowIdxs` to the rows of the selected value(s) and re-aggregates; the existing synth → grand-total → layout → render pipeline replays on the filtered clone via a new `renderWaterfall` (the post-parse block of `update()` extracted intact).
  - **Comparison mode stays consistent:** `actualMeasures` are masked to 0 on excluded rows (totals recomputed) so the pillar anchors track the filtered sums and the cascade invariant `Σ bridges = endPillar − startPillar` holds.
  - **Toggle:** re-clicking the focused row clears it → full waterfall returns. **Ctrl+click** cumulates several values (waterfall = their sum). Keyboard Enter/Space on a table row drives the identical path.
  - Per-X fx colours (1.1.22.0) are preserved verbatim under focus (colours are copied, never re-resolved). Bar clicks keep their existing dim/highlight behaviour (they do NOT focus-filter). Broken-axis / Y-range recompute from the focused values.
  - +7 tests (filtered aggregation, multi-select union, empty-bar, the comparison masking invariant, no-analysisDim inert, segment filtering, table-stays-full).

## [1.1.22.0] — 2026-06-14

### Fixed (generalize the per-X fx-colour fix to EVERY per-category colour slice)
- **The 1.1.21.0 per-X majority fix is now applied to ALL per-category fx colour slices, not just `bridges.colorBridge`.** `fxAcrossRows` (the render-path per-category fx resolver) now returns the per-X DOMINANT (modal) fill across the category's rows instead of the FIRST, so a multi-value Table (`analysisDim`) dimension no longer collapses any of these onto the first analysisDim member's colour:
  - `pillars.pillarColor`, `pillars.colorPillarLabel`, `pillars.labelBgColor`
  - `bridges.colorBridge`, `bridges.colorBridgeLabel`, `bridges.labelBgColor`
  - Invariants preserved: category columns are scanned BEFORE value columns and ties resolve to first-seen, so (a) the category-column-wins-over-value-column priority still holds and (b) single-row categories (no analysisDim / legend) are byte-identical to before.
- **Legend segment label colours** (`legend.segmentLabelColor`, `legend.segmentLabelBgColor`) get the same per-legend-value majority via a new module-level `legendFxMajority`, fixing the identical first-row bias when analysisDim splits a legend value across rows. _Limitation:_ legend fx is resolved from the legend column only — a measure-driven rule that lands on a value column is not read here (a pre-existing constraint, not a new one).
- **Removed the now-redundant 1.1.21.0 scaffolding** — `fxMajorityAcrossRows`, the `categoryDisplay.bridgeColorPerX` field and its population, and the `synthesizeComparisonBridge` override. The `fxAcrossRows` refactor makes `bridgeColor` itself correct, so the spread carries it. The 4-level fx persistence cascade, cumulative mode and pillars are untouched.
- **Out of scope (global colours, no per-X notion):** variation-arc label/background (`variationArc.labelColor` / `labelBgColor`) and the analysis-table value colour (`analysisTable.color`) are single global slice values applied to every arc/cell — there is no per-category collapse to fix. Making them per-arc/per-cell would be a feature, not this bug fix.
- **+9 tests:** all six pillar/bridge slices via a parameterized majority case, a pillar category>value priority guard, and two legend-majority tests (multi-row + single-row byte-identity).

## [1.1.21.0] — 2026-06-14

### Fixed (comparison-mode fx colour rules collapsed to ONE colour with a multi-value Table dimension)
- **In Comparison mode, a measure-driven conditional-formatting RULE on the bridge colour (`bridges.colorBridge`) rendered EVERY variation the same colour as soon as the Table (`analysisDim`) dimension carried more than one value.** A single Table value (1 row per X) was unaffected — matching the reported symptom. Root cause: with `analysisDim` bound, Power BI ships the DataView at `category × analysisDim` granularity (single categorical mapping, see `capabilities.json`) and resolves the rule per flattened row. `synthesizeComparisonBridge` re-aggregates the bridge *value* per X-category but inherited the *colour* verbatim from `fxAcrossRows`, which returns the FIRST row's fill — always the first `analysisDim` member under X-major / dim-minor ordering — so all bridges of every X-category collapsed onto that one member's colour.
  - New `fxMajorityAcrossRows` reader tallies the resolved fills across ALL rows of an X-category and returns the DOMINANT (modal) one; ties resolve to first-seen, so single-row cases stay byte-identical to `fxAcrossRows`. Stored on a new `categoryDisplay.bridgeColorPerX` field.
  - `synthesizeComparisonBridge` now reads `bridgeColorPerX ?? bridgeColor` for synthesized bridges only. `bridgeColor`, the 4-level fx persistence cascade, cumulative mode and pillars are untouched (the existing fx priority test still passes).
  - 3 new tests in `test/scenarios.test.ts` reproduce the multi-row `analysisDim` split the existing fx suite never covered: per-X distinct colours, majority-on-disagreement, and single-value-Table parity.
- **Known limitation (honest):** the per-X colour can only be recovered when PBI resolved the rule with per-X-distinct fills on the rows. If the rule is keyed off a measure aggregated at grand-total scope (identical fill stamped on every row), the per-X colours simply do not exist in the DataView and cannot be reconstructed read-side. For a guaranteed per-X colour, base the rule on an X-granular measure, e.g. `CALCULATE([Δ], REMOVEFILTERS('<Table dim>'))`.

## [1.1.20.0] — 2026-06-09

### Changed (repo audit pass — submission hygiene, zero functional change)
- `capabilities.json`: the Category data-role description no longer cites a project-specific example column; it now describes the role generically. This text is user-facing (field-well tooltip), hence the version bump.
- Source comments condensed across `src/`, `test/` and `tools/` (compiled bundle verified byte-identical before/after).
- README and CONTEXT rewritten to describe the current feature set and data roles (the previous README documented an obsolete early data-binding scheme).

## [1.1.19.0] — 2026-06-09

### Changed (certification toolchain pass — zero functional change to the visual)
- **`powerbi-visuals-tools` 5.6.0 → 7.1.0** — the certification doc requires the latest tools, and 5.6's dependency tree carried `npm audit` warnings above the allowed bar. Build, lint, type-check and all 167 tests verified green on the new toolchain; `pbiviz package --certification-audit` reports no external requests.
- **`npm audit` now returns 0 vulnerabilities** (cert gate: no high/moderate allowed). `npm audit fix` cleared `shell-quote` (critical) + `fast-uri`; two surgical `overrides` finish the job without major bumps: `minimatch@^9.0.0 → ^9.0.7` (ReDoS advisories in the @typescript-eslint chain) and `sockjs > uuid → ^11.1.1` (GHSA-w5hq-g745-h8pq, dev-server-only path).
- **New `eslint` npm script** with the exact command required by the certification doc (`npx eslint . --ext .js,.jsx,.ts,.tsx`) + `.eslintignore` scoping it to the visual source. eslint kept at v8 deliberately: the required `--ext` flag errors under eslint 9 flat config.
- CI bumped to Node 22 (tools 7.x requires ≥ 20.19).

## [1.1.18.0] — 2026-06-07

### Fixed (fx colour rules STILL broke with a field in the Table role)
- **Measure-driven conditional-formatting rules on bridges / pillars reverted to the default colour once an `analysisDim` (Table) field was bound.** The 1.1.12.0 / 1.1.13.0 passes extended the fx-fill scan across every bound *category* column, but a rule keyed off a **measure** (fx → Rules / Gradient) lands its resolved per-data-point fill on the **value** column's per-row objects (`categorical.values[i].objects[r]`), not on a category column. With `analysisDim` bound the category splits into N rows, the category-only scan found nothing, and the bridge / pillar fell back to the theme default.
  - `parseDataView.fxAcrossRows` (render path) now scans the value columns' per-row objects as a **last resort**, after the category columns — so existing per-category fills keep priority.
  - `update().patchFxSlice` (Format-pane path) gets the same per-row value-column fallback so the picker reflects the persisted colour.
  - 3 new tests in `test/scenarios.test.ts` (value-column fill resolves onto bridge + pillar; category-column fill keeps priority).

### Changed (analysis table readability)
- **Row labels no longer aggressively truncated.** When the footnote table is shown, the left margin now widens to fit the longest dimension row label (capped at 34 % of the visual width) instead of being sized only for the Y-axis ticks. The full label stays available via the `<title>` hover tooltip.
- **More vertical breathing room in table rows.** Row height bumped (`fontSize + 8` / `18 px` floor → `fontSize + 12` / `22 px`) and the default max-height cap raised `30 % → 40 %`, so values no longer feel crammed against the separators.

## [1.1.17.0] — 2026-05-23

### Fixed (analysis table cells should behave like a matrix)
- **Cell tooltip (was: full-row dump).** Hovering a single table cell now shows a focused 3-line cross — `<category dim>: <X label>`, `<analysis dim>: <row label>`, `<measure>: <cell value>` — instead of dumping every column of the row (up to 12 lines). Hovering the row label / background still shows the legacy full-row tooltip (useful for "give me the breakdown of this row"). In no-category mode the category line is omitted to avoid repeating the measure name.
- **Cell click (was: row-only filter).** Clicking a single table cell now cross-filters by the (category × analysisDim) composite — same matrix-style intersection a native Power BI matrix visual produces — so the rest of the report sees BOTH the X-axis bridge and the table row at once. Clicking the row label / background still does row-only filtering (legacy behaviour). Click-twice-to-clear + ctrl/cmd multi-select preserved on both targets.
- **Cell-level visual feedback in the table.** When a cell is the active selection, every OTHER cell in the matched row dims to 0.5 so the user sees exactly which intersection drives the filter. Bars dim to the single matching column. Non-matching rows dim as before.

### Internal
- `buildAnalysisCells` now returns `{ values, selectionIds }` instead of `number[][]`. The composite `withCategory(catCol, r).withCategory(adimCol, r)` (or `withMeasure(queryName).withCategory(adimCol, r)` in no-category mode) is built once per cell at render time, cached on `cachedAnalysisCellSelectionIds`. Synth columns (Grand Total, comparison anchors) leave `selectionIds[r][c] = null` so the handler falls back to row-only selection.
- `AnalysisDimData.column` and `ParseResult.categoryColumn` carry the live DataView column references through buildAnalysisCells so it can compose the per-cell ids without re-walking the dataView.
- `ActualMeasureInfo.queryName` exposed for the no-category cell-id path.
- New `hoveredTableCol` mirror so cell-to-cell hover within the same row triggers a tooltip swap (different cross) rather than a `move` that reuses the previous payload.
- `applySelectionVisuals` now also matches the cell selection ids; the matched (row, col) pair folds into `selectedCatIdxs` / `selectedAdimIdxs` so the existing bar / row opacity gates naturally narrow to the single cross. A new per-cell opacity pass dims unmatched cells in the matched row.
- Fixed compounding opacity bug introduced by the new wrapper: the dim-row pass now scopes by `.wf-table-row` class (outer group only) instead of `[data-table-row]` (which would also match the inner cell groups and double-apply the dim).
- 4 new Jest scenarios — cell composite-id matrix shape, cell tooltip 3-line cross, no-category cell tooltip without the cat line, Grand Total cell-id null fallthrough. Suite: 164 green.

## [1.1.16.0] — 2026-05-23

### Fixed (Field Parameter repro — `# ##0\ "€"` rendered raw)
- **Root cause:** when a measure exposed via a Power BI Field Parameter is bound to Value, its DAX format string (e.g. `# ##0\ "€";-# ##0\ "€"`) reaches our custom `formatVarianceValue` parser because of the `;` (multi-pattern path). The parser's prefix/suffix extractor grabbed the raw sub-string after the last `0` — `\ "€"` — and concatenated it verbatim, producing labels like `73 704\ "€"` and `6 656 500\ "€"` on screen.
- **Fix:** `formatVarianceValue` now unescapes DAX literals per-section after splitting on `;`:
  - `\X` → `X` (backslash escape, common in DAX-emitted format strings for any non-digit literal)
  - `"X"` → `X` (quoted literal text, the canonical DAX way to embed currency / unit suffixes)
  - The cleaned pattern then flows through the existing prefix/suffix/decimals/sign-aware pipeline.
- **Bonus thousands detection:** the `hasThousands` heuristic was en-US-only (`#,##0` or `,`). It now also matches `# ##0` (fr-FR / many EU locales using space as the thousands separator) via a generic `/[#0]\s[#0]/` probe, so French DAX formats render with proper grouping (`73 704` instead of `73704`) — including the U+202F NARROW NO-BREAK SPACE that `toLocaleString("fr-FR")` emits, identical to native Power BI visuals.
- New test `DAX format literals — \X escape and "X" quoted text are honoured` covers the repro plus single-section and decimals variants.

## [1.1.15.0] — 2026-05-22

### Fixed (1.1.14.0 follow-up — label background colour still not visible)
- **Root cause:** the 1.1.14 attempt to auto-show when the user picked a non-default colour relied on the slice's runtime value reflecting the picker accurately. That detection turned out to be unreliable for fx-enabled wildcard pickers — the slice often kept the constructor default while the picked colour lived on per-row objects, so `isNonDefaultBgColor` returned false and the toggle (still default-OFF) kept the bg hidden.
- **New model (defaults flipped):** the label-background toggle now defaults to TRUE and the colour defaults to "" (empty). `svgLabelBg` short-circuits when the colour is empty, so users see no background out of the box — but the moment they pick ANY colour the bg shows immediately, no toggle ceremony required. The toggle stays as an "explicitly disable bg even though I picked a colour" override.
- Applied to: `bridges.labelBgColor`, `pillars.labelBgColor`, `rails.labelBgColor`, `variationArc.labelBgColor`, `legend.segmentLabelBgColor`. Master `legend.segmentLabelBgShow` also flipped to TRUE default.
- Per-measure `varianceMeasure.colorTextBgPos / Neg` now fall back to "" (was "#ffffff") when neither the per-measure nor the global rails colour is set, so the empty-bg gate cascades through.
- New module-level helper `safeHexOrEmpty` validates the hex but preserves "" — used everywhere a label-background colour is resolved. The 1.1.14 `isNonDefaultBgColor` helper is gone (no longer needed; the empty-string gate is simpler and more reliable).

### Tests
- `formatting-model.test.ts` adjusted: default `pillars.labelBgColor` / `bridges.labelBgColor` are now "" (was `"#ffffff"`). All 159 tests pass.

## [1.1.14.0] — 2026-05-22

### Fixed (1.1.13.0 label/background follow-up — 3 bugs)
- **Bug A — Pillar value labels for negative pillars sat UNDER the chart frame instead of above the bar like positive pillars.**
  - `buildSVG` pillar branch no longer forks on `item.actualVal < 0`. Labels always go at `yTop − 8` (above the bar's top edge). For a negative pillar, `yTop` is the zero line, so the label sits just above the zero line — same scanning band as positive pillar labels. Inside-bar fallback (when the natural position would clip `padTop`) keeps the user-configured `colorPillarLabel`.
- **Bug B — Picking a label-background colour rendered nothing because the `labelBgShow` toggle is OFF by default.**
  - Every bg block now auto-shows when the user picks a non-default colour (anything other than empty / `#ffffff`). New helper `isNonDefaultBgColor()` in `buildSVG`; applied to Pillars / Bridges / Variance / Arc / Variance per-measure bg pickers. The toggle still wins when the user explicitly wants a white pill on a white chart (we can't distinguish "user picked white" from "still on default white" persistence-wise).
- **Bug C — Label-background opacity slider missing wherever there's a background colour picker.**
  - New `legend.segmentLabelBgTransparency` slice (master) — replaces the previously hardcoded `bgTransparency: 0` in every `svgLabelBg` call for stacked-legend segments (pillar + bridge branches).
  - New per-measure `varianceMeasure.colorTextBgTransparency` slice — gives each variance row its own transparency dial; reads through to the global `rails.labelBgTransparency` when unset, so unchanged reports keep their look.
  - Renderer's rail block now auto-shows the per-measure bg when EITHER `colorTextBgPos` OR `colorTextBgNeg` is non-default — matches the pillar / bridge / arc auto-show rule above.

## [1.1.13.0] — 2026-05-21

### Fixed (1.1.12.0 audit follow-up — 7 bugs)
- **Bug 1 — Adding an `analysisDim` (Table) column still broke per-row fx colour rules on bridges, variation arcs, and variance rails.**
  - 1.1.12.0 fixed the rule resolution for the PRIMARY `category` column. This pass extends the scan to EVERY bound category column: `parseDataView.fxAcrossRows` now walks each row across categoryColumn / legendColumn / analysisDimColumn objects, and `update().patchFxSlice` falls back through the secondary columns when the primary one has no persisted fill. PBI's fx engine uses a wildcard selector that can persist the resolved fill on any of the bound category columns; the previous scan stopped at the first one and surfaced the theme default whenever PBI elected to write on a secondary column.
- **Bug 2 — Tooltip number formats were hardcoded and ignored every card-level display-unit / decimal-places choice.**
  - `tooltip.ts:formatActualForTooltip` (Visual class + pure module copy) no longer hardcodes `cardUnits: "auto"`, `cardDecimals: 0`, `dataMaxAbs: |value|`. The tooltip context now carries the resolved Pillars / Bridges / Y-axis display-units, decimals, and the chart-wide `dataMaxAbs`; the formatter inherits the same scale + precision the chart labels use. Per-card "auto" inherits the Y-axis card so the tooltip stays in sync with both the on-chart label and the user's intent. Affects every tooltip row: main value, stacked-legend segments, and the extra Tooltips data-role measures.
- **Bug 3 — Pillar / bridge value labels still landed UNDER the variation arc when stacked legends + segment labels were enabled.**
  - 1.1.12.0 buffered the standalone value labels into `barLabelsBuf` (flushed after arcs). This pass extends the buffer to **segment labels** drawn inside stacked bars too — the pillar-branch local `segLabelsBuf` and the new bridge-branch `bridgeSegLabelsBuf` now both route through `barLabelsBuf`, wrapped in their own `<g data-cat-idx="…" class="wf-clickable">` so click resolution stays intact. SVG document order becomes `bar fills → arc layer → every label kind`.
- **Bug 4 — Per-measure colour pickers in Pillars card were limited to comparison-with-≥2-measures (synth bridge case).**
  - `showPerMeasureGroups` now triggers in every comparison configuration with a category dim (M=1 too). Cumulative + no-cat behaviour is unchanged. Pickers still write `measureFillColor` / `measureLabelColor` / `measureLabelBgColor` on the per-measure `withMeasure(queryName)` selector; `synthesizeComparisonBridge` and the renderer's pillar resolution chain already consume them.
- **Bug 5 — Bridge label placement felt random — inside-bar fallback used a hardcoded white that disappeared on light bar colours.**
  - Bridge "up" / "down" branches in `buildSVG` consolidated into a single placement block. Inside-bar fallback now keeps the user-configured `labelColor` (was `"#ffffff"`) — matches the pillar branch's behaviour from 1.1.7.0 onward. Background pill is honoured in BOTH positions when `bridgeBgShow` is ON. Above/below thresholds remain `padTop + size + 2` and `height − padBottom − 2`.
- **Bug 6 — "Tooltips" data role was inert in no-category mode + on synth Grand Total / comparison-anchor pillars.**
  - `parseNoCategory` now forwards the `tooltips` columns and aggregates each measure across every row → `tooltipMeasures` (same shape as the with-dim path) + per-cdp `tooltipValues`. `synthesizeComparisonBridge` aggregates tooltip measures across the entire dataView and attaches them to the synth start/end pillar cdps. `appendGrandTotal` sums per-cat tooltip values into the GT cdp. All three surface in the hover tooltip via the existing `buildTooltipItems` path.
- **Bug 7 — "Show items with no data" toggle was missing in our Format pane and the existing filter only checked the primary actual.**
  - New `general.showItemsWithNoData` boolean (default OFF) in `capabilities.json` + `settings.ts`. OFF ⇒ `parseDataView` drops every unique category whose every contributing row is null across EVERY actual measure (was: only primary actual — comparison M≥2 cases incorrectly kept categories that had `measure_0=null` but `measure_1≠null`). ON ⇒ filter bypassed, all rows render.

### Notes
- 159 → 160+ tests still passing (tooltip + scenarios fixtures updated to carry the new `TooltipBuildContext` shape and the no-cat tooltipMeasures forwarding).

## [1.1.12.0] — 2026-05-21

### Fixed (bug audit pass — 6/7 of the 1.1.11.0 audit)
- **Bug 1 — `analysisDim` binding broke per-row fx colour rules on bridges and the arc.**
  - `patchFxSlice` no longer trusts `categories[0]` blindly: it now looks up the column carrying the `category` role explicitly and falls back to `categories[0]` only in no-category mode. Picking the wrong source column was what made the rule-resolved fill silently revert to the theme default as soon as the user added a column to the Table bucket.
  - Per-category fx fills (bridges + pillars) now scan EVERY row of the group instead of only `firstRow`. PBI's fx engine sometimes lands the resolved fill on a non-first row when legend or analysisDim is bound, and the previous single-row read missed it. New `fxAcrossRows` helper in `parseDataView`.
- **Bug 2 — Removed the hardcoded `+#,0;-#,0;0` Excel-format default.**
  - `DEFAULT_VARIANCE_FORMAT` constant deleted from `src/format.ts`. Empty modelFormat now yields a plain locale-grouped number; sign-aware labels rely on the existing `withSign: true` opt-in in `formatActualLabel` instead. Affects `formatVarianceValue`, `tooltip.ts:formatVariance`, and `parseDataView`'s variance defaultFormat resolution.
- **Bug 3 — Z-order: pillar / bridge value labels sat BEHIND the variation arc drops.**
  - The bar value labels are now buffered in `barLabelsBuf` during the items.forEach loop and flushed AFTER the variation-arc layer — so the SVG document order becomes `bars → arcs → bar value labels`. Each buffered label is wrapped in its own `<g data-cat-idx="..." class="wf-clickable">` so hover / click resolution stays identical.
- **Bug 4 — Comparison mode: per-category `isPillar` toggles were inert + no per-measure colour control.**
  - The `isPillar` per-category sub-blocks in the Pillars card are now hidden whenever the chart auto-derives its pillars from measures (no-category + comparison, OR comparison-with-category + ≥2 value measures triggering `synthesizeComparisonBridge`). Comparison-with-a-single-measure still shows the toggles since the user has to mark anchor pillars manually.
  - New per-measure colour sub-blocks (Fill / Label / Label background) appear in the Pillars card in comparison-with-≥2-measures mode too — same UX that already worked in no-category mode. `synthesizeComparisonBridge` now reads `m.measureFillColor / m.measureLabelColor / m.measureLabelBgColor` and forwards them to the synth pillar cdp.
  - `cachedPillarMeasureGroups` instance field added so the format pane keeps the per-measure groups across `getFormattingModel` calls (`update()` is the only place with live access to the `DataViewValueColumn` instances).
- **Bug 6 — "Tooltips" data-role measures never appeared in the hover tooltip when legend or analysisDim was bound.**
  - Root cause: `tooltip.ts` indexed `tm.values[catIdx]` where `catIdx` is a unique-category index but `tm.values` was per-DataView-row — every binding that duplicated rows broke the lookup.
  - `parseDataView` now sums each tooltip measure across the category's rows and attaches the result to `cdp.tooltipValues` (mirroring `varianceValues`). `synthesizeComparisonBridge` propagates it through the spread; synth pillars and the Grand Total leave it undefined on purpose. `buildTooltipItems` reads from `cdp.tooltipValues` and only falls back to the legacy per-row indexing when no per-cdp value is set (preserves the existing tests).
- **Bug 7 — "Show items with no data" toggle was effectively ignored.**
  - `parseDataView` now drops every unique category whose every contributing row is null/undefined on the primary actual. A category with at least one non-null row stays alive (sum aggregation as before; explicit `0` rows count as data). Mirrors the native bar/column visual behaviour.

### Documented (Bug 5 — pillar / bridge label placement rules, to validate)
- The label placement rules currently in `buildSVG` are:
  - **Pillar (positive)**: label at `yTop − 8` above the bar. If that would land above `padTop + fontSize + 2`, it flips INSIDE the bar at `yTop + fontSize + 4` (in white).
  - **Pillar (negative)**: label at `yBot + fontSize + 4` below the bar. If that would land below the chart frame, it flips INSIDE the bar at `yBot − 4`.
  - **Bridge (up)**: label at `yTop − 7` above the bar; flips INSIDE (white) at `yTop + fontSize + 4` when above would clip.
  - **Bridge (down)**: label at `yBot + fontSize + 4` below the bar; flips INSIDE (white) at `yBot − 4` when below would clip.
  - **Background** (`labelBgShow` ON): only emitted when the label sits OUTSIDE the bar — inside-bar fallback uses the bar's own fill as background.
- Variation-arc label: at `yArc − variationArcLabelGap` (= `arcCeiling − 30 − 12`), centered between the two pillars.

## [1.1.11.0] — 2026-05-19

### Changed
- **`formatActualLabel` now delegates to Power BI's official `valueFormatter`** (`powerbi-visuals-utils-formattingutils`, the same lib SimpleWaterfall uses). DAX format strings — including locale-aware currency (`[$€-fr-FR]#,##0.00`), percentages (`0.0%`), thousands separators and culture-specific number conventions — render exactly the way they do in native Power BI visuals. Cumulative + comparison labels, bridge labels, segment labels, analysis-table cells and arc absolute deltas all go through the new pipeline.
- Multi-pattern Excel-style formats (`+#,##0;-#,##0;0` etc.) still go through the custom `formatVarianceValue` parser — `valueFormatter` doesn't honour sign-aware patterns natively, and our parser preserves the legacy output verbatim so reports relying on them stay pixel-identical.
- New runtime dep: `powerbi-visuals-utils-formattingutils ^6.1.2`. Jest `transformIgnorePatterns` updated to transform it + its transitive `powerbi-visuals-utils-typeutils`.

## [1.1.10.0] — 2026-05-19

### Fixed
- **Variation arc crossing tall positive bridges** — when an intermediate bridge between two pillars had a top higher than either pillar (e.g. a big positive `+Δ` after a low running total), the arc's horizontal bar was drawn at `min(yTopK, yTopK1) − drop` and ended up *behind* the bridge. The arc ceiling now considers every intermediate bridge top: `arcCeiling = min(yTopK, yTopK1, ...bridgeTops)`. The vertical drops naturally lengthen so the arc stays above all of them.

## [1.1.9.0] — 2026-05-19

### Added
- **Sign-aware label background colour per variance measure** — each variance sub-group inside the unified "Variance" card now exposes `Positive label background` + `Negative label background` ColorPickers, mirroring the existing `Positive / Negative bar color` and `Positive / Negative label color` pattern. The renderer picks `colorTextBgPos` when the cell value is ≥ 0, `colorTextBgNeg` otherwise.
- New capabilities under `varianceMeasure`: `colorTextBgPos`, `colorTextBgNeg`.

### Changed
- The global `rails.labelBgColor` slice is no longer the live render input — it stays in the model purely as the **default seed** for the new per-measure backgrounds, so reports that customised the global before keep their look until they pick a per-measure override. Render uses `rail.colorTextBgPos / Neg` per cell sign.

## [1.1.8.0] — 2026-05-19

### Changed
- **Variance card unification** — the standalone "Variance" composite card (per-measure title / colours / format) is now merged INTO the renamed "Variance" card (formerly "Variance rails"). The original layout slices (Show data labels, Rail height, gaps, label background, font) become the "General" sub-group; per-measure sub-blocks become collapsible groups under it. One card instead of two for everything variance-related.
- `RailsCardSettings` → `VarianceCardSettings`, now extends `CompositeCard`. Field stays `rails` on the formatting model and capabilities object name stays `rails`, so existing reports keep all their persisted settings.

### Fixed
- **Truncation of analysis-table row labels** — same fix as the variance rail titles in 1.1.7.0. Row headers in the analysis-dimension table now truncate with an ellipsis when they would overflow the left margin, and the full label is exposed via `<title>` on hover. Shared truncate helper hoisted to `buildSVG()` scope.

## [1.1.7.0] — 2026-05-19

### Fixed
- **Per-measure model format string in no-category mode** — pillar / bridge / variation-arc labels now respect each measure's own DAX format (`$#,##0`, `0.0%`, etc.) instead of forcing the first measure's format on all of them. `DataPoint` (and through inheritance `LayoutItem`) gains an optional `format` field, populated by `parseNoCategory` from `actualMeasures[i].format`; the renderer falls back to `cachedActualFormat` when unset. Fixes layouts like `Gross Sales ($) / Discounts ($) / Sales ($) / COGS ($) / Profit (%)` where the `%` measure was rendered as `0.16` instead of `16.0%`.
- **Pillar label colour when forced inside the bar** — when the natural label position (`yTop − 8` for positive, `yBot + size + 4` for negative) clips the chart frame, the label is placed inside the bar. The fallback no longer hardcodes the text to `#ffffff` (invisible on light fills); it keeps the user-configured `pillarLabelColor` resolved earlier in the pipeline.
- **Variance rail title truncation when `padLeft` is small** — `rail.name` is now truncated to fit `padLeft − 12` px, with a `<title>` SVG element exposing the full name on hover so nothing is lost.

## [1.1.6.0] — 2026-05-19

### Added
- **Per-measure colour controls in no-category mode** — when no Category/Legend dim is bound (5-measures-only layouts), the Pillars card now exposes one collapsible sub-block per measure with three ColorPickers: Fill color, Label color, Label background color. The wildcard-selector fx ColorPickers (Pillar color etc.) silently lost the user's choice in this mode because PBI had no row identity to attach the chosen constant to. The new sub-blocks use a measure-scoped `withMeasure(queryName)` selector, so PBI persists each pick on `categorical.values[i].source.objects.pillars.<prop>` — the same persistence path that already works for `isPillar`. With-dim mode is unchanged: the existing fx ColorPickers (the canonical UX for per-row conditional formatting) remain the primary surface and continue to work as before.
- 3 new capabilities under `pillars`: `measureFillColor`, `measureLabelColor`, `measureLabelBgColor`.
- `parseNoCategory` reads these per-measure overrides from `colSource.objects.pillars.*` and applies them to the point / categoryDisplay colour fields (covers both pillars and bridges — each measure has a single colour regardless of whether it renders as pillar or bridge).

### Removed
- 1.1.4.0's diagnostic overlay (warning-icon + `console.warn` dump). It was a temporary instrumentation to pinpoint the PBI persistence path; that path is now known (measure-scoped selector via the new sub-blocks).

## [1.1.5.0] — 2026-05-19

### Changed
- **Icon redesign** — denser layout of the 4-bar waterfall icon ([assets/icon.svg](assets/icon.svg)). Bars now fill ~88 % of the canvas width and ~84 % of the height (vs 77 %×48 % before), so the icon remains legible at the small sizes Power BI uses in the Visualisations panel. Same Eclor palette (`#091612` + `#1EF5B1`), same motif — only the framing changed. PNG regenerated at 300×300 RGBA via `@resvg/resvg-js`.

### Note
- 1.1.4.0's diagnostic overlay (warning-icon + `console.warn` dump for fx ColorPicker persistence) is still active — to be removed once the no-category persistence path is confirmed and the proper fix is in place.

## [1.1.3.0] — 2026-05-19

### Fixed
- **fx ColorPicker persistence in no-category mode** — choosing a colour for Pillars / Bridges / labels / Legend / Variation arcs / Analysis table now sticks in the Format pane, even when no dim is bound on the X axis. Previously, `makeFxColorPicker` set `selector` + `instanceKind` but omitted `altConstantSelector` — PBI's shell therefore had no static-scope target to persist the chosen constant when `categories[0]` was absent (5-measures-only layouts), and the picker silently reverted to the theme default. Fix in [src/settings.ts](src/settings.ts): set `altConstantSelector` to the same wildcard as `selector`. The 1.0.92.0 `patchFxSlice` cascade in [src/visual.ts](src/visual.ts) remains in place as a safety net for reports persisted under the old configuration.

## [1.1.2.0] — 2026-05-19

### Fixed
- **Y-axis baseline anchor** — pillars now sit flush on the chart floor when all data points are on the same side of zero. Previously, auto-fit padding (5 % below `refMin`) created a white band between the pillar bases and the visual's bottom edge (e.g. comparison mode M=5 with positive pillars + down-bridges that stayed above zero showed `yMin ≈ -6 M` instead of `0`). Fix in [src/yRange.ts](src/yRange.ts): clamp `yMin` to `0` when `refMin ≥ 0`, clamp `yMax` to `0` when `refMax ≤ 0`. Floor-offset slider and mixed-sign behaviour unchanged. Two regression tests added.

## [1.0.0.0] — 2026-05-02

### Added
- Initial Power BI custom visual scaffold (Phase 1+2): waterfall layout with cumulative & comparison modes, broken-axis indicator, Bloomberg-style connectors.
