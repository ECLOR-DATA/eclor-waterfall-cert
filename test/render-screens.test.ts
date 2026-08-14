/**
 * Offline screenshot generator — feat/vertical-waterfall audit renders.
 *
 * Extends the tools/audit-render.mjs pattern one level up: instead of
 * replicating buildSVG's geometry by hand, this suite drives the REAL
 * renderer (full update() through the jsdom harness), serialises the SVG
 * frame and rasterises it to PNG under docs/screens/feat-vertical/.
 *
 * Gated: only runs when RENDER_SCREENS=1 (normal `npm test` skips it).
 *   RENDER_SCREENS=1 npx jest test/render-screens.test.ts
 * PNG needs the optional @resvg/resvg-js (npm i --no-save @resvg/resvg-js);
 * without it the suite still writes the .svg files.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeVisual, dvBuild } from "./_harness";

const ENABLED = process.env.RENDER_SCREENS === "1";
const d = ENABLED ? describe : describe.skip;

const OUT_DIR = resolve(__dirname, "..", "docs", "screens", "feat-vertical");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Resvg: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Resvg = require("@resvg/resvg-js").Resvg;
} catch {
  /* PNG step skipped */
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dv = any;

function save(name: string, target: HTMLElement): void {
  const svg = target.querySelector("svg");
  expect(svg).toBeTruthy();
  // The product ships these default states in style/visual.less (focus rings
  // hidden until :focus-visible, hover backgrounds transparent). The
  // serialised SVG has no stylesheet, so re-inject them for rasterisation —
  // without this the rings paint dashed blue and table hover rects black.
  const svgStr = svg!.outerHTML.replace(
    "<style>",
    "<style>.wf-focus-ring{opacity:0}.wf-table-row-bg{fill:transparent}.wf-table-row-focus{opacity:0}"
  );
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, `${name}.svg`), svgStr);
  if (Resvg) {
    const png = new Resvg(svgStr, { background: "#ffffff" }).render().asPng();
    writeFileSync(resolve(OUT_DIR, `${name}.png`), png);
  }
}

function renderAndSave(name: string, dv: Dv, viewport = { width: 900, height: 560 }): void {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  save(name, target);
}

/** CFO-style dataset: 2 anchors + 4 signed bridges. */
const CATS = ["FY24", "Volume", "Price", "Mix", "Churn", "FY25"];
const FLAGS = [true, false, false, false, false, true];
const VALUES = [2900, 260, 130, -220, -390, 2680];

function catObjects(): Record<string, unknown>[] {
  return FLAGS.map((f) => ({ pillars: { isPillar: f } }));
}

function baseObjects(orientation: string, extra?: Record<string, unknown>) {
  return {
    general: { orientation },
    connectors: { showConnectors: true },
    ...(extra || {})
  };
}

