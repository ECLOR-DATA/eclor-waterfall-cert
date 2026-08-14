/**
 * Adds the POST-CERTIFICATION scenario pages to audit/test-report.
 *
 * The 8 original pages (nominal, interactions, nulls, negatives, hostile
 * labels, multi-instance, 10k, tiny) cover the Microsoft robustness matrix.
 * They predate 1.2.0.0, so nothing in them exercises the 19 capabilities
 * properties added since the certified build — which is exactly what a
 * reviewer would look at first on a version jumping 1.1.76 → 1.3.x.
 *
 * These five pages close that gap, one page per feature family, each laid out
 * so a SCREENSHOT is enough to judge it: the reference and the variant sit
 * side by side, so "did the option do anything?" is answered by comparison
 * rather than by memory.
 *
 * Re-runnable: it only rewrites the p9..p13 folders and the page order.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PAGES = "audit/test-report/test-report.Report/definition/pages";
const GUID = "eclorWaterfallPREVIEW130";
const W = 1280;
const H = 720;

const SCHEMA_VC =
  "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json";
const SCHEMA_PAGE =
  "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.0.0/schema.json";

/* ---------- expressions ---------- */
const lit = (v) => ({ expr: { Literal: { Value: v } } });
const bool = (b) => lit(String(!!b));
const num = (n) => lit(`${n}D`);
const str = (s) => lit(`'${s}'`);
const color = (hex) => ({ solid: { color: lit(`'${hex}'`) } });

const colField = (entity, prop) => ({
  Column: { Expression: { SourceRef: { Entity: entity } }, Property: prop }
});
/** Grouping projection (category / legend / analysisDim). */
const grp = (entity, prop, active = false) => ({
  field: colField(entity, prop),
  queryRef: `${entity}.${prop}`,
  nativeQueryRef: prop,
  ...(active ? { active: true } : {})
});
/** Aggregated column projection (actual / variance on a DATATABLE column). */
const agg = (entity, prop) => ({
  field: { Aggregation: { Expression: colField(entity, prop), Function: 0 } },
  queryRef: `Sum(${entity}.${prop})`,
  nativeQueryRef: `Sum of ${prop}`
});
/** Model measure projection (KPI table). */
const meas = (prop) => ({
  field: { Measure: { Expression: { SourceRef: { Entity: "KPI" } }, Property: prop } },
  queryRef: `KPI.${prop}`,
  nativeQueryRef: prop
});
const measSel = (prop) => ({ metadata: `KPI.${prop}` });
const catSel = (entity, prop, value) => ({
  data: [
    {
      scopeId: {
        Comparison: {
          ComparisonKind: 0,
          Left: colField(entity, prop),
          Right: { Literal: { Value: `'${value}'` } }
        }
      }
    }
  ]
});

