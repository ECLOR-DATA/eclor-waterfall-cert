# AppSource compliance matrix — Eclor Waterfall

> Self-audit against the Microsoft **Commercial Marketplace certification policies §1180 / §1200**
> and the **Guidelines for publishing Power BI custom visuals**.
> Version checked: **1.1.72.0** · API `5.11.0` · Date: **2026-07-05**

Legend: ✅ compliant · ⚠️ compliant with note · ⏳ action required (outside the repo, in Partner Center) · ❌ not met · N/A not applicable

---

## §1180.1 — Acquisition, pricing & terms

| # | Requirement | Status | Evidence / note |
|---|-------------|:------:|-----------------|
| 1180.1 | Visual must be free (IAP optional) | ✅ | Free, no IAP, no license gate. Marketplace listing has no "additional purchase" tag. |
| 1180.1 | If IAP → comply with IAP guidelines | N/A | No in-app purchase. |

## §1180.2 — Functionality

| # | Requirement | Status | Evidence / note |
|---|-------------|:------:|-----------------|
| a | Runs on Desktop, Online, Mobile apps, Windows universal apps | ✅ | Pure SVG rendered into the host viewport, re-laid out on every `update()` from `options.viewport`. No platform-specific API. |
| b | Works on touch-only devices (no keyboard/mouse) | ⚠️ | All interactions are pointer events (tap = click, long-press = context menu). Keyboard is an *enhancement* (`supportsKeyboardFocus: true`), never a requirement. Verify on a mobile tenant before submit. |
| c | **Context menu (right-click)** on all visuals | ✅ | `handleContextMenu` → `selectionManager.showContextMenu(...)` — [src/visual.ts:1252](../src/visual.ts). |
| d | Core PBI functions: pin to dashboard, focus mode, formatting data types | ✅ | Standard viewport render → pinnable & focus-mode ready. Number formatting honours the model format string + display units ([src/format.ts](../src/format.ts)). |
| e | Data test — **String values** | ✅ | Category / legend / analysis-dim are string groupings; every user string passes `escapeXml()` before SVG injection. |
| f | Data test — **Empty values** | ✅ | `parseDataView` handles null/empty; two empty-state branches (transient vs user-cleared). See CLAUDE.md gotchas. |
| g | Data test — **Negative values** | ✅ | Core to the waterfall: pillar y0/y1 sign fork, bridge negative clipping, sign-aware fx colours. |
| h | Data test — **≥ 20 000 rows** | ⚠️ | `dataReductionAlgorithm { top: 10000 }` on the matrix rows — host caps the feed, visual never receives an unbounded set, so no crash at 20k. Cap is 10k categories (far beyond any sane waterfall). |
| i | Data test — **16-digit large numbers** | ⚠️ | Formatted via `toLocaleString`/`toFixed`; renders without error. Values > 2^53 carry JS float rounding (host-side limitation, not a crash). |
| j | No functionality outside the visual without user permission | ✅ | No `launchUrl`, `window.open`, navigation or redirect anywhere in `src/`. |
| k | Must not prompt to install additional files | ✅ | Self-contained bundle; `externalJS: []`, `dependencies: null`. |
| l | Must not prompt for Microsoft credentials | ✅ | No authentication of any kind. |
| m | No pop-up windows unless user-triggered | ✅ | Visual opens no windows. |
| n | No unreasonably high / full-control permissions | ✅ | `"privileges": []` in [capabilities.json](../capabilities.json) — no WebAccess, no ExportContent. |
| o | External-account sign in/out/up experience | N/A | No external account or service. |
| p | **Sample `.pbix` matching the packaged `.pbiviz` version** | ❌ | No sample `.pbix` in the repo. **Must be produced and uploaded in Partner Center** for the submitted 1.1.72.0 build (add Hints & Tips inside it). Blocking for cert. |

## §1200.1 — Additional certification requirements

| # | Requirement | Status | Evidence / note |
|---|-------------|:------:|-----------------|
| 1200.1.1 | Code repository available & correctly formatted | ✅ | Public: `github.com/ECLOR-DATA/eclor-waterfall`. Cert repo is single-commit sanitised copy, byte-identical to the submitted package. |
| 1200.1.2 | Code readable/maintainable, matches the package | ✅ | Modular `src/` (visual/settings/format/tooltip/yRange/paneLayout), 354 tests / 17 suites; version in `pbiviz.json` = `package.json` = repo tag. |
| 1200.1.3 | Code security — no customer data sent externally | ✅ | No `fetch`/XHR/WebSocket/postMessage; only URLs are the SVG XML namespace. `externalJS: []`, `privileges: []`. |
| 1200.1.4 | Dev commands run without errors | ✅ | CI gate on every push: `lint → tsc → jest → pbiviz package` (all green). |
| 1200.1.5 | Updates must be re-certified | ℹ️ | Process note: each new version requires a fresh cert submission. `certification` branch tracks the submitted build. |
| 1200.2 | Visuals relying on external services are NOT cert-eligible | ✅ | No external service → eligible for certified track. |

## Publishing guidelines (best-practice layer)

| # | Guideline | Status | Evidence / note |
|---|-----------|:------:|-----------------|
| G1 | Context menu enabled | ✅ | See §1180.2(c). |
| G2 | Commercial logo grey `#C8C8C8`, edit-mode only | N/A | No commercial logo embedded in the visual → nothing to violate. |
| G3 | In-visual landing page | ✅ | `supportsLandingPage: true` — empty-state guidance shown when unbound. |
| G4 | Marketing landing page (how-to + license info) | ⏳ | Public site `eclor-data.github.io` exists; confirm it's linked from the Partner Center listing. |
| G5 | No auto-triggered videos | ✅ | None. |
| G6 | License-key field at top of format pane | N/A | Free visual, no license token. |
| G7 | Short screen-recording of the visual | ⏳ | Partner Center listing asset — record before submit. |
| G8 | Detailed description incl. HC / report-page tooltip / drill-down | ⚠️ | Features present (HC ✅, `tooltips.canvas: true` ✅, `drilldown.roles: ["category"]` ✅); ensure they're spelled out in the AppSource description. |
| G9 | Handle unhandled exceptions / code quality | ✅ | Empty-state + data-cap guards; `safeHex`/`escapeXml` sanitisation; lint clean. |
| G10 | Use the latest API | ✅ | `apiVersion 5.11.0` (current stable line). |

---

## Open items before submitting 1.1.72.0

1. **❌ Sample `.pbix`** — build a demo report on 1.1.72.0, embed Hints & Tips, upload in Partner Center. *(blocking)*
2. **⏳ Listing assets** — screen-recording video (G7) + confirm marketing landing-page link (G4).
3. **⏳ Description copy** — enumerate HC, report-page tooltip, drill-down support (G8).
4. **⚠️ Touch pass** — smoke-test tap + long-press context menu on a mobile/online tenant (§1180.2 b).

Everything in the `src/` / `capabilities.json` / build layer is compliant. The remaining gaps are **submission artifacts and listing copy**, not code.
