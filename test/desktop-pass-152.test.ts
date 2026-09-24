import { makeVisual, dvBuild } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dv = any;
const solid = (c: string) => ({ solid: { color: c } });

function render(dv: Dv, viewport = { width: 900, height: 500 }): HTMLElement {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (v as any).target as HTMLElement;
}

describe("variation-arc line colour as an fx field value (Desktop pass P19)", () => {
  const build = (withRule: boolean): Dv => {
    const cats = ["Start", "Mid", "End"];
    const dv = dvBuild({
      fx: false,
      cats: [{ name: "Step", values: cats }],
      vals: [
        {
          name: "Amount",
          role: "actual",
          values: [1000, 200, 1300],
          format: "#,##0",
          rowObjects: withRule
            ? [undefined, undefined, { variationArc: { lineColor: solid("#ff00aa") } }]
            : undefined
        }
      ]
    }) as Dv;
    dv.metadata.objects = {
      general: { mode: "comparison" },
      variationArc: { show: true, lineColor: solid("#123456") }
    };
    return dv;
  };
  const strokes = (target: HTMLElement): string[] =>
    Array.from(target.querySelectorAll("line"))
      .map((l) => l.getAttribute("stroke") || "")
      .filter((c) => c === "#ff00aa" || c === "#123456");

  test("the arc into the rule-coloured destination takes the fx colour, line AND arrow", () => {
    const target = render(build(true));
    const fx = strokes(target).filter((c) => c === "#ff00aa");
    expect(fx.length).toBeGreaterThan(0);
    const arrows = Array.from(target.querySelectorAll("polygon, path")).filter(
      (e) => e.getAttribute("fill") === "#ff00aa"
    );
    expect(arrows.length).toBeGreaterThan(0);
  });

  test("without a rule the global slice colour is untouched", () => {
    const target = render(build(false));
    const all = strokes(target);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((c) => c === "#123456")).toBe(true);
  });
});

describe("arc into the Grand total with Label contents = Measure (Desktop pass P14)", () => {
  const build = (): Dv => {
    const dv = dvBuild({
      fx: false,
      cats: [{ name: "Metric", values: ["Revenue", "Margin", "Headcount"] }],
      vals: [
        { name: "Value", role: "actual", values: [1000, 300, 200], format: "#,##0" },
        { name: "Var %", role: "arcMeasure", values: [0.062, 0.021, -0.034], format: "0.0%", queryName: "KPI.Var %" }
      ],
      matrixVar: { xOrder: ["Revenue", "Margin", "Headcount"], measures: [{ queryName: "KPI.Var %", values: [0.062, 0.021, -0.034] }] }
    }) as Dv;
    dv.matrix.rows.root.children.push({ isSubtotal: true, level: 0, values: { 0: { value: 0.057 } } });
    dv.metadata.objects = {
      general: { mode: "cumulative" },
      variationArc: { show: true, defaultSource: "measure" }
    };
    return dv;
  };

  test("the Grand total arc prints the measure's grand total, not the computed delta", () => {
    const target = render(build());
    const texts = Array.from(target.querySelectorAll("text")).map((t) => t.textContent || "");
    expect(texts).toContain("5.7%");
    expect(texts.some((t) => t.includes(" | "))).toBe(false);
  });
});
