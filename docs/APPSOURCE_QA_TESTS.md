# AppSource QA test pass — Eclor Waterfall

> Walkthrough of the Microsoft **"Test cases for Power BI custom visuals"** checklist.
> Version: **1.1.72.0** · API `5.11.0` · Date: **2026-07-05**
> Test suite at time of writing: **`npm test` → 411 passed / 26 suites, 0 fail.**

## How to read this

Many of these cases are **interactive runtime tests** (Power BI Desktop, the web service, real
browsers, pin-to-dashboard, mouse coordinates). Those cannot be executed from the source repo,
so I do not mark them "done" — I mark what the code *guarantees* and flag what still needs a human pass.

| Mark | Meaning |
|:----:|---------|
| ✅ | **Code-verified** — backed by a named passing jest suite or a hard capabilities/code fact. |
| ⚠️ | **Code-supported** — the logic is correct & tested, but the case is a runtime/UX behaviour; do a quick manual confirm. |
| ⏳ | **Manual-only** — not verifiable from the repo (host chrome, browsers, service). Must be run by hand before submit. |
| N/A | Not applicable to this visual. |

---

## General test cases

| Test case | Status | Evidence / note |
|-----------|:------:|-----------------|
| Stacked column ⇄ convert to this visual & back → no error | ⚠️ | DataView reshape robustness: `scenarios` state-machine (null vs empty) + `stress-combos` "cache staleness across DataView reshapes". Convert-UX itself is runtime. |
| Gauge (3 measures) ⇄ convert & back → no error | ⚠️ | Measure-only / no-category + comparison M≥3 parsing tested (`scenarios`, `comparison-m3`). Confirm the round-trip in Desktop. |
| Make selections in your visual → other visuals reflect | ✅ | `selectionManager.select` + toggle semantics — `scenarios` "Selection toggle", `selection-visuals` (TG-05). |
| Select in other visuals → your visual shows filtered data | ✅ | `supportsHighlight: true`; highlight plumbing — `scenarios` "highlights (external cross-filter)" / "highlights flow through matrix cells". |
| min/max conditions of dataViewMapping correct | ✅ | `conditions: [{ category: { max: 5 } }]`; buckets accept multi/single fields. [capabilities.json](../capabilities.json). |
| Remove all fields in arbitrary orders → keeps rendering, no console errors | ✅ | The ghost-axis fix: two empty-state branches + `stress-combos` reshape sequences + `scenarios` state machine. |
| Open Format pane in every bucket config → no null-ref exceptions | ✅ | `formatpane` (dynamic sub-blocks TG-07), `pane-layout` invariants, `formatting-model`. |
| Filter via Filter pane (visual / page / report) → tooltips correct & filtered | ⚠️ | Tooltip payload is pure & tested (`tooltip` native-parity); filter application is host-side — confirm manually. |
| Filter via slicers → tooltips correct | ⚠️ | Same tooltip evidence; slicer interaction is runtime. |
| Filter via a published visual (pie/column) → tooltips correct | ⚠️ | Same; plus highlight tests. Service-only. |
| Cross-filtering filters other visuals on the page | ✅ | Same selection path as row 3. |
| Select with Ctrl / Alt / Shift → no unexpected behaviour | ✅ | Ctrl multi-select + toggle in `keyboard` / `scenarios`; no Alt/Shift binding hijacked. |
| View mode Actual / Fit-page / Fit-width → mouse coords accurate | ⏳ | Host applies a zoom transform to pointer coords — not verifiable in repo. **Manual.** |
| Resize the visual → responds correctly | ⚠️ | `computeLayout` is fully viewport-driven; re-rendered every `update()` (`layout`, `yRange`). Confirm visually. |
| Report size at minimum → no display errors | ⚠️ | Layout re-flows to any viewport; `stress-combos` sweeps small sizes. Confirm at the extreme min. |
| Scrollbars work / correctly sized | ⚠️ | **By design there are no scrollbars** — the SVG fits the viewport (bars compress), like native cartesian charts. Only the message box uses `overflow:auto`. |
| Pin to a Dashboard → renders | ⏳ | Stateless render from the DataView supports tile snapshots, but the service tile is **manual**. |
| Multiple copies on one report page | ⚠️ | No module-level mutable state (each `Visual` owns its DOM + fields) → instance-safe. Confirm with 2–3 copies. |
| Multiple copies across pages | ⚠️ | Same instance-isolation guarantee. |
| Switch between report pages → renders correctly | ✅ | Page-switch ghost fix (null=transient vs empty=cleared) — `scenarios` + `stress-combos`. |
| Reading mode & Edit mode → all functions work | ⏳ | No edit-only gating in render; format pane is host-driven. **Manual pass in both modes.** |
| Animations: add/change/remove elements | N/A | No data-driven animation — static SVG per update; only a CSS hover highlight (no motion). |
| Properties pane: toggles, custom text, exhaust options, bad input | ✅ | `escapeXml` on every text slice, `safeHex` on every colour, numeric clamps; combo sweep `stress-combos` + `formatpane`. |
| Save & reopen report → all settings preserved | ⚠️ | Persistence logic heavily tested incl. matrix revert repro (`legend-color-revert`, `formatting-model`); the save/reopen round-trip itself is runtime. |
| Switch pages & back → settings preserved | ⚠️ | Same persistence evidence + page-switch tests. |
| Exercise every feature & option | ⚠️ | `stress-combos` sweeps the combinatorial grid green; a full human walkthrough is still recommended. |
| All numeric / date / character types formatted correctly | ✅ | `format` + `format-multipattern`; strings via `escapeXml`; dates arrive as host-formatted category strings. |
| Formatting of tooltip values, axis labels, data labels | ✅ | `format` + `tooltip`. |
| Data labels honour the format string | ✅ | Scale-then-format pipeline respects the model format string (`format`, `format-multipattern`). |
| Toggle auto-format of numeric tooltip values | ✅ | Display-unit / format policy — `format` (`getDisplayScale`) + `format-multipattern`. |
| Data types & volumes (thousands / 1 row / 2 rows) | ✅ | `scenarios` (single row, 2+, large counts) + `perf` (10k rows). |
| Bad data: null, infinite, negative, wrong types → still works | ⚠️ | null → filtered/blank ([format.ts:92](../src/format.ts)); negative → core; wrong type → coerced/escaped. **`Infinity` renders literally** (no crash, but not specially formatted) — minor. |

