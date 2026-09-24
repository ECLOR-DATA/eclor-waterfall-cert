
import { makeVisual, dvBuild, FX_NEG, FX_POS } from "./_harness";
import { sameSignBridgeColor } from "../src/pillarOverrides";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const solid = (c: string) => ({ solid: { color: c } });

function runUpdate(v: Any, dv: Any, w = 700, h = 460): HTMLElement {
  v.update({ dataViews: [dv], viewport: { width: w, height: h }, type: 2 });
  const target = v.target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return target;
}

const HIDE = { showBridgesBefore: false };
const AGG = (label?: string) => ({
  pillars: {
    ...HIDE,
    hiddenBridgesMode: "aggregate",
    ...(label !== undefined ? { aggregateBridgeLabel: label } : {})
  }
});

function synthDv(measureObjects?: Array<Record<string, unknown> | undefined>): Any {
  const dv: Any = dvBuild({
    cats: [{ name: "Cat", values: ["A", "B"] }],
    vals: [
      { name: "Y1", role: "actual", values: [30, 70], objects: measureObjects?.[0] },
      { name: "Y2", role: "actual", values: [45, 80], objects: measureObjects?.[1] },
      { name: "Y3", role: "actual", values: [52, 105], objects: measureObjects?.[2] }
    ]
  });
  dv.metadata.objects = {
    general: { mode: "comparison" },
    pillars: { pillarColor: solid("#0000aa") }
  };
  return dv;
}

function synthDvWithTable(measureObjects?: Array<Record<string, unknown> | undefined>): Any {
  const dv: Any = dvBuild({
    cats: [
      { name: "Cat", values: ["A", "A", "B", "B"] },
      { name: "R", values: ["x", "y", "x", "y"], isAnalysisDim: true }
    ],
    vals: [
      { name: "Y1", role: "actual", values: [10, 20, 30, 40], objects: measureObjects?.[0] },
      { name: "Y2", role: "actual", values: [15, 30, 35, 45], objects: measureObjects?.[1] },
      { name: "Y3", role: "actual", values: [22, 30, 50, 55], objects: measureObjects?.[2] }
    ]
  });
  dv.metadata.objects = { general: { mode: "comparison" } };
  return dv;
}

const labels = (v: Any): string[] => v.cachedCategoryDisplay.map((c: Any) => c.label);
const pillarsFlags = (v: Any): boolean[] => v.cachedCategoryDisplay.map((c: Any) => c.isPillar);
const barCount = (t: HTMLElement): number => t.querySelectorAll("g.wf-bar").length;

function sliceNames(v: Any, groupName: string): string[] {
  const g = v.formattingSettings.pillars.groups.find((x: Any) => String(x.name) === groupName);
  expect(g).toBeDefined();
  return g.slices.map((s: Any) => String(s.name));
}

describe("aggregate hidden segment — layout", () => {
  test("hidden + aggregate ⇒ ONE bridge between the two pillars, default label", () => {
    const v: Any = makeVisual();
    const target = runUpdate(v, synthDv([undefined, undefined, AGG()]));
    expect(barCount(target)).toBe(6);
    expect(labels(v)).toEqual(["Y1", "A", "B", "Y2", "Y3 − Y2", "Y3"]);
    expect(pillarsFlags(v)).toEqual([true, false, false, true, false, true]);
    expect(v.cachedCategoryDisplay[4].actualValue).toBeCloseTo(32, 6);
  });

  test("the cascade closes by construction — the bar lands on the next pillar", () => {
    const v: Any = makeVisual();
    runUpdate(v, synthDv([undefined, undefined, AGG()]));
    const items = v.lastValidRenderInput.layout.items;
    expect(items[4].type).toBe("up");
    expect(items[4].runningBefore).toBeCloseTo(125, 6);
    expect(items[4].runningAfter).toBeCloseTo(157, 6);
    expect(items[5].actualVal).toBeCloseTo(157, 6);
  });

  test("a custom label replaces the default on the X axis", () => {
    const v: Any = makeVisual();
    const target = runUpdate(v, synthDv([undefined, undefined, AGG("Ajust.")]));
    expect(labels(v)[4]).toBe("Ajust.");
    const texts = Array.from(target.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts).toContain("Ajust.");
    expect(texts).not.toContain("Y3 − Y2");
    expect(v.cachedCategoryDisplay[4].actualDisplayName).toBe("Y3 − Y2");
  });

  test("a blank custom label falls back to the default", () => {
    const v: Any = makeVisual();
    runUpdate(v, synthDv([undefined, undefined, AGG("   ")]));
    expect(labels(v)[4]).toBe("Y3 − Y2");
  });

  test("aggregating the FIRST segment leaves the second decomposed", () => {
    const v: Any = makeVisual();
    runUpdate(v, synthDv([undefined, AGG("Δ"), undefined]));
    expect(labels(v)).toEqual(["Y1", "Δ", "Y2", "A", "B", "Y3"]);
    expect(v.cachedCategoryDisplay[1].actualValue).toBeCloseTo(25, 6);
  });

  test("a NEGATIVE step draws a down bridge", () => {
    const dv: Any = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [
        { name: "Y1", role: "actual", values: [30, 70] },
        { name: "Y2", role: "actual", values: [20, 50], objects: AGG() }
      ]
    });
    dv.metadata.objects = { general: { mode: "comparison" } };
    const v: Any = makeVisual();
    runUpdate(v, dv);
    const items = v.lastValidRenderInput.layout.items;
    expect(items.map((it: Any) => it.type)).toEqual(["pillar", "down", "pillar"]);
    expect(items[1].actualVal).toBeCloseTo(-30, 6);
  });
});

