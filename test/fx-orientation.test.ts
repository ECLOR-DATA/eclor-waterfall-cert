/**
 * fx conditional-formatting cascade × orientation matrix (Mission B2).
 *
 * The 4-layer persistence cascade (CLAUDE.md gotcha) must resolve to the
 * SAME rendered colours in both orientations — the vertical renderer reads
 * the same parse-time caches (cachedCategoryDisplay, VarianceMeasureInfo)
 * as the horizontal one, and this suite pins that equivalence per layer:
 *
 *   L1  category-column per-row objects (primary AND secondary/analysisDim)
 *   L2  metadata.objects (global constants)
 *   L3  values[i].source.objects (no-category slot: pillars.measureFillColor;
 *       per-measure rails: varianceMeasure.colorPos/colorNeg)
 *   L4  values[i].objects[r] (measure-driven fx RULE fills — the 1.1.18.0
 *       scenario: category split into N rows by the Table role)
 *
 * Surfaces: pillar bar fill, bridge bar fill, rail bar fills (pos/neg),
 * arc label colour (destination-category resolution), Format-pane echo
 * (patchFxSlice) under a persisted vertical orientation.
 */

import { makeVisual, dvBuild } from "./_harness";

const VIEWPORT = { width: 900, height: 560 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dv = any;

const solid = (color: string) => ({ solid: { color } });

function render(dv: Dv) {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport: VIEWPORT, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return { v, target };
}

/** Body rect of the bar wrapped in g.wf-bar[data-cat-idx=i]. */
function barFill(target: HTMLElement, catIdx: number): string | null {
  const bar = target.querySelector(`g.wf-bar[data-cat-idx="${catIdx}"]`);
  const rect = Array.from(bar?.querySelectorAll("rect") || []).find(
    (r) => !r.classList.contains("wf-focus-ring") && !r.closest("mask")
  );
  return rect?.getAttribute("fill") ?? null;
}

function baseObjects(orientation: string, extra?: Record<string, unknown>) {
  return {
    general: { orientation },
    grandTotal: { showGrandTotal: false },
    ...(extra || {})
  };
}

for (const orientation of ["horizontal", "vertical"] as const) {
  describe(`fx cascade — ${orientation}`, () => {
    test("L1 primary category per-row objects: pillar + bridge bar fills", () => {
      const dv = dvBuild({
        // fx OFF (harness default is ON). Justification: this IS the dedicated
        // cascade suite — each test injects ONE layer and asserts it is the
        // layer that wins. The harness default writes competing fills on L1
        // and L4, which would mask exactly the isolation being measured.
        fx: false,
        cats: [
          {
            name: "Cat",
            values: ["A", "B"],
            objects: [
              { pillars: { isPillar: true, pillarColor: solid("#112233") } },
              { pillars: { isPillar: false }, bridges: { colorBridge: solid("#445566") } }
            ]
          }
        ],
        vals: [{ name: "Sales", role: "actual", values: [100, -40] }]
      }) as Dv;
      dv.metadata.objects = baseObjects(orientation);
      const { target } = render(dv);
      expect(barFill(target, 0)).toBe("#112233");
      expect(barFill(target, 1)).toBe("#445566");
    });

    test("L1 secondary (analysisDim) column per-row objects: fill found on the Table column", () => {
      // The fill lands on the ADIM column's row objects (a real host shape
      // once a field occupies the Table role) — the cascade must find it.
      const dv = dvBuild({
        // fx OFF (harness default is ON). Justification: this IS the dedicated
        // cascade suite — each test injects ONE layer and asserts it is the
        // layer that wins. The harness default writes competing fills on L1
        // and L4, which would mask exactly the isolation being measured.
        fx: false,
        cats: [
          {
            name: "Cat",
            values: ["A", "A"],
            objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
          },
          {
            name: "P",
            values: ["x", "y"],
            isAnalysisDim: true,
            objects: [{ pillars: { pillarColor: solid("#221100") } }, {}]
          }
        ],
        vals: [{ name: "Sales", role: "actual", values: [60, 40] }]
      }) as Dv;
      dv.metadata.objects = baseObjects(orientation);
      const { target } = render(dv);
      expect(barFill(target, 0)).toBe("#221100");
    });

    test("L2 metadata.objects: global pillar + bridge constants", () => {
      const dv = dvBuild({
        // fx OFF (harness default is ON). Justification: this IS the dedicated
        // cascade suite — each test injects ONE layer and asserts it is the
        // layer that wins. The harness default writes competing fills on L1
        // and L4, which would mask exactly the isolation being measured.
        fx: false,
        cats: [
          {
            name: "Cat",
            values: ["A", "B"],
            objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: false } }]
          }
        ],
        vals: [{ name: "Sales", role: "actual", values: [100, -40] }]
      }) as Dv;
      dv.metadata.objects = baseObjects(orientation, {
        pillars: { pillarColor: solid("#0a0b0c") },
        bridges: { colorBridge: solid("#c0ffee") }
      });
      const { target } = render(dv);
      expect(barFill(target, 0)).toBe("#0a0b0c");
      expect(barFill(target, 1)).toBe("#c0ffee");
    });

    test("L3 values[i].source.objects: per-measure fills in no-category mode", () => {
      const dv = dvBuild({
        // fx OFF (harness default is ON). Justification: this IS the dedicated
        // cascade suite — each test injects ONE layer and asserts it is the
        // layer that wins. The harness default writes competing fills on L1
        // and L4, which would mask exactly the isolation being measured.
        fx: false,
        vals: [
          {
            name: "M0",
            role: "actual",
            values: [80],
            objects: { pillars: { measureFillColor: solid("#101010") } }
          },
          {
            name: "M1",
            role: "actual",
            values: [95],
            objects: { pillars: { measureFillColor: solid("#202020") } }
          }
        ]
      }) as Dv;
      dv.metadata.objects = baseObjects(orientation);
      const { target } = render(dv);
      expect(barFill(target, 0)).toBe("#101010");
      expect(barFill(target, 1)).toBe("#202020");
    });

    test("L4 values[i].objects[r] rule fills under a Table split (the 1.1.18.0 scenario)", () => {
      // Category split into 2 rows each by the Table role; the measure-driven
      // RULE lands its resolved per-data-point fill on the VALUE column's
      // per-row objects. Both rows of a category carry that category's fill.
      const dv = dvBuild({
        // fx OFF (harness default is ON). Justification: this IS the dedicated
        // cascade suite — each test injects ONE layer and asserts it is the
        // layer that wins. The harness default writes competing fills on L1
        // and L4, which would mask exactly the isolation being measured.
        fx: false,
        cats: [
          {
            name: "Cat",
            values: ["A", "A", "B", "B"],
            objects: [
              { pillars: { isPillar: true } },
              { pillars: { isPillar: true } },
              { pillars: { isPillar: false } },
              { pillars: { isPillar: false } }
            ]
          },
          { name: "P", values: ["x", "y", "x", "y"], isAnalysisDim: true }
        ],
        vals: [
          {
            name: "Sales",
            role: "actual",
            values: [60, 40, -25, -15],
            rowObjects: [
              { pillars: { pillarColor: solid("#aa0000") } },
              { pillars: { pillarColor: solid("#aa0000") } },
              { bridges: { colorBridge: solid("#00bb00") } },
              { bridges: { colorBridge: solid("#00bb00") } }
            ]
          }
        ]
      }) as Dv;
      dv.metadata.objects = baseObjects(orientation);
      const { target } = render(dv);
      expect(barFill(target, 0)).toBe("#aa0000");
      expect(barFill(target, 1)).toBe("#00bb00");
    });

    test("rails: varianceMeasure.colorPos/colorNeg per-measure fills by sign", () => {
      const dv = dvBuild({
        // fx OFF (harness default is ON). Justification: this IS the dedicated
        // cascade suite — each test injects ONE layer and asserts it is the
        // layer that wins. The harness default writes competing fills on L1
        // and L4, which would mask exactly the isolation being measured.
        fx: false,
        cats: [
          {
            name: "Cat",
            values: ["A", "B", "C"],
            objects: [
              { pillars: { isPillar: true } },
              { pillars: { isPillar: false } },
              { pillars: { isPillar: false } }
            ]
          }
        ],
        vals: [
          { name: "Sales", role: "actual", values: [100, -40, 20] },
          {
            name: "Δ",
            role: "variance",
            values: [12, -7, 5],
            objects: {
              varianceMeasure: {
                colorPos: solid("#123abc"),
                colorNeg: solid("#abc123")
              }
            }
          }
        ]
      }) as Dv;
      dv.metadata.objects = baseObjects(orientation);
      const { target } = render(dv);
      // Rail bars are the top-level rects carrying data-cat-idx.
      const railRects = Array.from(
        target.querySelectorAll("svg > rect[data-cat-idx]")
      );
      expect(railRects.length).toBe(3);
      const fillFor = (idx: number) =>
        railRects
          .find((r) => r.getAttribute("data-cat-idx") === String(idx))
          ?.getAttribute("fill");
      expect(fillFor(0)).toBe("#123abc"); // +12
      expect(fillFor(1)).toBe("#abc123"); // -7
      expect(fillFor(2)).toBe("#123abc"); // +5
    });

    test("arcs: destination-category L1 fill drives the arc label colour", () => {
      const dv = dvBuild({
        // fx OFF (harness default is ON). Justification: this IS the dedicated
        // cascade suite — each test injects ONE layer and asserts it is the
        // layer that wins. The harness default writes competing fills on L1
        // and L4, which would mask exactly the isolation being measured.
        fx: false,
        cats: [
          {
            name: "Cat",
            values: ["A", "B"],
            objects: [
              { pillars: { isPillar: true } },
              {
                pillars: { isPillar: true },
                variationArc: { labelColor: solid("#7b2d8e") }
              }
            ]
          }
        ],
        vals: [{ name: "Sales", role: "actual", values: [100, 130] }]
      }) as Dv;
      dv.metadata.objects = baseObjects(orientation, { variationArc: { show: true } });
      const { target } = render(dv);
      const arcLabel = Array.from(target.querySelectorAll("svg > text")).find(
        (t) => t.getAttribute("fill") === "#7b2d8e"
      );
      expect(arcLabel).toBeTruthy();
      expect(arcLabel!.textContent).toContain("+30");
    });

    test("arcs: L2 global metadata variationArc.labelColor fallback", () => {
      const dv = dvBuild({
        // fx OFF (harness default is ON). Justification: this IS the dedicated
        // cascade suite — each test injects ONE layer and asserts it is the
        // layer that wins. The harness default writes competing fills on L1
        // and L4, which would mask exactly the isolation being measured.
        fx: false,
        cats: [
          {
            name: "Cat",
            values: ["A", "B"],
            objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
          }
        ],
        vals: [{ name: "Sales", role: "actual", values: [100, 130] }]
      }) as Dv;
      dv.metadata.objects = baseObjects(orientation, {
        variationArc: { show: true, labelColor: solid("#004488") }
      });
      const { target } = render(dv);
      const arcLabel = Array.from(target.querySelectorAll("svg > text")).find(
        (t) => t.getAttribute("fill") === "#004488"
      );
      expect(arcLabel).toBeTruthy();
    });
  });
}

