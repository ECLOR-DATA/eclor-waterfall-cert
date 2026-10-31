
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeVisual, dvBuild } from "./_harness";

const ENABLED = process.env.RENDER_SCREENS === "1";
const d = ENABLED ? describe : describe.skip;

const OUT_DIR = process.env.SHOT_DIR
  ? resolve(process.env.SHOT_DIR)
  : resolve(__dirname, "..", "docs", "screens", "feat-1.9.0", process.env.SHOT_TAG || "current");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dv = any;

interface Tile {
  file: string;
  title: string;
  caption: string;
  width: number;
  height: number;
}
const manifest: Tile[] = [];

function render(
  file: string,
  title: string,
  caption: string,
  dv: Dv,
  viewport = { width: 560, height: 360 }
): void {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  const svg = target.querySelector("svg");
  expect(svg).toBeTruthy();
  const svgStr = svg!.outerHTML.replace(
    "<style>",
    "<style>.wf-focus-ring{opacity:0}.wf-table-row-bg{fill:transparent}.wf-table-row-focus{opacity:0}"
  );
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, `${file}.svg`), svgStr);
  manifest.push({ file: `${file}.svg`, title, caption, ...viewport });
}

function comparison(objects: Record<string, unknown>) {
  return { general: { mode: "comparison" }, ...objects };
}


function pnlBridgeDv(objects: Record<string, unknown>): Dv {
  const lines = ["Revenue", "COGS", "Personnel", "Marketing", "Other opex"];
  const py = [12400, -6900, -2350, -640, -510];
  const ac = [13150, -7480, -2290, -830, -495];
  const dv = dvBuild({
    fx: false,
    cats: [{ name: "P&L line", values: lines }],
    vals: [
      { name: "PY", role: "actual", values: py },
      { name: "AC", role: "actual", values: ac }
    ]
  }) as Dv;
  dv.metadata.objects = comparison(objects);
  return dv;
}

function opexBridgeDv(objects: Record<string, unknown>): Dv {
  const lines = ["Personnel", "IT", "Marketing", "Rent", "Travel"];
  const py = [2350, 610, 640, 420, 180];
  const ac = [2290, 705, 830, 425, 140];
  const dv = dvBuild({
    fx: false,
    cats: [{ name: "Cost line", values: lines }],
    vals: [
      { name: "PY", role: "actual", values: py },
      { name: "AC", role: "actual", values: ac }
    ]
  }) as Dv;
  dv.metadata.objects = comparison(objects);
  return dv;
}

function scenarioDv(objects: Record<string, unknown>): Dv {
  const bu = ["North", "South", "Export"];
  const dv = dvBuild({
    fx: false,
    cats: [{ name: "BU", values: bu }],
    vals: [
      { name: "PY", role: "actual", queryName: "m.PY", values: [1180, 960, 410] },
      { name: "PL", role: "actual", queryName: "m.PL", values: [1250, 1010, 470] },
      { name: "FC", role: "actual", queryName: "m.FC", values: [1230, 990, 520] },
      { name: "AC", role: "actual", queryName: "m.AC", values: [1265, 975, 548] }
    ]
  }) as Dv;
  dv.metadata.objects = comparison(objects);
  return dv;
}

function withMeasureScenarios(dv: Dv, scen: Record<string, string>): Dv {
  for (const col of dv.categorical.values) {
    const s = scen[col.source.displayName];
    if (s) col.source.objects = { ...(col.source.objects || {}), pillars: { scenarioOverride: s } };
  }
  return dv;
}

const PNL_CATS = ["Revenue", "COGS", "Gross margin", "Personnel", "Other opex", "EBITDA", "D&A", "EBIT"];
const PNL_FLAGS = [true, false, true, false, false, true, false, true];
const PNL_VALUES = [13150, -7480, 5670, -2290, -1325, 2055, -612, 1443];
function pnlStructureDv(objects: Record<string, unknown>): Dv {
  const dv = dvBuild({
    fx: false,
    cats: [
      {
        name: "P&L line",
        values: PNL_CATS,
        objects: PNL_FLAGS.map((f) => ({ pillars: { isPillar: f } }))
      }
    ],
    vals: [{ name: "AC", role: "actual", values: PNL_VALUES }]
  }) as Dv;
  dv.metadata.objects = { grandTotal: { showGrandTotal: false }, ...objects };
  return dv;
}

function buDv(bu: "North" | "South", objects: Record<string, unknown>): Dv {
  const f = bu === "North" ? 1 : 0.42;
  const lines = ["Volume", "Price", "Mix", "FX"];
  const dv = dvBuild({
    fx: false,
    cats: [{ name: "Driver", values: lines }],
    vals: [
      { name: "PY", role: "actual", values: [2400, 900, 500, 300].map((v) => v * f) },
      { name: "AC", role: "actual", values: [2650, 960, 450, 260].map((v) => v * f) }
    ]
  }) as Dv;
  dv.metadata.objects = comparison(objects);
  return dv;
}