d("offline renders — feat/vertical-waterfall", () => {
  test("v-cumulative-base: pillars + bridges + GT + connectors", () => {
    const dv = dvBuild({
      cats: [{ name: "Driver", values: CATS, objects: catObjects() }],
      vals: [{ name: "Revenue", role: "actual", values: VALUES, format: "#,##0" }]
    }) as Dv;
    dv.metadata.objects = baseObjects("vertical");
    renderAndSave("v-cumulative-base", dv);
  });

  test("h-witness-cumulative: same dataset, horizontal control frame", () => {
    const dv = dvBuild({
      cats: [{ name: "Driver", values: CATS, objects: catObjects() }],
      vals: [{ name: "Revenue", role: "actual", values: VALUES, format: "#,##0" }]
    }) as Dv;
    dv.metadata.objects = baseObjects("horizontal");
    renderAndSave("h-witness-cumulative", dv);
  });

  test("v-comparison-rails-table: M=2 + floor offset + broken axis + rails + table", () => {
    const catExp: string[] = [];
    const adimExp: string[] = [];
    const valExp: number[] = [];
    const varExp: number[] = [];
    CATS.forEach((c, i) => {
      ["EMEA", "Americas", "APAC"].forEach((r, ri) => {
        catExp.push(c);
        adimExp.push(r);
        const share = [0.5, 0.3, 0.2][ri];
        valExp.push(VALUES[i] * share);
        varExp.push((VALUES[i] / 20) * share);
      });
    });
    const dv = dvBuild({
      cats: [
        { name: "Driver", values: catExp, objects: catExp.map((c) => ({ pillars: { isPillar: FLAGS[CATS.indexOf(c)] } })) },
        { name: "Region", values: adimExp, isAnalysisDim: true }
      ],
      vals: [
        { name: "Revenue", role: "actual", values: valExp, format: "#,##0" },
        { name: "Δ vs LY", role: "variance", values: varExp, format: "+#,##0;-#,##0" },
        { name: "Δ vs BU", role: "variance", values: varExp.map((v) => -v / 2) }
      ]
    }) as Dv;
    dv.metadata.objects = baseObjects("vertical", {
      general: { orientation: "vertical", mode: "comparison" },
      yAxis: { yMinOffset: 55, showBrokenAxis: true },
      grandTotal: { showGrandTotal: false }
    });
    renderAndSave("v-comparison-rails-table", dv, { width: 1100, height: 620 });
  });

  test("v-comparison-m3-arcs: three measures, variation arcs on", () => {
    const dv = dvBuild({
      cats: [
        { name: "BU", values: ["Retail", "B2B", "Retail", "B2B", "Retail", "B2B"] },
        { name: "Split", values: ["x", "x", "y", "y", "z", "z"], isAnalysisDim: true }
      ],
      vals: [
        { name: "FY23", role: "actual", values: [600, 400, 300, 250, 200, 150], format: "#,##0" },
        { name: "FY24", role: "actual", values: [660, 420, 310, 300, 220, 160], format: "#,##0" },
        { name: "FY25", role: "actual", values: [700, 460, 330, 310, 260, 170], format: "#,##0" }
      ]
    }) as Dv;
    dv.metadata.objects = {
      general: { orientation: "vertical", mode: "comparison" },
      variationArc: { show: true },
      analysisTable: { show: false },
      connectors: { showConnectors: true }
    };
    renderAndSave("v-comparison-m3-arcs", dv, { width: 1000, height: 620 });
  });

  test("v-cumulative-legend: stacked legend + strip on top + GT", () => {
    const catExp: string[] = [];
    const legExp: string[] = [];
    const valExp: number[] = [];
    CATS.forEach((c, i) => {
      ["Direct", "Partner"].forEach((l, li) => {
        catExp.push(c);
        legExp.push(l);
        valExp.push(VALUES[i] * [0.65, 0.35][li]);
      });
    });
    const dv = dvBuild({
      cats: [
        { name: "Driver", values: catExp, objects: catExp.map((c) => ({ pillars: { isPillar: FLAGS[CATS.indexOf(c)] } })) },
        { name: "Channel", values: legExp, isLegend: true }
      ],
      vals: [{ name: "Revenue", role: "actual", values: valExp, format: "#,##0" }]
    }) as Dv;
    dv.metadata.objects = baseObjects("vertical", {
      legend: { show: true, showSegmentLabels: true }
    });
    renderAndSave("v-cumulative-legend", dv, { width: 1000, height: 620 });
  });

  test("v-arcs-cumulative: arcs between cumulative pillars", () => {
    const dv = dvBuild({
      cats: [{ name: "Driver", values: CATS, objects: catObjects() }],
      vals: [{ name: "Revenue", role: "actual", values: VALUES, format: "#,##0" }]
    }) as Dv;
    dv.metadata.objects = baseObjects("vertical", {
      variationArc: { show: true },
      grandTotal: { showGrandTotal: false }
    });
    renderAndSave("v-arcs-cumulative", dv);
  });

  test("v-all-negative: negative pillars + mixed bridges", () => {
    const dv = dvBuild({
      cats: [
        {
          name: "Driver",
          values: ["Open", "Adj+", "Adj-", "Close"],
          objects: [true, false, false, true].map((f) => ({ pillars: { isPillar: f } }))
        }
      ],
      vals: [{ name: "Net debt", role: "actual", values: [-2400, 350, -520, -2570], format: "#,##0" }]
    }) as Dv;
    dv.metadata.objects = baseObjects("vertical", {
      grandTotal: { showGrandTotal: false }
    });
    renderAndSave("v-all-negative", dv);
  });

  test("v-narrow-viewport: 320x240 stress frame", () => {
    const dv = dvBuild({
      cats: [{ name: "Driver", values: CATS, objects: catObjects() }],
      vals: [{ name: "Revenue", role: "actual", values: VALUES, format: "#,##0" }]
    }) as Dv;
    dv.metadata.objects = baseObjects("vertical");
    renderAndSave("v-narrow-viewport", dv, { width: 320, height: 240 });
  });

  test("v-all-features-comparison: comparison + 2 rails (abs & %) + table + broken axis + offset + arcs + label bg", () => {
    // Note: the Grand total is cumulative-only by design (appendGrandTotal)
    // — it belongs to the v-all-features-legend scenario below.
    const catExp: string[] = [];
    const adimExp: string[] = [];
    const valExp: number[] = [];
    const varAbs: number[] = [];
    const varPct: number[] = [];
    CATS.forEach((c, i) => {
      ["EMEA", "Americas"].forEach((r, ri) => {
        catExp.push(c);
        adimExp.push(r);
        const share = [0.6, 0.4][ri];
        valExp.push(VALUES[i] * share);
        varAbs.push((VALUES[i] / 18) * share);
        varPct.push((i % 2 === 0 ? 0.042 : -0.031) * share);
      });
    });
    const dv = dvBuild({
      cats: [
        {
          name: "Driver",
          values: catExp,
          objects: catExp.map((c) => ({ pillars: { isPillar: FLAGS[CATS.indexOf(c)] } }))
        },
        { name: "Region", values: adimExp, isAnalysisDim: true }
      ],
      vals: [
        { name: "Revenue", role: "actual", values: valExp, format: "#,##0" },
        { name: "Δ vs LY", role: "variance", values: varAbs, format: "+#,##0;-#,##0" },
        { name: "Δ% vs BU", role: "variance", values: varPct, format: "+0.0%;-0.0%" }
      ]
    }) as Dv;
    dv.metadata.objects = {
      general: { orientation: "vertical", mode: "comparison" },
      yAxis: { yMinOffset: 55, showBrokenAxis: true },
      connectors: { showConnectors: true },
      variationArc: { show: true, arrowEnds: "end" },
      pillars: { labelBgColor: { solid: { color: "#f0f0f0" } } },
      grandTotal: { showGrandTotal: false }
    };
    renderAndSave("v-all-features-comparison", dv, { width: 1280, height: 680 });
  });

  test("v-all-features-legend: cumulative + stacked legend + rails + arcs + table + grand total", () => {
    const catNames = ["FY24", "Volume", "Price", "Churn", "FY25"];
    const catFlags = [true, false, false, false, true];
    const catVals = [2900, 390, 130, -740, 2680];
    const catExp: string[] = [];
    const adimExp: string[] = [];
    const legExp: string[] = [];
    const valExp: number[] = [];
    const varExp: number[] = [];
    catNames.forEach((c, i) => {
      ["EMEA", "APAC"].forEach((a, ai) => {
        ["Direct", "Partner"].forEach((l, li) => {
          catExp.push(c);
          adimExp.push(a);
          legExp.push(l);
          const share = [0.6, 0.4][ai] * [0.7, 0.3][li];
          valExp.push(catVals[i] * share);
          varExp.push((catVals[i] / 20) * share);
        });
      });
    });
    const dv = dvBuild({
      cats: [
        {
          name: "Driver",
          values: catExp,
          objects: catExp.map((c) => ({
            pillars: { isPillar: catFlags[catNames.indexOf(c)] }
          }))
        },
        { name: "Region", values: adimExp, isAnalysisDim: true },
        { name: "Channel", values: legExp, isLegend: true }
      ],
      vals: [
        { name: "Revenue", role: "actual", values: valExp, format: "#,##0" },
        { name: "Δ vs LY", role: "variance", values: varExp, format: "+#,##0;-#,##0" }
      ]
    }) as Dv;
    dv.metadata.objects = {
      general: { orientation: "vertical" },
      legend: { show: true, showSegmentLabels: true },
      connectors: { showConnectors: true },
      variationArc: { show: true }
    };
    renderAndSave("v-all-features-legend", dv, { width: 1280, height: 720 });
  });

  const fxRulesDv = (orientation: string): Dv => {
    // Measure-driven fx RULE simulation: the host lands one resolved fill
    // per data point on values[i].objects[r] (cascade layer 4), category
    // split by the Table role (the 1.1.18.0 shape). Colour ramp follows the
    // value sign/magnitude like a "green-the-better" rule would.
    const ramp = ["#1a7f37", "#4caf50", "#a5d6a7", "#ffb74d", "#e57373", "#c62828"];
    const catExp: string[] = [];
    const adimExp: string[] = [];
    const valExp: number[] = [];
    const rowObjects: Record<string, unknown>[] = [];
    CATS.forEach((c, i) => {
      ["x", "y"].forEach((a, ai) => {
        catExp.push(c);
        adimExp.push(a);
        valExp.push(VALUES[i] * [0.55, 0.45][ai]);
        rowObjects.push(
          FLAGS[i]
            ? { pillars: { pillarColor: { solid: { color: ramp[i] } } } }
            : { bridges: { colorBridge: { solid: { color: ramp[i] } } } }
        );
      });
    });
    const dv = dvBuild({
      cats: [
        {
          name: "Driver",
          values: catExp,
          objects: catExp.map((c) => ({ pillars: { isPillar: FLAGS[CATS.indexOf(c)] } }))
        },
        { name: "P", values: adimExp, isAnalysisDim: true }
      ],
      vals: [
        {
          name: "Revenue",
          role: "actual",
          values: valExp,
          format: "#,##0",
          rowObjects
        }
      ]
    }) as Dv;
    dv.metadata.objects = {
      general: { orientation },
      grandTotal: { showGrandTotal: false },
      analysisTable: { show: false },
      connectors: { showConnectors: true }
    };
    return dv;
  };

  test("v-fx-rules: rule-driven per-bar fills (layer 4, Table split) — vertical", () => {
    renderAndSave("v-fx-rules", fxRulesDv("vertical"));
  });

  test("h-fx-rules: same rule-driven fills — horizontal witness", () => {
    renderAndSave("h-fx-rules", fxRulesDv("horizontal"));
  });

  test("v-empty-state: transposed silhouette", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings.general.orientation.value = {
      value: "vertical",
      displayName: "Vertical"
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).renderEmpty("Select or drag fields to populate this visual");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = (v as any).target as HTMLElement;
    const svg = target.querySelector(".wf-empty-preview svg");
    expect(svg).toBeTruthy();
    mkdirSync(OUT_DIR, { recursive: true });
    const svgStr = svg!.outerHTML.replace(
      "<svg ",
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" '
    );
    writeFileSync(resolve(OUT_DIR, "v-empty-state.svg"), svgStr);
    if (Resvg) {
      const png = new Resvg(svgStr, { background: "#ffffff" }).render().asPng();
      writeFileSync(resolve(OUT_DIR, "v-empty-state.png"), png);
    }
  });
});