describe("aggregate hidden segment — zero regression", () => {
  test("hidden with NO mode persisted ⇒ the 1.3.0.0 removal, unchanged", () => {
    const v: Any = makeVisual();
    const target = runUpdate(v, synthDv([undefined, undefined, { pillars: HIDE }]));
    expect(barCount(target)).toBe(5);
    expect(labels(v)).toEqual(["Y1", "A", "B", "Y2", "Y3"]);
  });

  test("hidden + explicit 'remove' ⇒ same as no mode", () => {
    const v: Any = makeVisual();
    runUpdate(
      v,
      synthDv([undefined, undefined, { pillars: { ...HIDE, hiddenBridgesMode: "remove" } }])
    );
    expect(labels(v)).toEqual(["Y1", "A", "B", "Y2", "Y3"]);
  });

  test("'aggregate' is inert while the segment is SHOWN", () => {
    const v: Any = makeVisual();
    runUpdate(
      v,
      synthDv([
        undefined,
        undefined,
        { pillars: { hiddenBridgesMode: "aggregate", aggregateBridgeLabel: "Ajust." } }
      ])
    );
    expect(labels(v)).toEqual(["Y1", "A", "B", "Y2", "A", "B", "Y3"]);
  });
});

describe("aggregate hidden segment — connectors, table, orientation", () => {
  const CONN = "#123456";
  const connectorsOf = (measureObjects?: Any) => {
    const dv = synthDv(measureObjects);
    dv.metadata.objects.connectors = {
      showConnectors: true,
      connectorColor: { solid: { color: CONN } }
    };
    const target = runUpdate(makeVisual(), dv);
    return Array.from(target.querySelectorAll("line")).filter(
      (l) => l.getAttribute("stroke") === CONN
    );
  };

  test("the aggregate is connected on both sides (the step IS explained)", () => {
    expect(connectorsOf([undefined, undefined, AGG()]).length).toBe(5);
  });

  test("INVARIANT Σ cells per column = bar.actual, with an aggregate column", () => {
    const v: Any = makeVisual();
    runUpdate(v, synthDvWithTable([undefined, undefined, AGG("Ajust.")]));
    const cells: number[][] = v.cachedAnalysisCells;
    const items = v.lastValidRenderInput.layout.items;
    expect(items.length).toBe(6);
    expect(cells[0].length).toBe(6);
    for (let col = 0; col < items.length; col++) {
      const colSum = cells.reduce((s, row) => s + (row[col] ?? 0), 0);
      expect(colSum).toBeCloseTo(items[col].actualVal, 6);
    }
    expect(cells.map((row) => row[4])).toEqual([22, 10]);
  });

  test("VERTICAL: the aggregate is upstream of the projection", () => {
    const v: Any = makeVisual();
    const dv = synthDv([undefined, undefined, AGG("Ajust.")]);
    dv.metadata.objects.general = { mode: "comparison", orientation: "vertical" };
    const target = runUpdate(v, dv);
    expect(barCount(target)).toBe(6);
    expect(labels(v)[4]).toBe("Ajust.");
  });

  test("with a legend, the aggregate splits by legend value like any bridge", () => {
    const dv: Any = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        { name: "L", values: ["p", "q", "p", "q"], isLegend: true }
      ],
      vals: [
        { name: "Y1", role: "actual", values: [10, 20, 30, 40] },
        { name: "Y2", role: "actual", values: [15, 30, 35, 45], objects: AGG() }
      ]
    });
    dv.metadata.objects = { general: { mode: "comparison" } };
    const v: Any = makeVisual();
    runUpdate(v, dv);
    const agg = v.cachedCategoryDisplay[1];
    expect(agg.isPillar).toBe(false);
    expect(agg.segments.map((s: Any) => s.value)).toEqual([10, 15]);
    expect(agg.segments.reduce((s: number, x: Any) => s + x.value, 0)).toBeCloseTo(
      agg.actualValue,
      6
    );
  });
});

