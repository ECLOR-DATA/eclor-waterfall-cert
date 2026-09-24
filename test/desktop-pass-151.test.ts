import { makeVisual, dvBuild, parse, barRectOf } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dv = any;

function render(dv: Dv, viewport: { width: number; height: number }): HTMLElement {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (v as any).target as HTMLElement;
}

const findText = (target: HTMLElement, text: string): SVGTextElement | undefined =>
  Array.from(target.querySelectorAll("text")).find((t) => t.textContent === text) as
    | SVGTextElement
    | undefined;

describe("zero-crossing bridge label stays OFF the bar (Desktop pass P17)", () => {
  const zeroCross = (orientation: "horizontal" | "vertical"): Dv => {
    const dv = dvBuild({
      fx: false,
      cats: [{ name: "Step", values: ["Start", "Volume", "Price", "Mix", "End"] }],
      vals: [{ name: "Amount", role: "actual", values: [502, -7154, 1200, 300, -5152], format: "#,##0" }]
    }) as Dv;
    dv.metadata.objects = {
      general: { mode: "comparison", orientation },
      connectors: { showConnectors: true },
      pillars: { fontSize: 8 },
      bridges: { fontSize: 8 },
      xAxis: { fontSize: 8 },
      yAxis: { fontSize: 8 }
    };
    return dv;
  };

  test("horizontal, bar filling the plot (bench size 616 × 330): the label is inside but CONTRASTED", () => {
    const target = render(zeroCross("horizontal"), { width: 616, height: 330 });
    const label = findText(target, "-7,154");
    expect(label).toBeTruthy();
    const bar = barRectOf(target, 1)!;
    const barTop = Number(bar.getAttribute("y"));
    const barBottom = barTop + Number(bar.getAttribute("height"));
    const ly = Number(label!.getAttribute("y"));
    expect(ly).toBeGreaterThan(barTop);
    expect(ly).toBeLessThan(barBottom);
    const fill = label!.getAttribute("fill");
    expect(fill).not.toBe(bar.getAttribute("fill"));
    expect(["#ffffff", "#091612"]).toContain(fill);
  });

  test("horizontal, with room under the bar's base (900 × 500): the label goes there, off the bar", () => {
    const target = render(zeroCross("horizontal"), { width: 900, height: 500 });
    const label = findText(target, "-7,154")!;
    const bar = barRectOf(target, 1)!;
    const barBottom = Number(bar.getAttribute("y")) + Number(bar.getAttribute("height"));
    expect(Number(label.getAttribute("y"))).toBeGreaterThan(barBottom + 2);
    expect(label.getAttribute("fill")).toBe("#50be87");
  });

  test("vertical: the −7 154 label sits past the bar's RIGHT edge (its base), not inside it", () => {
    const target = render(zeroCross("vertical"), { width: 616, height: 330 });
    const label = findText(target, "-7,154");
    expect(label).toBeTruthy();
    const bar = barRectOf(target, 1)!;
    const barLeft = Number(bar.getAttribute("x"));
    const barRight = barLeft + Number(bar.getAttribute("width"));
    const lx = Number(label!.getAttribute("x"));
    expect(label!.getAttribute("text-anchor")).toBe("start");
    expect(lx).toBeGreaterThan(barRight);
  });

  test("a bridge with room keeps the historical tip placement (byte-identical)", () => {
    const dv = dvBuild({
      cats: [{ name: "Step", values: ["Start", "Up", "Down", "End"] }],
      vals: [{ name: "Amount", role: "actual", values: [1000, 200, -150, 1050], format: "#,##0" }]
    }) as Dv;
    dv.metadata.objects = { general: { mode: "comparison" } };
    const target = render(dv, { width: 900, height: 500 });
    const up = findText(target, "+200")!;
    const upBar = barRectOf(target, 1)!;
    expect(Number(up.getAttribute("y"))).toBeLessThan(Number(upBar.getAttribute("y")));
    const down = findText(target, "-150")!;
    const downBar = barRectOf(target, 2)!;
    expect(Number(down.getAttribute("y"))).toBeGreaterThan(
      Number(downBar.getAttribute("y")) + Number(downBar.getAttribute("height"))
    );
  });
});

describe("a measure bound to Variance AND Variation arc value (Desktop pass P14)", () => {
  test("yields one rail and one arc measure, not two rails", () => {
    const dv = dvBuild({
      cats: [{ name: "Metric", values: ["Revenue", "Margin", "Headcount"] }],
      vals: [
        { name: "Value", role: "actual", values: [1250000, 0.182, 1480], format: "#,##0" },
        { name: "Var %", role: "variance", values: [0.062, 0.021, -0.034], format: "0.0%", queryName: "KPI.Var %" },
        { name: "Var %", role: "arcMeasure", values: [0.062, 0.021, -0.034], format: "0.0%", queryName: "KPI.Var %" }
      ]
    }) as Dv;
    for (const col of dv.categorical.values) {
      if (col.source.queryName === "KPI.Var %") col.source.roles = { variance: true, arcMeasure: true };
    }
    dv.metadata.objects = { general: { mode: "cumulative" }, variationArc: { show: true, defaultSource: "measure" } };
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = parse(v, dv);
    expect(parsed.varianceMeasures.length).toBe(1);
    expect(parsed.arcMeasure).toBeTruthy();
    expect(parsed.arcMeasure.queryName).toBe("KPI.Var %");
    const target = render(dv, { width: 700, height: 400 });
    const railNames = Array.from(target.querySelectorAll("text")).filter((t) => t.textContent === "Var %");
    expect(railNames.length).toBe(1);
  });
});

describe("anchor arc measure reads the matrix GRAND TOTAL (Desktop pass P15)", () => {
  const build = (withGrandTotal: boolean): Dv => {
    const dv = dvBuild({
      fx: false,
      cats: [{ name: "Country", values: ["A", "B"] }],
      vals: [
        { name: "PY", role: "actual", values: [100, 200], format: "#,##0" },
        { name: "AC", role: "actual", values: [110, 210], format: "#,##0" },
        { name: "Delta pct", role: "arcMeasure", values: [0.1, 0.05], format: "0.0%", queryName: "KPI.Delta pct" }
      ],
      matrixVar: { xOrder: ["A", "B"], measures: [{ queryName: "KPI.Delta pct", values: [0.1, 0.05] }] }
    }) as Dv;
    if (withGrandTotal) {
      dv.matrix.rows.root.children.push({ isSubtotal: true, level: 0, values: { 0: { value: 320 / 300 - 1 } } });
    }
    dv.metadata.objects = { general: { mode: "comparison" }, variationArc: { show: true, defaultSource: "measure" } };
    return dv;
  };

  test("with a grand total: the PY → AC arc shows the total Δ% (6.7 %), not country A's", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = parse(v, build(true));
    expect(parsed.arcMeasure.total).toBeCloseTo(320 / 300 - 1, 9);
    const target = render(build(true), { width: 800, height: 450 });
    expect(findText(target, "6.7%")).toBeTruthy();
    expect(findText(target, "10.0%")).toBeUndefined();
  });

  test("root-level cells (measures-only shape) are read the same way", () => {
    const dv = build(false);
    dv.matrix.rows.root.values = { 0: { value: 0.25, valueSourceIndex: 0 } };
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = parse(v, dv);
    expect(parsed.arcMeasure.total).toBeCloseTo(0.25, 9);
  });

  test("without a grand total: the leaf guard is unchanged (first member of a ratio)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = parse(v, build(false));
    expect(parsed.arcMeasure.total).toBeCloseTo(0.1, 9);
  });
});
