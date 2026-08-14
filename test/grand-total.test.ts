/**
 * Grand Total in cumulative mode — 1.1.62 gate + running-total semantics.
 *
 * The old gate required ZERO pillars (`!points.some(isPillar)`), but the
 * cumulative default marks first + last category as pillars — so the toggle
 * (default ON) never showed anything on a default chart: the pane said "on",
 * the canvas showed nothing. The GT now always appends in USER cumulative
 * mode and carries the FINAL RUNNING total (a pillar resets the running to
 * its absolute value, a bridge adds its delta — same walk as computeLayout).
 * Comparison configs routed internally to cumulative (synth bridge) still
 * never grow a GT: their last pillar IS the end state.
 */

import { makeVisual, dvBuild, parse } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderPoints = (v: any, dv: unknown, userMode: "cumulative" | "comparison" = "cumulative") => {
  const parsed = parse(v, dv);
  return { parsed, chart: v.buildRenderPoints(parsed, userMode) };
};

describe("grand total: gate (1.1.62 — pillars no longer block it)", () => {
  test("default pillars (first + last) + toggle on → GT appended with the final running total", () => {
    const v = makeVisual();
    const { chart } = renderPoints(
      v,
      dvBuild({
        cats: [{ name: "Cat", values: ["A", "B", "C"] }],
        vals: [{ name: "Sales", role: "actual", values: [100, 20, 200] }]
      })
    );
    // A (pillar 100) → B (+20 → 120) → C (pillar → 200) → GT = 200.
    expect(chart.points).toHaveLength(4);
    const gt = chart.points[3];
    expect(gt.label).toBe("Grand total");
    expect(gt.isPillar).toBe(true);
    expect(gt.actual).toBe(200);
  });

  test("pillar mid-walk: running resets at the pillar, bridges add after it", () => {
    const v = makeVisual();
    const { chart } = renderPoints(
      v,
      dvBuild({
        cats: [
          {
            name: "Cat",
            values: ["A", "B", "C"],
            objects: [
              { pillars: { isPillar: true } },
              {},
              { pillars: { isPillar: false } } // last would otherwise default to pillar
            ]
          }
        ],
        vals: [{ name: "Sales", role: "actual", values: [100, 20, -30] }]
      })
    );
    expect(chart.points).toHaveLength(4);
    expect(chart.points[3].actual).toBe(90); // 100 → +20 → −30
  });

  test("all-bridge chart (legacy): GT = plain sum, unchanged", () => {
    const v = makeVisual();
    const { chart } = renderPoints(
      v,
      dvBuild({
        cats: [
          {
            name: "Cat",
            values: ["A", "B", "C"],
            objects: [
              { pillars: { isPillar: false } },
              {},
              { pillars: { isPillar: false } }
            ]
          }
        ],
        vals: [{ name: "Sales", role: "actual", values: [10, 20, 30] }]
      })
    );
    expect(chart.points).toHaveLength(4);
    expect(chart.points[3].actual).toBe(60);
  });

  test("comparison mode with 2 measures (synth bridge → internal cumulative): NO grand total", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings.general.mode.value = {
      value: "comparison",
      displayName: "Comparison"
    };
    const { chart } = renderPoints(
      v,
      dvBuild({
        cats: [{ name: "Cat", values: ["A", "B"] }],
        vals: [
          { name: "M1", role: "actual", values: [100, 50] },
          { name: "M2", role: "actual", values: [120, 60] }
        ]
      }),
      "comparison"
    );
    expect(chart.internalMode).toBe("cumulative"); // synth-bridge routing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(chart.points.some((p: any) => p.label === "Grand total")).toBe(false);
  });
});

describe("grand total: analysis-table column running semantics", () => {
  test("GT cells follow the per-adim running; Σ cells = GT bar value with a pillar in the walk", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        {
          name: "Month",
          values: ["A", "A", "B", "B"],
          // B (last) would default to pillar — force it to bridge so the
          // walk is pillar(A) → bridge(B).
          objects: [{}, {}, { pillars: { isPillar: false } }, {}]
        },
        { name: "Region", values: ["E", "N", "E", "N"], isAnalysisDim: true }
      ],
      vals: [{ name: "Sales", role: "actual", values: [100, 50, 20, 10] }]
    });
    const { parsed, chart } = renderPoints(v, dv);
    // A = pillar (default first) 150; B bridge +30 → GT bar = 180.
    const gt = chart.points[chart.points.length - 1];
    expect(gt.actual).toBe(180);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cells = (v as any).buildAnalysisCells(parsed, chart.points, "cumulative");
    const gtCol = chart.points.length - 1;
    const colVals = cells.values.map((row: number[]) => row[gtCol]);
    // Per-adim running: E = 100 → +20 = 120 ; N = 50 → +10 = 60.
    expect(colVals).toEqual([120, 60]);
    expect(colVals[0] + colVals[1]).toBe(gt.actual);
  });
});

describe("grand total: dedicated label style (1.1.75)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderHtml = (v: any, dv: any): string => {
    v.update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
    return (v.target as HTMLElement).innerHTML;
  };

  test("GT label reads the grandTotal colour / font / background, independent of the Pillars card", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [{ name: "Sales", role: "actual", values: [100, 20, 200] }]
    }) as any;
    dv.metadata.objects = {
      // Regular pillar labels keep their own (distinct) colour.
      pillars: { colorPillarLabel: { solid: { color: "#00ff00" } } },
      grandTotal: {
        showGrandTotal: true,
        grandTotalLabelColor: { solid: { color: "#ff00aa" } },
        labelBgColor: { solid: { color: "#123456" } },
        fontSize: 27
      }
    };
    const html = renderHtml(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((v as any).target as HTMLElement).querySelector("parsererror")).toBeNull();
    // GT label colour + its dedicated font size + its background pill.
    expect(html).toContain('fill="#ff00aa"');
    expect(html).toContain('font-size="27"');
    expect(html).toContain('fill="#123456"');
    // Independence: the ordinary pillar label colour is still emitted, so the
    // GT style did NOT hijack every pillar label.
    expect(html).toContain('fill="#00ff00"');
  });

  test("grandTotal.showGrandTotal drives the GT append (moved off the general object in 1.1.75)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [{ name: "Sales", role: "actual", values: [100, 20, 200] }]
    }) as any;
    dv.metadata.objects = { grandTotal: { showGrandTotal: false } };
    v.update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
    // 3 categories, no GT pillar appended.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((v as any).target as HTMLElement).querySelectorAll(".wf-bar").length).toBe(3);
  });
});