let z = 1000;
const wf = (name, pos, queryState, objects, caption) => ({
  $schema: SCHEMA_VC,
  name,
  position: { x: pos[0], y: pos[1], z: (z += 1), height: pos[3], width: pos[2], tabOrder: z * 10 },
  visual: {
    visualType: GUID,
    query: { queryState },
    objects,
    visualContainerObjects: {
      title: [
        {
          properties: {
            text: str(caption.replace(/'/g, "''")),
            fontSize: num(10),
            bold: bool(true)
          }
        }
      ],
      padding: [{ properties: { left: num(6), top: num(6), right: num(6), bottom: num(6) } }]
    },
    drillFilterOtherVisuals: true
  }
});

/* ---------- shared query shapes ---------- */
const nominalQS = (withVariance = true, extra = {}) => ({
  category: { projections: [grp("Nominal", "Category", true)] },
  actual: { projections: [agg("Nominal", "Actual")] },
  ...(withVariance ? { variance: { projections: [agg("Nominal", "Variance")] } } : {}),
  ...extra
});
const compare3QS = (extra = {}) => ({
  category: { projections: [grp("Compare3", "Country", true)] },
  actual: { projections: [meas("Actual M-2"), meas("Actual M-1"), meas("Actual M")] },
  ...extra
});

const pages = [];
const add = (name, displayName, visuals) => pages.push({ name, displayName, visuals });

/* ---- P9 : orientation ---- */
add("p9-orientation", "P9 Orientation", [
  wf("p9-h", [16, 16, 616, 688], nominalQS(), { general: [{ properties: { mode: str("cumulative"), orientation: str("horizontal") } }] },
    "Horizontal (rendu certifié)"),
  wf("p9-v", [648, 16, 616, 688], nominalQS(), { general: [{ properties: { mode: str("cumulative"), orientation: str("vertical") } }] },
    "Vertical (1.2.0.0)")
]);

/* ---- P10 : styles de rails × orientation ---- */
{
  const cell = (i) => [16 + (i % 4) * 314, 16 + Math.floor(i / 4) * 346, 298, 330];
  const styleChart = (n, i, style, orientation, extraRails, cap) =>
    wf(n, cell(i), nominalQS(), {
      general: [{ properties: { mode: str("cumulative"), orientation: str(orientation) } }],
      rails: [{ properties: { railStyle: str(style), railHeight: num(46), fontSize: num(7), ...extraRails } }],
      pillars: [{ properties: { fontSize: num(7) } }],
      bridges: [{ properties: { fontSize: num(7) } }],
      xAxis: [{ properties: { fontSize: num(7) } }],
      yAxis: [{ properties: { fontSize: num(7) } }]
    }, cap);
  add("p10-rail-styles", "P10 Rail styles", [
    styleChart("p10-v-bars", 0, "bars", "vertical", {}, "V · bars (défaut)"),
    styleChart("p10-v-pin", 1, "pin", "vertical", {}, "V · pin"),
    styleChart("p10-v-labels", 2, "labels", "vertical", {}, "V · labels only"),
    styleChart("p10-v-chips", 3, "chips", "vertical", {}, "V · chips"),
    styleChart("p10-v-outlined", 4, "outlined", "vertical", {}, "V · outlined"),
    styleChart("p10-v-hatched", 5, "hatched", "vertical", {}, "V · hatched"),
    styleChart("p10-v-neutral", 6, "bars", "vertical", { neutralThresholdPct: num(20) }, "V · seuil neutre 20 % (max du réglage)"),
    styleChart("p10-h-pin", 7, "pin", "horizontal", {}, "H · pin (témoin)")
  ]);
}

/* ---- P11 : remplissage + contour des piliers × orientation ---- */
{
  const fills = { pillarFillStyle: str("hatched"), outlineShow: bool(true), outlineColor: color("#091612"), outlineWidth: num(2), outlineStyle: str("dashed") };
  const perCat = [
    { properties: { fillStyle: str("outlined") }, selector: catSel("Nominal", "Category", "Q2 Sales") },
    { properties: { fillStyle: str("solid") }, selector: catSel("Nominal", "Category", "Q4 Sales") }
  ];
  add("p11-pillar-styles", "P11 Pillar styles", [
    wf("p11-h", [16, 16, 616, 688], nominalQS(false), {
      general: [{ properties: { mode: str("cumulative"), orientation: str("horizontal") } }],
      pillars: [{ properties: fills }, ...perCat]
    }, "H · hachuré + contour, overrides par catégorie"),
    wf("p11-v", [648, 16, 616, 688], nominalQS(false), {
      general: [{ properties: { mode: str("cumulative"), orientation: str("vertical") } }],
      pillars: [{ properties: fills }, ...perCat]
    }, "V · identique (1.3.2.0)")
  ]);
}

/* ---- P12 : overrides par pilier-mesure + masquage de segment ---- */
{
  const overrides = [
    { properties: { measureFillColor: color("#808080"), fillStyle: str("hatched"), outlineMode: str("on"), outlineColorOverride: color("#091612"), outlineWidthOverride: num(2), outlineStyleOverride: str("dashed") }, selector: measSel("Actual M-2") },
    { properties: { measureFillColor: color("#46EAFF"), fillStyle: str("outlined") }, selector: measSel("Actual M-1") },
    { properties: { measureFillColor: color("#1EF5B1"), fillStyle: str("solid"), outlineMode: str("off") }, selector: measSel("Actual M") }
  ];
  const base = { general: [{ properties: { mode: str("comparison") } }], connectors: [{ properties: { showConnectors: bool(true) } }], variationArc: [{ properties: { show: bool(true) } }] };
  add("p12-measure-overrides", "P12 Measure overrides", [
    wf("p12-ref", [16, 16, 616, 688], compare3QS(), base, "Référence — aucun override"),
    wf("p12-ovr", [648, 16, 616, 688], compare3QS(), { ...base, pillars: [...overrides, { properties: { showBridgesBefore: bool(false) }, selector: measSel("Actual M-1") }] },
      "Overrides + segment M-2→M-1 masqué (connecteur inter-piliers supprimé en 1.3.1.0)")
  ]);
}

/* ---- P13 : largeur + retour à la ligne des en-têtes de table ---- */
{
  const qs = () => compare3QS({ analysisDim: { projections: [grp("Compare3", "Segment")] } });
  const tbl = (props) => [{ properties: { fontSize: num(8), rowLabelFontSize: num(8), ...props } }];
  const cell = (i) => [16 + (i % 2) * 632, 16 + Math.floor(i / 2) * 346, 616, 330];
  add("p13-table-width", "P13 Table width & wrap", [
    wf("p13-h-auto", cell(0), qs(), { general: [{ properties: { mode: str("comparison"), orientation: str("horizontal") } }], analysisTable: tbl({ rowHeaderWidth: num(0) }) }, "H · Auto"),
    wf("p13-h-fix", cell(1), qs(), { general: [{ properties: { mode: str("comparison"), orientation: str("horizontal") } }], analysisTable: tbl({ rowHeaderWidth: num(180) }) }, "H · Row header 180 px"),
    wf("p13-v-auto", cell(2), qs(), { general: [{ properties: { mode: str("comparison"), orientation: str("vertical") } }], analysisTable: tbl({ columnWidth: num(0), headerLines: num(1) }) }, "V · Auto, 1 ligne (tronqué)"),
    wf("p13-v-wrap", cell(3), qs(), { general: [{ properties: { mode: str("comparison"), orientation: str("vertical") } }], analysisTable: tbl({ columnWidth: num(70), headerLines: num(2) }) }, "V · 70 px + 2 lignes (entier)")
  ]);
}

/* ---------- emit ---------- */
for (const p of pages) {
  const dir = join(PAGES, p.name);
  if (existsSync(dir)) for (const e of readdirSync(dir)) rmSync(join(dir, e), { recursive: true, force: true });
  mkdirSync(join(dir, "visuals"), { recursive: true });
  writeFileSync(
    join(dir, "page.json"),
    JSON.stringify({ $schema: SCHEMA_PAGE, name: p.name, displayName: p.displayName, displayOption: "FitToPage", height: H, width: W }, null, 2) + "\n"
  );
  for (const v of p.visuals) {
    mkdirSync(join(dir, "visuals", v.name), { recursive: true });
    writeFileSync(join(dir, "visuals", v.name, "visual.json"), JSON.stringify(v, null, 2) + "\n");
  }
}
const metaPath = join(PAGES, "pages.json");
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
meta.pageOrder = [...meta.pageOrder.filter((n) => !n.startsWith("p9") && !n.startsWith("p10") && !/^p1[0-3]-/.test(n)), ...pages.map((p) => p.name)];
writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
console.log(pages.map((p) => `${p.name.padEnd(22)} ${p.visuals.length} visuels`).join("\n"));
console.log("pageOrder :", meta.pageOrder.length, "pages");
