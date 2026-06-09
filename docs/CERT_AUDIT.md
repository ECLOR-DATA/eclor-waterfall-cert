# Certification readiness audit — Eclor Waterfall 1.1.76.0

Audited 2026-06-09 (1.1.20.0), re-verified 2026-06-15 (1.1.43.0), 2026-07-02 (1.1.52.0), 2026-07-04 (1.1.60.0), 2026-07-05 (1.1.73.0), 2026-07-05 (1.1.74.0) and 2026-07-06 (1.1.76.0) against the official requirements at
[Get your Power BI visuals certified](https://learn.microsoft.com/en-us/power-bi/developer/visuals/power-bi-custom-visuals-certified) (doc version 2025-12-15).
Audit performed on the 1.1.76.0 source (branch `certification`), artifact `releases/eclorWaterfallECLOR2026.1.1.76.0.pbiviz`. The 1.1.43.0→1.1.52.0 change was a **data-query capability change**: the `dataViewMappings` moved from `categorical` to `matrix` (same data roles, unchanged `conditions`) with engine **row subtotals** (Total/SubTotal API, [official doc](https://learn.microsoft.com/en-us/power-bi/developer/visuals/total-subtotal-api)) so the variance rails read the host-computed category-grain aggregate instead of re-aggregating leaf rows client-side (which is mathematically invalid for ratio measures).

The 1.1.52.0→1.1.76.0 delta is **formatting-object additions, one icon asset re-rasterization, hardening, a developer-only diagnostic overlay removed, and a legend-aggregation bug fix — the data query is unchanged** (`dataViewMappings` matrix + `subtotals` block byte-for-byte identical; the only `dataRoles` difference is a wording refinement in one optional-measure description):

- **New format-pane objects/properties** (standard `persistProperties` / DataView-object plumbing, no new APIs):
  - `legend`: `applyTo` (enum: pillars+bridges / pillars only / bridges only) and `applyToGrandTotal` (bool) scope switches; per-legend-value colours now persist through **numbered card-level metadata slots** `itemColor0…23`, `segmentLabelColor0…23`, `segmentLabelBgColor0…23` (metadata properties — the persistence path that round-trips under the matrix mapping); a dedicated segment-label font (`segmentLabelFontFamily` / `segmentLabelFontSize` / `segmentLabelBold` / `segmentLabelItalic` / `segmentLabelUnderline`).
  - `analysisTable` (footnote table): value colours simplified to `pillarValuesColor` plus the sign-aware `bridgeValuesPositiveColor` / `bridgeValuesNegativeColor`; the earlier fx `color` property was **removed** (an old report's orphan value is simply ignored — backward compatible). Full row-label font added (`rowLabelFontFamily` / `rowLabelFontSize` / `rowLabelItalic` / `rowLabelUnderline`, reusing the legacy `rowLabelBold`).
  - `variationArc`: per-arc `showArc` + `arrowEnds` (added 1.1.60–1.1.66), unchanged since.
- **Icon asset**: `assets/icon.png` re-rasterized from the committed vector source at **20×20 RGBA** — Microsoft's Visualizations-pane spec (the prior 44×44 rendered blank in the pane). Design unchanged.
- **Bug-fix (persistence, no data-query impact)**: per-legend-value colours reverted on every pick because a selector carrying a matrix-synthesized opaque identity is dropped by the host; they now persist via the numbered card-level metadata slots listed above (the same path `titleColor` / `grandTotalColor` already use).
- **Hardening / a11y / localization** carried forward from 1.1.60: `escapeXmlAttr` on every fx-resolved fill before SVG attribute injection, high-contrast palette on the legend, and en-US/fr-FR parity on every runtime user-facing string.
- **1.1.74.0 — diagnostic removal**: dropped the developer-only legend-persistence overlay (the gated on-canvas debug dump added in 1.1.67 to capture the colour-revert at runtime). It never sat in any data path, added no privileges, and only wrote a `<div>` of DataView key names on top of the SVG. No API, data-query, capability, or rendering-behaviour change; the bundle is smaller.
- **1.1.75.0 — dedicated Grand total format card**: the Grand total controls (`showGrandTotal` / `grandTotalLabel` / `grandTotalColor`) moved out of the `general` object into a new **`grandTotal`** object, joined by an independent label-style set (`grandTotalLabelColor`, `labelBgShow` / `labelBgColor` / `labelBgTransparency`, and a font: `fontFamily` / `fontSize` / `bold` / `italic` / `underline`). Standard DataView-object plumbing, **no new APIs**; the synthetic Grand Total pillar's value label now reads these slices instead of the Pillars card. The pane hierarchy is arranged display-only after `buildFormattingModel` — persistence stays keyed per object. New localization key `Visual_GrandTotal` (en-US + fr-FR, 1:1 parity preserved).
- **1.1.76.0 — legend aggregation fix (no capability change)**: stacked legend segments are now aggregated **by legend value at the X-axis grain** rather than one segment per leaf row, so a legend bound alongside a Table (analysisDim) field no longer repeats each legend value once per analysisDim row (which demultiplied the stacked slices and the tooltip breakdown). Pure client-side aggregation/rendering fix — `dataViewMappings`, the `subtotals` block, data roles and `"privileges": []` are all unchanged. 416 tests / 27 suites green.

Everything the host ships stays inside the standard DataView — **no new privileges (`"privileges": []` unchanged), no network access, no storage, no new DOM APIs**; the forbidden-API bundle scan below was re-run on the 1.1.76.0 package with the same results.

## Command requirements

| Requirement | Result |
|---|---|
| `npm install` | ✅ clean (Node 22, npm 11) |
| `npm audit` — no high/moderate warnings | ✅ **0 vulnerabilities** (any level) |
| `pbiviz package` | ✅ builds; `--certification-audit` reports **no external requests** |
| ESLint (`eslint-plugin-powerbi-visuals` recommended config) | ✅ 0 errors via the required script `npm run eslint` (`npx eslint . --ext .js,.jsx,.ts,.tsx`) |

`npm audit` notes: production dependencies are exclusively Microsoft `powerbi-visuals-*` packages. Two `overrides` pin patched transitive dev-tool versions without major bumps: `minimatch@^9.0.0 → ^9.0.7` (ReDoS advisories) and `sockjs > uuid → ^11.1.1` (GHSA-w5hq-g745-h8pq; dev-server-only path). Re-audited 2026-07-02: new dev-tooling advisories (webpack-dev-server, ws, launch-editor, js-yaml — all dev-server/test paths, none shipped) patched via `npm audit fix` within semver; the shipped bundle is byte-identical before/after (dev-only dependency graph). Re-audited 2026-07-04 (1.1.60.0), 2026-07-05 (1.1.73.0), 2026-07-05 (1.1.74.0) and 2026-07-06 (1.1.76.0): **0 vulnerabilities**, no new advisories.

## File / repository requirements

| Requirement | Result |
|---|---|
| Latest `powerbi-visuals-tools` | ✅ 7.1.0 |
| Latest API | ✅ `powerbi-visuals-api` 5.11.0 |
| `.gitignore` covers `node_modules`, `.tmp`, `dist` | ✅ (none of the three are tracked) |
| `capabilities.json`, `pbiviz.json`, `package.json`, `package-lock.json`, `tsconfig.json` present | ✅ |
| `typescript`, `eslint`, `eslint-plugin-powerbi-visuals` installed | ✅ |
| Required `"eslint"` npm script | ✅ exact wording (eslint kept at v8: the required `--ext` flag errors under eslint 9 flat config) |
| Branch named `certification` (lowercase), matching the submitted package | ✅ branch exists; pointer = the commit that builds the submitted artifact |
| Single visual, no unrelated code, no minified files in repo | ✅ |
| CI | ✅ `lint → tsc → jest (416 tests, 27 suites) → pbiviz package` on every push to `main` / `certification` |

## Source-code requirements (verified on BOTH `src/` and the shipped minified bundle extracted from the `.pbiviz`)

| Forbidden | Bundle scan result |
|---|---|
| `fetch` / `XMLHttpRequest` / `WebSocket` / `sendBeacon` / `EventSource` / `Worker` | 0 matches |
| `eval` / `Function()` / string `setTimeout` / `setInterval` | 0 matches |
| `innerHTML` / `outerHTML` / `document.write` / `insertAdjacentHTML` | 0 matches |
| `localStorage` / `sessionStorage` / `indexedDB` / `document.cookie` | 0 matches |
| `postMessage` / `window.top` / `window.opener` / `window.parent` | 0 matches |
| External URLs | `http://www.w3.org/2000/svg` (XML namespace constant, inert) + the visual's own `supportUrl`/`gitHubUrl` metadata strings from `pbiviz.json` (declarative manifest fields, no code path requests them; present in every previously submitted bundle) |

| Required | Result |
|---|---|
| Rendering Events API | ✅ `renderingStarted` on every update; `renderingFinished` on every exit path; `renderingFailed` in the catch |
| Safe DOM manipulation / input sanitization | ✅ SVG built as text then parsed via `DOMParser` into nodes; every user-derived string passes `escapeXml()`; every colour passes `safeHex()` regex validation; landing page built via `createElement` only |
| Public reviewable OSS only | ✅ production deps = 5 Microsoft `powerbi-visuals-*` packages, nothing else |
| `WebAccess` privileges empty | ✅ `"privileges": []` (verified in both `capabilities.json` and the shipped package) |

## Additional posture

- `dataReductionAlgorithm` capped at 10 000 points (cert perf budget).
- Accessibility: `supportsKeyboardFocus`, ARIA roles/labels, focus indicators, high-contrast palette support.
- Localization: en-US + fr-FR with 1:1 key parity.
- Privacy: no data collection of any kind — see [PRIVACY.md](PRIVACY.md) (includes a verified audit trail).
- TypeScript strict (`strictNullChecks`, `noImplicitAny`, `noImplicitReturns`); `tsc --noUnusedLocals --noUnusedParameters` reports zero dead code.