describe("aggregate hidden segment — colour", () => {
  test("a 'by sign' fx rule paints the aggregate like a bridge of that sign", () => {
    const negFill = { bridges: { colorBridge: solid(FX_NEG) } };
    const dv: Any = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [
        { name: "Y1", role: "actual", values: [30, 70], rowObjects: [negFill, negFill] },
        { name: "Y2", role: "actual", values: [20, 50], objects: AGG("Ajust.") }
      ]
    });
    dv.metadata.objects = { general: { mode: "comparison" } };
    const v: Any = makeVisual();
    const target = runUpdate(v, dv);
    expect(v.cachedCategoryDisplay[1].bridgeColor).toBe(FX_NEG);
    const g = target.querySelector(`g.wf-bar[data-cat-idx="1"]`)!;
    const rect = Array.from(g.querySelectorAll("rect")).find(
      (r) => !r.classList.contains("wf-focus-ring")
    )!;
    expect(rect.getAttribute("fill")).toBe(FX_NEG);
  });
});

describe("aggregate hidden segment — colour borrowed from same-sign bridges", () => {
  test("sameSignBridgeColor: |value|-weighted vote among bars of the same sign", () => {
    const bars = [
      { value: -157, color: "#grey" },
      { value: 20, color: "#green" },
      { value: 120, color: "#green" },
      { value: -30, color: "#red" },
      { value: -5 }
    ];
    expect(sameSignBridgeColor(bars, -231)).toBe("#grey");
    expect(sameSignBridgeColor(bars, 12)).toBe("#green");
    expect(sameSignBridgeColor([{ value: 5, color: "#green" }], -3)).toBeUndefined();
    expect(sameSignBridgeColor(bars, 0)).toBeUndefined();
  });

  test("M=3: a rule written on the FIRST segment's delta does not leak its sign", () => {
    const rule = (c: string) => ({ bridges: { colorBridge: solid(c) } });
    const dv: Any = dvBuild({
      fx: false,
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [
        {
          name: "Y1",
          role: "actual",
          values: [30, 70, 50],
          rowObjects: [rule(FX_POS), rule(FX_POS), rule(FX_NEG)]
        },
        { name: "Y2", role: "actual", values: [45, 80, 40] },
        { name: "Y3", role: "actual", values: [44, 60, 39], objects: AGG("Ajust.") }
      ]
    });
    dv.metadata.objects = { general: { mode: "comparison" } };
    const v: Any = makeVisual();
    runUpdate(v, dv);
    const agg = v.cachedCategoryDisplay.find((c: Any) => c.label === "Ajust.");
    expect(agg.actualValue).toBeCloseTo(-22, 6);
    expect(agg.bridgeColor).toBe(FX_NEG);
  });
});

describe("aggregate hidden segment — format pane", () => {
  test("the mode dropdown appears only once the segment is hidden", () => {
    const v: Any = makeVisual();
    runUpdate(v, synthDv());
    v.getFormattingModel();
    expect(sliceNames(v, "pillarsMeasure_Y3")).not.toContain("hiddenBridgesMode");

    const v2: Any = makeVisual();
    runUpdate(v2, synthDv([undefined, undefined, { pillars: HIDE }]));
    v2.getFormattingModel();
    const names = sliceNames(v2, "pillarsMeasure_Y3");
    expect(names).toContain("hiddenBridgesMode");
    expect(names).not.toContain("aggregateBridgeLabel");
  });

  test("'aggregate' surfaces the label input, selector-bound to the measure", () => {
    const v: Any = makeVisual();
    runUpdate(v, synthDv([undefined, undefined, AGG("Ajust.")]));
    v.getFormattingModel();
    const g = v.formattingSettings.pillars.groups.find(
      (x: Any) => String(x.name) === "pillarsMeasure_Y3"
    );
    const mode = g.slices.find((s: Any) => s.name === "hiddenBridgesMode");
    const label = g.slices.find((s: Any) => s.name === "aggregateBridgeLabel");
    expect(mode.value.value).toBe("aggregate");
    expect(label.value).toBe("Ajust.");
    expect(label.placeholder).toBe("Y3 − Y2");
    expect(mode.selector).toBeDefined();
    expect(label.selector).toBeDefined();
  });
});