d("offline renders — IBCS 1.9.0.0", () => {
  afterAll(() => {
    if (manifest.length) {
      writeFileSync(resolve(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
    }
  });

  test("1a scenario notation — untouched (1.8.1.0 defaults)", () => {
    render(
      "1a-scenarios-default",
      "Sales by scenario, in k€",
      "PY → PL → FC → AC, every pillar in the theme colour (today)",
      scenarioDv({ variationArc: { show: false } })
    );
  });
  test("1b scenario notation — PY / PL / FC / AC set per pillar", () => {
    render(
      "1b-scenarios-ibcs",
      "Sales by scenario, in k€",
      "Pillars → per measure → Scenario = PY / PL / FC / AC",
      withMeasureScenarios(scenarioDv({}), {
        PY: "PY",
        PL: "PL",
        FC: "FC",
        AC: "AC"
      })
    );
  });
  test("1c scenario notation — P&L structure, vertical, AC", () => {
    render(
      "1c-pnl-vertical-ac",
      "P&L 2025 AC, in k€",
      "Vertical, Scenario = AC on every pillar, bridges by impact",
      pnlStructureDv({
        general: { orientation: "vertical" },
        pillars: { scenario: "AC" },
        bridges: { colorMode: "impact" }
      }),
      { width: 560, height: 420 }
    );
  });

  test("2a impact — EBIT bridge, single bridge colour (today)", () => {
    render(
      "2a-pnl-bridge-default",
      "EBIT PY → AC, in k€",
      "One bridge colour: a revenue gain and a cost saving look alike",
      pnlBridgeDv({})
    );
  });
  test("2b impact — EBIT bridge, colour by impact", () => {
    render(
      "2b-pnl-bridge-impact",
      "EBIT PY → AC, in k€",
      "Bridges → Color = By impact (signed P&L: sign = impact)",
      pnlBridgeDv({ bridges: { colorMode: "impact" } })
    );
  });
  test("2c impact — Opex bridge, costs stored positive, by sign = wrong", () => {
    render(
      "2c-opex-bridge-sign",
      "Opex PY → AC, in k€",
      "By impact, Higher is better: a cost INCREASE shows green — wrong",
      opexBridgeDv({ bridges: { colorMode: "impact" } })
    );
  });
  test("2d impact — Opex bridge, polarity = higher is worse", () => {
    render(
      "2d-opex-bridge-polarity",
      "Opex PY → AC, in k€",
      "By impact, Polarity = Higher is worse, neutral below 10",
      opexBridgeDv({
        bridges: { colorMode: "impact", impactPolarity: "higherWorse", neutralThreshold: 10 }
      })
    );
  });
  test("2e impact — EBIT bridge, cost lines listed on a mixed P&L", () => {
    const dv = pnlBridgeDv({
      bridges: { colorMode: "impact", invertedList: "COGS; Personnel; Marketing; Other opex" }
    });
    for (const col of dv.categorical.values) {
      col.values = col.values.map((v: number) => Math.abs(v));
    }
    render(
      "2e-pnl-bridge-costlist",
      "Revenue & costs PY → AC, in k€",
      "Costs stored positive + Cost lines = COGS; Personnel; …",
      dv
    );
  });

  test("3a scale — two BUs, auto scale each (today)", () => {
    render("3a-bu-north-auto", "BU North, PY → AC, in k€", "Auto scale", buDv("North", {}), {
      width: 380,
      height: 320
    });
    render("3a-bu-south-auto", "BU South, PY → AC, in k€", "Auto scale — looks as big as North", buDv("South", {}), {
      width: 380,
      height: 320
    });
  });
  test("3b scale — two BUs, same fixed max", () => {
    const y = { yAxis: { scaleMax: 5000 } };
    render("3b-bu-north-fixed", "BU North, PY → AC, in k€", "Y axis → Scale max = 5 000", buDv("North", y), {
      width: 380,
      height: 320
    });
    render("3b-bu-south-fixed", "BU South, PY → AC, in k€", "Same scale max = 5 000", buDv("South", y), {
      width: 380,
      height: 320
    });
  });

  test("4a numbers — auto decimals and K on every label (today)", () => {
    render(
      "4a-numbers-default",
      "Opex PY → AC",
      "Mixed decimals (2K / 0.06K / 0.19K), « K » repeated on each label",
      opexBridgeDv({})
    );
  });
  test("4b numbers — uniform decimals, unit once", () => {
    render(
      "4b-numbers-ibcs",
      "Opex PY → AC",
      "General → Numbers: Uniform decimals on, Unit suffix off (unit note)",
      opexBridgeDv({ general: { mode: "comparison", uniformDecimals: true, unitSuffix: false } })
    );
  });
  test("4d numbers — vertical P&L, unit once + uniform + fixed scale", () => {
    render(
      "4d-pnl-vertical-numbers",
      "P&L 2025 AC",
      "Vertical: unit note, uniform decimals, Scale max = 15 000, AC + impact",
      pnlStructureDv({
        general: { orientation: "vertical", uniformDecimals: true, unitSuffix: false },
        yAxis: { scaleMax: 15000 },
        pillars: { scenario: "AC" },
        bridges: { colorMode: "impact" }
      }),
      { width: 560, height: 420 }
    );
  });
  test("4c numbers — all four together", () => {
    render(
      "4c-all-together",
      "Opex PY → AC",
      "Scenario PY / AC, impact (higher is worse), uniform decimals, unit once",
      withMeasureScenarios(
        opexBridgeDv({
          general: { mode: "comparison", uniformDecimals: true, unitSuffix: false },
          bridges: { colorMode: "impact", impactPolarity: "higherWorse", neutralThreshold: 10 }
        }),
        { PY: "PY", AC: "AC" }
      ),
      { width: 560, height: 380 }
    );
  });
});
