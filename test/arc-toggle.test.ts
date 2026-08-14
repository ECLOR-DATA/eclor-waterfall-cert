/**
 * Per-arc visibility (1.1.58): a "Show arc" toggle per drawn arc, persisted
 * on the DESTINATION pillar — per category in cumulative mode, per measure
 * on comparison anchors. Covers the render gate AND the dynamic format-pane
 * groups ("origin → destination").
 */

import { makeVisual, dvBuild } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const render = (dv: any) => {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
  return v;
};

// Arc labels are the only texts carrying the auto-both " | " separator.
const arcCount = (v: unknown): number => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  return Array.from(target.querySelectorAll("text")).filter((t) =>
    (t.textContent || "").includes("|")
  ).length;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cumulativeDv = (bObjects?: Record<string, unknown>): any => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dv = dvBuild({
    cats: [
      {
        name: "Cat",
        values: ["A", "B", "C"],
        objects: [
          { pillars: { isPillar: true } },
          { pillars: { isPillar: true }, ...(bObjects || {}) },
          { pillars: { isPillar: true } }
        ]
      }
    ],
    vals: [{ name: "Sales", role: "actual", values: [100, 150, 200] }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  // GT off — the suite counts arcs between the 3 explicit pillars only
  // (1.1.62: an enabled GT appends a 4th pillar and with it a 3rd arc).
  dv.metadata.objects = { variationArc: { show: true }, grandTotal: { showGrandTotal: false } };
  return dv;
};

describe("per-arc visibility: render gate (1.1.58)", () => {
  test("3 pillars → 2 arcs by default", () => {
    expect(arcCount(render(cumulativeDv()))).toBe(2);
  });

  test("showArc=false persisted on the DESTINATION category hides exactly that arc", () => {
    // B is the destination of the A→B arc; B→C stays.
    const v = render(cumulativeDv({ variationArc: { showArc: false } }));
    expect(arcCount(v)).toBe(1);
  });

  test("showArc=true persisted explicitly keeps the arc (round-trip safety)", () => {
    const v = render(cumulativeDv({ variationArc: { showArc: true } }));
    expect(arcCount(v)).toBe(2);
  });

  test("comparison mode: showArc=false persisted on a MEASURE hides the arc into its anchor", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["X", "Y"] }],
      vals: [
        { name: "M1", role: "actual", values: [100, 100] },
        {
          name: "M2",
          role: "actual",
          values: [120, 110],
          objects: { variationArc: { showArc: false } }
        },
        { name: "M3", role: "actual", values: [130, 140] }
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = { general: { mode: "comparison" }, variationArc: { show: true } };
    const v = render(dv);
    // Anchors M1→M2→M3 give 2 arcs; hiding M2's inbound arc leaves 1.
    expect(arcCount(v)).toBe(1);
  });
});

describe("per-arc visibility: dynamic format-pane groups (1.1.58)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arcGroups = (v: any) => {
    v.getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return v.formattingSettings.variationArc.groups.slice(1) as any[];
  };

  test("one 'origin → destination' group per arc, toggle reflects the persisted value", () => {
    const v = render(cumulativeDv({ variationArc: { showArc: false } }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groups = arcGroups(v as any);
    expect(groups.map((g) => g.displayName)).toEqual(["A → B", "B → C"]);
    expect(groups[0].slices[0].value).toBe(false); // A→B hidden
    expect(groups[1].slices[0].value).toBe(true);
    // Group names globally unique + selector present (persistence target).
    expect(new Set(groups.map((g) => g.name)).size).toBe(groups.length);
    expect(groups[0].slices[0].selector).toBeTruthy();
  });

  test("arcs OFF → no per-arc groups (general group only)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = cumulativeDv();
    dv.metadata.objects = { variationArc: { show: false } };
    const v = render(dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v as any).formattingSettings.variationArc.groups.length).toBe(1);
  });

  test("comparison anchors get withMeasure-selector groups", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["X", "Y"] }],
      vals: [
        { name: "M1", role: "actual", values: [100, 100] },
        { name: "M2", role: "actual", values: [120, 110] }
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = { general: { mode: "comparison" }, variationArc: { show: true } };
    const v = render(dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groups = arcGroups(v as any);
    expect(groups.length).toBe(1);
    expect(groups[0].displayName).toBe("M1 → M2");
    expect(groups[0].name).toBe("arcDestMeasure_M2");
  });
});
