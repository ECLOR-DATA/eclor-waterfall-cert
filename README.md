# Eclor Waterfall — Power BI Custom Visual

Advanced waterfall chart for Power BI with dual modes (**Cumulative** and **Comparison**), Y-axis floor offset for variation amplification, broken-axis indicator, variation arcs between pillars, and an optional analysis-dimension footnote table aligned with the bars.

## Features

- **Cumulative mode** — N pillars chained by bridges, with optional synthetic Grand Total pillar.
- **Comparison mode** — 2+ measures compared through a synthesized variance bridge (supports M ≥ 3).
- **Y-axis floor offset** — amplify small variations by raising the chart floor; broken-axis indicator drawn automatically.
- **Variation arcs** — brackets between consecutive pillars showing Δ% / Δabs / custom measure, configurable per arc.
- **Analysis table** — Excel-style footnote rows under the chart, aligned with bars, with matrix-style cross-filtering (per-cell composite selection) and focused per-cell tooltips.
- **Legend / stacked segments**, per-measure and per-category colour overrides, conditional-formatting (fx) colour rules on bars and labels.
- **Accessibility** — keyboard navigation, ARIA labels, visible focus indicators, high-contrast theme support.
- **Localization** — en-US and fr-FR.

## Commands

```bash
npm install            # bootstrap
npm run start          # pbiviz dev server (requires Power BI developer mode)
npm run lint           # eslint over src/
npm run eslint         # full lint pass (certification command)
npx tsc --noEmit       # type-check
npm test               # jest (167 tests)
npm run package        # build dist/*.pbiviz
```

CI runs `lint → tsc → jest → pbiviz package` on every push to `main` and `certification` — see [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Data roles

| Role | Purpose |
|---|---|
| **Category** | X-axis dimension (one bar per unique value) |
| **Values** | One or more measures (1 in cumulative; 2+ for comparison bridges) |
| **Variance** | Optional variance measures rendered as rails above the chart |
| **Legend** | Optional dimension for stacked segments |
| **Table** | Optional analysis dimension for the footnote table |
| **Tooltips** | Extra measures shown in the hover tooltip |

## Project structure

```
# ── Manifest ───────────────────────────────────────────────────
├── pbiviz.json                  # Visual manifest (version, GUID, asset/locale pointers)
├── capabilities.json            # Data roles + format-pane object definitions
#
# ── Shipped in the .pbiviz bundle ──────────────────────────────
├── src/                         # TypeScript source
│   ├── visual.ts                # Main IVisual class (parse, layout, SVG render)
│   ├── settings.ts              # FormattingSettingsModel (format pane)
│   ├── format.ts                # Pure number/format-string helpers
│   ├── tooltip.ts               # Pure tooltip payload builder
│   └── yRange.ts                # Pure Y-axis range computation
├── style/visual.less            # Container / hover / focus / high-contrast styles
├── assets/                      # Visual icon (png + svg)
├── stringResources/             # en-US + fr-FR localization (resjson)
#
# ── Repo support (never bundled) ───────────────────────────────
├── test/                        # Jest + jsdom test suites
├── sample/                      # Demo dataset (CSV) + .pbix build guide
├── docs/                        # PRIVACY.md, CERT_AUDIT.md
├── tools/                       # Offline dev utilities (audit-render.mjs)
├── releases/                    # Packaged .pbiviz artifacts
├── .github/workflows/ci.yml     # CI: lint → tsc → jest → pbiviz package
#
# ── Config & meta ──────────────────────────────────────────────
├── package.json                 # npm dependencies + scripts
├── tsconfig.json                # TypeScript strict config
├── jest.config.js               # Jest + jsdom + ts-jest
├── README.md / CONTEXT.md / CHANGELOG.md   # Docs
└── LICENSE
```

## Design & quality posture

- No external network calls, no persistent storage, no telemetry — see [docs/PRIVACY.md](docs/PRIVACY.md).
- `"privileges": []` — no elevated privilege requested.
- Every user-derived string is XML-escaped before SVG injection; every colour value is regex-validated.
- TypeScript strict (`strictNullChecks`, `noImplicitAny`, `noImplicitReturns`).
- `npm audit` returns 0 vulnerabilities; certification readiness detailed in [docs/CERT_AUDIT.md](docs/CERT_AUDIT.md).
- Design rationale and architectural decisions: [CONTEXT.md](CONTEXT.md). Version history: [CHANGELOG.md](CHANGELOG.md).

## Known limitations

One behaviour is documented rather than fixed, deliberately.

**A conditional-formatting RULE on the pillar colour also changes the pillar
FALLBACK.** When `Pillars → Pillar colour` carries an fx *rule* (not a
constant), the first colour the rule resolves becomes the fallback used by
pillars that have no colour of their own — the synthesized comparison anchors,
the Grand total, and the legend segment defaults. An explicitly set colour
always wins, so the remedy is direct: give each measure pillar its colour in
`Pillars → <measure>`, and the Grand total its own in the `Grand total` card.
A constant fx is unaffected (its value *is* the right fallback).

Rail styles, the neutral threshold, pillar fill styles and outlines all apply
in both orientations since 1.3.3.0.

## License

See [LICENSE](LICENSE).

## Contact

ECLOR — contact@eclor-data.com