## Browser test cases (optional per MS, AppSource validates Chrome/Edge/Firefox)

| Browser | Status | Note |
|---------|:------:|------|
| Windows — Chrome / Edge / Firefox (prev version) | ⏳ | **Manual.** Pure SVG + standard DOM, no browser-specific API used. |
| Windows — IE 11 (optional) | ⏳ / N/A | IE11 not targeted; ES/TS output may need transpile check if attempted. |
| macOS — Chrome / Firefox / Safari | ⏳ | **Manual.** |
| Linux — Firefox | ⏳ | **Manual.** |
| iOS — Safari / Chrome (iPad) | ⏳ | **Manual.** Touch = pointer events; verify long-press context menu. |
| Android — Chrome | ⏳ | **Manual.** |

## Power BI Desktop test cases

| Test case | Status | Evidence / note |
|-----------|:------:|-----------------|
| Exercise all features in the current Desktop | ⏳ | **Manual.** |
| Import → save → open → Publish to the service | ⏳ | **Manual** (round-trip to web). |
| Format string with 0 or 3 decimals (± precision) | ✅ | `decimalPlaces` slice feeds the format pipeline (`format`). Confirm the visual live for good measure. |

## Performance test cases

| Test case | Status | Evidence / note |
|-----------|:------:|-----------------|
| Many visual elements → runs smoothly, no app freeze | ⚠️ | `perf` "performance budget: 10k rows" is green (playbook §2.3). Live **DevTools profiling** across animation/resize/filter/select is **manual** (MS explicitly: don't trust console timers). |

---

## Manual pass required before submitting 1.1.72.0

The repo/build layer is green (411 tests). The following **cannot** be verified here and must be
run by hand on the packaged 1.1.72.0 build:

1. **Desktop round-trip** — import, save, reopen, Publish to service (settings persistence, both reading/edit modes).
2. **View modes** — Actual / Fit-page / Fit-width → pointer coordinates on bars accurate.
3. **Pin to dashboard** — tile renders.
4. **Multiple copies** — 2–3 instances on one page and across pages.
5. **Browsers** — at least Chrome + Edge + Firefox (Windows); ideally Safari/iOS + Android for touch + long-press context menu.
6. **Extreme viewport** — report at minimum size, no display error.
7. **DevTools performance profile** — resize/filter/select on a large dataset, no long tasks / freeze.
8. **Infinite-value cosmetics (optional)** — decide whether an `Infinity` measure should show blank instead of the literal string.

Everything else in the table is code-verified against the current test suite.
