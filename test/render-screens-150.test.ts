
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeVisual, dvBuild } from "./_harness";

const ENABLED = process.env.RENDER_SCREENS === "1";
const d = ENABLED ? describe : describe.skip;

const OUT_DIR = resolve(__dirname, "..", "docs", "screens", "feat-1.5.0");

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

const ACCENT = "#FF7900";
const GREEN = "#50be87";
const GREY = "#9b9b9b";
const solid = (c: string) => ({ solid: { color: c } });

function save(name: string, target: HTMLElement): void {
  const svg = target.querySelector("svg");
  expect(svg).toBeTruthy();
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

function renderAndSave(name: string, dv: Dv, viewport = { width: 960, height: 520 }): void {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  save(name, target);
}

function deltaRule(from: number[], to: number[], withLabelBg: boolean): Record<string, unknown>[] {
  return from.map((a, r) => {
    const c = to[r] - a < 0 ? GREY : GREEN;
    return {
      bridges: {
        colorBridge: solid(c),
        ...(withLabelBg ? { labelBgColor: solid(c) } : {})
      }
    };
  });
}

const DIVS = ["Region A", "Spain", "Europe", "MEA", "Unit B", "Unit C", "Unit D", "Elim"];
const PF25 = [16800, 7400, 6500, 7900, 2600, 1200, 900, -1100];
const BU26 = [16643, 7400, 6520, 8020, 2548, 1172, 628, -1100];
const Q3F = [16540, 7310, 6480, 7990, 2610, 1150, 640, -1120];

function evol1(mode?: "remove" | "aggregate", label?: string): Dv {
  const dv = dvBuild({
    fx: false,
    cats: [{ name: "Division", values: DIVS }],
    vals: [
      {
        name: "Proforma 2025",
        role: "actual",
        values: PF25,
        format: "#,##0",
        rowObjects: deltaRule(PF25, BU26, false)
      },
      { name: "Budget 2026", role: "actual", values: BU26, format: "#,##0" },
      {
        name: "Q3F 2026",
        role: "actual",
        values: Q3F,
        format: "#,##0",
        objects: mode
          ? {
              pillars: {
                showBridgesBefore: false,
                hiddenBridgesMode: mode,
                ...(label ? { aggregateBridgeLabel: label } : {})
              }
            }
          : undefined
      }
    ]
  }) as Dv;
  dv.metadata.objects = {
    general: { mode: "comparison" },
    pillars: { pillarColor: solid(ACCENT) },
    yAxis: { yMinOffset: 90, showBrokenAxis: true },
    connectors: { showConnectors: true },
    variationArc: { show: true }
  };
  return dv;
}

function evol2(layout: "stacked" | "subBridges"): Dv {
  const div = ["France", "Europe", "MEA", "Division D", "Division D", "Totem", "ICSS & Other"];
  const split = [null, null, null, null, "Sub", null, null];
  const py = [1660, 470, 775, 180, 20, 90, 37];
  const ac = [1738, 492, 902, 166, 30, 95, -55];
  const dv = dvBuild({
    fx: false,
    cats: [
      { name: "Division", values: div },
      { name: "Split", values: split, isLegend: true }
    ],
    vals: [
      {
        name: "Proforma",
        role: "actual",
        values: py,
        format: "#,##0",
        rowObjects: deltaRule(py, ac, true)
      },
      { name: "EBITDAaL 4T 2025", role: "actual", values: ac, format: "#,##0" }
    ]
  }) as Dv;
  dv.metadata.objects = {
    general: { mode: "comparison", orientation: "vertical" },
    pillars: { pillarColor: solid(ACCENT) },
    bridges: { colorBridgeLabel: solid("#ffffff") },
    yAxis: { yMinOffset: 90, showBrokenAxis: true },
    legend: { layout, showSegmentLabels: true },
    variationArc: { show: true }
  };
  return dv;
}

function evol3(position: "auto" | "center"): Dv {
  const div = ["France", "Unit B 1 month", "Europe 6", "Afrique M-O", "Division D", "Autres"];
  const s125 = [2860, 225, 985, 1515, 250, 0];
  const s126 = [2929, 230, 1045, 1759, 234, -68];
  const dv = dvBuild({
    fx: false,
    cats: [{ name: "Division", values: div }],
    vals: [
      {
        name: "S1 25 bc",
        role: "actual",
        values: s125,
        format: "#,##0",
        rowObjects: deltaRule(s125, s126, true)
      },
      { name: "S1 26", role: "actual", values: s126, format: "#,##0" }
    ]
  }) as Dv;
  dv.metadata.objects = {
    general: { mode: "comparison" },
    pillars: { pillarColor: solid(ACCENT) },
    bridges: { labelPosition: position, colorBridgeLabel: solid("#000000") },
    yAxis: { yMinOffset: 90, showBrokenAxis: true },
    connectors: { showConnectors: true },
    variationArc: { show: true }
  };
  return dv;
}

d("offline renders — 1.5.0.0 evolutions", () => {
  test("evol1: hidden segment REMOVED (1.3.0.0 behaviour)", () => {
    renderAndSave("evol1-hidden-remove", evol1("remove"));
  });
  test("evol1: hidden segment AGGREGATED, label « Ajust. »", () => {
    renderAndSave("evol1-hidden-aggregate", evol1("aggregate", "Ajust."));
  });
  test("evol2: legend STACKED (historical)", () => {
    renderAndSave("evol2-legend-stacked", evol2("stacked"), { width: 760, height: 560 });
  });
  test("evol2: legend SPLIT BRIDGES", () => {
    renderAndSave("evol2-legend-split", evol2("subBridges"), { width: 760, height: 560 });
  });
  test("evol3: bridge labels OUTSIDE END (historical)", () => {
    renderAndSave("evol3-labels-auto", evol3("auto"));
  });
  test("evol3: bridge labels CENTER", () => {
    renderAndSave("evol3-labels-center", evol3("center"));
  });
});