describe("fx cascade — Format pane echo under vertical orientation", () => {
  test("patchFxSlice reflects an L4 rule fill into the pillarColor slice (orientation-orthogonal)", () => {
    const dv = dvBuild({
        // fx OFF (harness default is ON). Justification: this IS the dedicated
        // cascade suite — each test injects ONE layer and asserts it is the
        // layer that wins. The harness default writes competing fills on L1
        // and L4, which would mask exactly the isolation being measured.
        fx: false,
      cats: [
        {
          name: "Cat",
          values: ["A", "A"],
          objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
        },
        { name: "P", values: ["x", "y"], isAnalysisDim: true }
      ],
      vals: [
        {
          name: "Sales",
          role: "actual",
          values: [60, 40],
          rowObjects: [
            { pillars: { pillarColor: solid("#e1e2e3") } },
            { pillars: { pillarColor: solid("#e1e2e3") } }
          ]
        }
      ]
    }) as Dv;
    dv.metadata.objects = { general: { orientation: "vertical" } };
    const { v } = render(dv);
    // The pane build runs patchFxSlice over the SAME dataView the render
    // consumed — the slice must echo the rule-resolved fill.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fs = (v as any).formattingSettings;
    expect(fs.pillars.pillarColor.value.value).toBe("#e1e2e3");
    // And the orientation dropdown itself round-tripped.
    expect(fs.general.orientation.value.value).toBe("vertical");
  });
});
