/**
 * feat/pillar-measure-overrides — two user-facing gaps closed together.
 *
 * DEMAND 1 — individual customisation of MEASURE pillars.
 *   Since 1.2.0.0 the per-pillar `fillStyle` dropdown lived only in the
 *   `cat_N` / `measure_N` groups, and that whole loop is short-circuited by
 *   `hideIsPillarToggle` in exactly the modes where the pillars ARE the
 *   measures (no-category + comparison, and comparison + dim + M≥2). The
 *   per-measure colour survived (`pillarsMeasure_*` groups), the fill style
 *   did not, and the outline had no per-pillar override in ANY mode.
 *   Fix: the appearance slices are decoupled from the (inert) isPillar
 *   toggle, and there is now ONE group per pillar instead of two.
 *
 * DEMAND 2 — hide the detail between two pillars (comparison, measures).
 *   `showBridgesBefore` on measure k drops the whole bridge block explaining
 *   measure k−1 → k, so the pillar reads as a standalone comparison bar.
 */

import { makeVisual, dvBuild, fxRuleFill, FX_POS, FX_CAT } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const solid = (c: string) => ({ solid: { color: c } });

function runUpdate(v: Any, dv: Any, w = 700, h = 460): HTMLElement {
  v.update({ dataViews: [dv], viewport: { width: w, height: h }, type: 2 });
  const target = v.target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return target;
}

/** Slice names of one Pillars group, by group name. */
function sliceNames(v: Any, groupName: string): string[] {
  const g = v.formattingSettings.pillars.groups.find(
    (x: Any) => String(x.name) === groupName
  );
  expect(g).toBeDefined();
  return g.slices.map((s: Any) => String(s.name));
}

function groupNames(v: Any): string[] {
  return v.formattingSettings.pillars.groups.map((g: Any) => String(g.name));
}

/** The BAR rect of one wf-bar group (excludes the focus ring). */
function barRect(target: HTMLElement, catIdx: number): SVGRectElement {
  const g = target.querySelector(`g.wf-bar[data-cat-idx="${catIdx}"]`)!;
  expect(g).toBeTruthy();
  return Array.from(g.querySelectorAll("rect")).find(
    (r) => !r.classList.contains("wf-focus-ring")
  ) as SVGRectElement;
}

function barCount(target: HTMLElement): number {
  return target.querySelectorAll("g.wf-bar").length;
}

/** 2 categories × 3 measures, comparison + dim ⇒ synth anchors.
 *  Per-measure totals: Y1=100, Y2=125, Y3=157. */
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

/** Same synth shape + an analysis dimension so the footnote table is built. */
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

/** Measures only (no dim, no legend) ⇒ no-category mode. */
function noCatDv(opts: {
  comparison?: boolean;
  measureObjects?: Array<Record<string, unknown> | undefined>;
}): Any {
  const dv: Any = dvBuild({
    vals: [
      { name: "M0", role: "actual", values: [80], objects: opts.measureObjects?.[0] },
      { name: "M1", role: "actual", values: [95], objects: opts.measureObjects?.[1] }
    ]
  });
  dv.metadata.objects = {
    ...(opts.comparison ? { general: { mode: "comparison" } } : {}),
    pillars: { pillarColor: solid("#0000aa") }
  };
  return dv;
}

// ============================================================================
// DEMAND 1 — format pane: one group per pillar, appearance decoupled from
//            the inert isPillar toggle.
// ============================================================================

describe("D1 pane — measure pillars carry the full appearance block", () => {
  test("comparison + dim + M≥2: pillarsMeasure_ groups gain fill style + outline overrides", () => {
    const v: Any = makeVisual();
    runUpdate(v, synthDv());
    v.getFormattingModel();

    expect(sliceNames(v, "pillarsMeasure_Y1")).toEqual([
      "measureFillColor",
      "fillStyle",
      "outlineMode",
      "outlineColorOverride",
      "outlineWidthOverride",
      "outlineStyleOverride",
      "measureLabelColor",
      "measureLabelBgColor"
    ]);
    // Persistence contract: EVERY slice of the group is selector-bound to the
    // measure, so PBI writes to values[i].source.objects.pillars.<name>.
    const g = v.formattingSettings.pillars.groups.find(
      (x: Any) => String(x.name) === "pillarsMeasure_Y1"
    );
    expect(g.slices.every((s: Any) => s.selector !== undefined)).toBe(true);
  });

  test("no-category + comparison: the fill-style slice is BACK (the 1.2.0.0 regression)", () => {
    const v: Any = makeVisual();
    runUpdate(v, noCatDv({ comparison: true }));
    v.getFormattingModel();
    const names = groupNames(v);
    // One group per measure — no `measure_N` twin next to `pillarsMeasure_*`.
    expect(names.filter((n) => n !== "pillarsGeneral").length).toBe(2);
    for (const qn of ["M0", "M1"]) {
      const slices = sliceNames(v, `pillarsMeasure_${qn}`);
      expect(slices).toContain("fillStyle");
      expect(slices).toContain("measureFillColor");
      expect(slices).toContain("outlineColorOverride");
      // isPillar is genuinely inert here (comparison forces every measure to
      // be a pillar) — the toggle stays hidden, the appearance does not.
      expect(slices).not.toContain("isPillar");
    }
  });

  test("no-category + cumulative: ONE group per measure, isPillar included", () => {
    const v: Any = makeVisual();
    runUpdate(v, noCatDv({}));
    v.getFormattingModel();
    const dyn = groupNames(v).filter((n) => n !== "pillarsGeneral");
    // Before the fix: pillarsMeasure_M0/M1 AND measure_0/measure_1 = 4 groups
    // for 2 pillars.
    expect(dyn.length).toBe(2);
    expect(sliceNames(v, "pillarsMeasure_M0")).toContain("isPillar");
    expect(sliceNames(v, "pillarsMeasure_M0")).toContain("fillStyle");
  });

  test("cumulative + dim: cat_N groups gain the outline overrides, keep isPillar first", () => {
    const v: Any = makeVisual();
    const dv: Any = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [{ name: "Sales", role: "actual", values: [100, -30, 40] }]
    });
    runUpdate(v, dv);
    v.getFormattingModel();
    expect(sliceNames(v, "cat_0")).toEqual([
      "isPillar",
      "fillStyle",
      "outlineMode",
      "outlineColorOverride",
      "outlineWidthOverride",
      "outlineStyleOverride"
    ]);
  });

  test("Group.name stays globally unique across the merged groups (TG-08 invariant)", () => {
    for (const dv of [synthDv(), noCatDv({}), noCatDv({ comparison: true })]) {
      const v: Any = makeVisual();
      runUpdate(v, dv);
      v.getFormattingModel();
      const all: string[] = [];
      for (const card of v.formattingSettings.cards) {
        if (Array.isArray(card.groups)) for (const g of card.groups) all.push(String(g.name));
      }
      expect(new Set(all).size).toBe(all.length);
    }
  });
});

// ============================================================================
// DEMAND 1 — render: the overrides actually paint.
// ============================================================================

describe("D1 render — per-measure fill style and outline", () => {
  test("comparison synth: hatched Y1 anchor next to a solid Y2 anchor", () => {
    // Both anchors pin their own colour via measureFillColor so the assertion
    // is independent of `defaultPillarColor` — which, with the harness fx
    // rules ON, is itself rule-derived (see the pinned finding at the bottom
    // of this file).
    const target = runUpdate(
      makeVisual(),
      synthDv([
        { pillars: { fillStyle: "hatched", measureFillColor: solid("#0000aa") } },
        { pillars: { measureFillColor: solid("#0000aa") } },
        undefined
      ])
    );
    // Column 0 = pillar(Y1), column 3 = pillar(Y2) (blockSize = 1 + N = 3).
    expect(barRect(target, 0).getAttribute("fill")).toBe("url(#wf-hatch-0000aa)");
    expect(barRect(target, 3).getAttribute("fill")).toBe("#0000aa");
  });

  test("comparison synth: per-measure outline (colour + width + dash) on ONE anchor", () => {
    const target = runUpdate(
      makeVisual(),
      synthDv([
        {
          pillars: {
            outlineMode: "on",
            outlineColorOverride: solid("#ff3300"),
            outlineWidthOverride: 3,
            outlineStyleOverride: "dashed"
          }
        },
        undefined,
        undefined
      ])
    );
    const p0 = barRect(target, 0);
    expect(p0.getAttribute("stroke")).toBe("#ff3300");
    expect(p0.getAttribute("stroke-width")).toBe("3");
    expect(p0.getAttribute("stroke-dasharray")).toBeTruthy();
    // The other anchor follows the global (outline off by default).
    expect(barRect(target, 3).getAttribute("stroke")).toBeNull();
  });

  test("comparison synth: per-measure fill COLOUR still wins (1.1.12.0 non-regression)", () => {
    const target = runUpdate(
      makeVisual(),
      synthDv([
        { pillars: { measureFillColor: solid("#101010") } },
        { pillars: { measureFillColor: solid("#202020") } },
        undefined
      ])
    );
    expect(barRect(target, 0).getAttribute("fill")).toBe("#101010");
    expect(barRect(target, 3).getAttribute("fill")).toBe("#202020");
    // Y3 sets no per-measure colour, so it falls back to `defaultPillarColor`
    // — which under an fx RULE is the rule's FIRST-ROW result, not the global
    // #0000aa. That is the pinned finding below, asserted here so the
    // fallback path is not silently mis-read as "the global colour".
    expect(barRect(target, 6).getAttribute("fill")).toBe(FX_POS);
  });

  test("no-category: per-measure fill style + outline paint independently", () => {
    const target = runUpdate(
      makeVisual(),
      noCatDv({
        measureObjects: [
          { pillars: { fillStyle: "hatched" } },
          { pillars: { outlineMode: "on", outlineColorOverride: solid("#00ff00") } }
        ]
      })
    );
    expect(barRect(target, 0).getAttribute("fill")).toBe("url(#wf-hatch-0000aa)");
    expect(barRect(target, 1).getAttribute("stroke")).toBe("#00ff00");
  });

  test("per-pillar outline overrides the GLOBAL outline group knob by knob", () => {
    const dv = synthDv([{ pillars: { outlineWidthOverride: 4 } }, undefined, undefined]);
    dv.metadata.objects.pillars = {
      pillarColor: solid("#0000aa"),
      outlineShow: true,
      outlineColor: solid("#123123"),
      outlineWidth: 1,
      outlineStyle: "solid"
    };
    const target = runUpdate(makeVisual(), dv);
    const p0 = barRect(target, 0);
    expect(p0.getAttribute("stroke")).toBe("#123123"); // colour inherited
    expect(p0.getAttribute("stroke-width")).toBe("4"); // width overridden
    expect(barRect(target, 3).getAttribute("stroke-width")).toBe("1"); // global
  });
});

// ============================================================================
// BACKWARD COMPATIBILITY — a report saved with 1.2.0.0 must look identical.
// ============================================================================

describe("D1 back-compat — persisted 1.2.0.0 values are read unchanged", () => {
  test("per-ROW pillars.fillStyle (cumulative + dim) still applies, ON TOP of the fx rule colour", () => {
    const dv: Any = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B", "C"],
          objects: [{ pillars: { fillStyle: "hatched" } }, undefined, undefined]
        }
      ],
      vals: [{ name: "Sales", role: "actual", values: [100, -30, 40] }]
    });
    dv.metadata.objects = { pillars: { pillarColor: solid("#0000aa") } };
    const v: Any = makeVisual();
    const target = runUpdate(v, dv);
    // Structure (hatch) and colour (rule) are independent axes: A is positive
    // and not the category-rule member, so the sign rule gives it FX_POS and
    // the hatch pattern is keyed on THAT colour.
    const aColor = fxRuleFill(100, "A");
    expect(aColor).toBe(FX_POS);
    expect(barRect(target, 0).getAttribute("fill")).toBe(
      `url(#wf-hatch-${aColor.slice(1)})`
    );
    expect(v.cachedCategoryDisplay[0].fillStyleOverride).toBe("hatched");
    // B is the discrete "si telle catégorie alors orange" member — the
    // category rule must beat the sign rule even though B is negative.
    expect(barRect(target, 1).getAttribute("fill")).toBe(FX_CAT);
  });

  test("per-MEASURE pillars.fillStyle persisted in no-cat mode is read back on the model", () => {
    const v: Any = makeVisual();
    runUpdate(
      v,
      noCatDv({ measureObjects: [{ pillars: { fillStyle: "outlined" } }, undefined] })
    );
    expect(v.cachedCategoryDisplay[0].fillStyleOverride).toBe("outlined");
    v.getFormattingModel();
    const g = v.formattingSettings.pillars.groups.find(
      (x: Any) => String(x.name) === "pillarsMeasure_M0"
    );
    const fs = g.slices.find((s: Any) => s.name === "fillStyle");
    expect(fs.value.value).toBe("outlined");
  });

  test("measureFillColor / measureLabelColor / measureLabelBgColor keep their pane values", () => {
    const v: Any = makeVisual();
    runUpdate(
      v,
      synthDv([
        {
          pillars: {
            measureFillColor: solid("#111222"),
            measureLabelColor: solid("#333444"),
            measureLabelBgColor: solid("#555666")
          }
        },
        undefined,
        undefined
      ])
    );
    v.getFormattingModel();
    const g = v.formattingSettings.pillars.groups.find(
      (x: Any) => String(x.name) === "pillarsMeasure_Y1"
    );
    const byName = Object.fromEntries(g.slices.map((s: Any) => [s.name, s]));
    expect(byName.measureFillColor.value.value).toBe("#111222");
    expect(byName.measureLabelColor.value.value).toBe("#333444");
    expect(byName.measureLabelBgColor.value.value).toBe("#555666");
  });

  test("an untouched report renders EXACTLY as before (no new default changes paint)", () => {
    // fx OFF (harness default is ON). Justification: this is the "no rule at
    // all" baseline — it proves none of the properties added by this feature
    // changes an untouched 1.2.0.0 report's paint. With rules on there is no
    // "global colour" left to compare against.
    const dv = synthDv();
    const plain: Any = dvBuild({
      fx: false,
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [
        { name: "Y1", role: "actual", values: [30, 70] },
        { name: "Y2", role: "actual", values: [45, 80] },
        { name: "Y3", role: "actual", values: [52, 105] }
      ]
    });
    plain.metadata.objects = dv.metadata.objects;
    const target = runUpdate(makeVisual(), plain);
    expect(barCount(target)).toBe(7); // M + (M-1)·N = 3 + 2·2
    const p0 = barRect(target, 0);
    expect(p0.getAttribute("fill")).toBe("#0000aa");
    expect(p0.getAttribute("stroke")).toBeNull();
  });

  test("FINDING (pinned, not fixed): an fx RULE hijacks `defaultPillarColor`", () => {
    // Surfaced by turning the harness fx rules on by default.
    //
    // `patchFxSlice` echoes the first per-row rule fill it finds (row-major)
    // into `fs.pillars.pillarColor` so the Format pane shows a resolved colour
    // instead of reverting to the default (src/visual.ts, ~line 1848). A few
    // lines later `defaultPillarColor` is read FROM that patched slice — so
    // the pane-display echo becomes the RENDER's global fallback.
    //
    // For an fx CONSTANT that is exactly right (and is why the patch exists).
    // For an fx RULE it is arbitrary: the first row's result leaks into every
    // consumer of the global fallback — comparison measure-anchor pillars, the
    // Grand Total colour, legend segment defaults.
    //
    // Left AS IS deliberately: changing it moves colour resolution for every
    // fx-rule report in production, which is a decision for Nicolas, not a
    // side effect of a test-harness change. This test makes the behaviour
    // explicit so it can never regress silently in either direction.
    const v: Any = makeVisual();
    runUpdate(v, synthDv());
    expect(v.formattingSettings.pillars.pillarColor.value.value).toBe(FX_POS);
    expect(v.cachedDefaultPillarColor).toBe(FX_POS);
    // …even though the report persisted #0000aa as its global pillar colour.
    expect(v.cachedDefaultPillarColor).not.toBe("#0000aa");
  });
});

// ============================================================================
// DEMAND 2 — hide the bridges of one segment.
// ============================================================================

describe("D2 — per-segment bridge hiding (comparison, measure pillars)", () => {
  test("pane: showBridgesBefore appears on every pillar BUT the first", () => {
    const v: Any = makeVisual();
    runUpdate(v, synthDv());
    v.getFormattingModel();
    expect(sliceNames(v, "pillarsMeasure_Y1")).not.toContain("showBridgesBefore");
    expect(sliceNames(v, "pillarsMeasure_Y2")).toContain("showBridgesBefore");
    expect(sliceNames(v, "pillarsMeasure_Y3")).toContain("showBridgesBefore");
  });

  test("default ON ⇒ historical layout, zero regression", () => {
    const v: Any = makeVisual();
    const target = runUpdate(v, synthDv());
    expect(barCount(target)).toBe(7);
    expect(v.cachedCategoryDisplay.map((c: Any) => c.isPillar)).toEqual([
      true, false, false, true, false, false, true
    ]);
  });

  test("hiding the LAST segment: Y3 becomes a standalone comparison bar", () => {
    const v: Any = makeVisual();
    const target = runUpdate(
      v,
      synthDv([undefined, undefined, { pillars: { showBridgesBefore: false } }])
    );
    // 3 pillars + 2 bridges (the Y2→Y3 block is gone).
    expect(barCount(target)).toBe(5);
    expect(v.cachedCategoryDisplay.map((c: Any) => c.isPillar)).toEqual([
      true, false, false, true, true
    ]);
    expect(v.cachedCategoryDisplay.map((c: Any) => c.label)).toEqual([
      "Y1", "A", "B", "Y2", "Y3"
    ]);
    // Pillar values untouched — only the decomposition is hidden.
    expect(v.cachedCategoryDisplay[4].actualValue).toBeCloseTo(157, 6);
  });

  test("hiding the FIRST segment leaves the second one intact", () => {
    const v: Any = makeVisual();
    const target = runUpdate(
      v,
      synthDv([undefined, { pillars: { showBridgesBefore: false } }, undefined])
    );
    expect(barCount(target)).toBe(5);
    expect(v.cachedCategoryDisplay.map((c: Any) => c.label)).toEqual([
      "Y1", "Y2", "A", "B", "Y3"
    ]);
  });

  test("no gap left behind — bars stay evenly spaced after the hidden block", () => {
    const v: Any = makeVisual();
    const target = runUpdate(
      v,
      synthDv([undefined, undefined, { pillars: { showBridgesBefore: false } }])
    );
    expect(v.lastValidRenderInput.layout.items.length).toBe(5);
    // The hidden bridges must not leave a hole: the 5 remaining bars keep the
    // normal, uniform slot pitch (X positions come from the rendered rects —
    // LayoutItem carries values, buildSVG owns the geometry).
    const xs = [0, 1, 2, 3, 4].map((i) => Number(barRect(target, i).getAttribute("x")));
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 3);
  });

  test("the variation ARC between the two now-adjacent pillars survives", () => {
    // Arc labels are the only texts carrying the auto-both " | " separator
    // (same probe as arc-toggle.test.ts). One arc per consecutive pillar
    // pair — M−1 = 2 whether or not a segment is hidden: the global gap is
    // exactly the information the user asked to keep.
    const arcsOf = (t: HTMLElement) =>
      Array.from(t.querySelectorAll("text")).filter((x) =>
        (x.textContent || "").includes("|")
      ).length;
    const withArcs = (measureObjects?: Any) => {
      const dv = synthDv(measureObjects);
      dv.metadata.objects.variationArc = { show: true };
      return runUpdate(makeVisual(), dv);
    };
    expect(arcsOf(withArcs())).toBe(2);
    expect(
      arcsOf(withArcs([undefined, undefined, { pillars: { showBridgesBefore: false } }]))
    ).toBe(2);
  });

  // The explicit connectorColor isolates connectors from gridlines and rail
  // centre lines — same probe as vertical.test.ts.
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

  test("the connector into a pillar whose segment is HIDDEN is dropped", () => {
    // A connector asserts "the running total carries over at this level".
    // Across a hidden segment nothing explains that step, so the line drew a
    // claim the chart no longer makes (reported from the Desktop render:
    // a dangling stub between the two adjacent pillars). 1.3.0.0 kept it as
    // an IBCS reference line; it is now suppressed. The variation ARC still
    // carries the gap — that is the information the user asked to keep.
    // 7 bars, nothing hidden ⇒ 6 connectors.
    expect(connectorsOf().length).toBe(6);
    // Y2→Y3 hidden ⇒ 5 bars, and only the Y1→A→B→Y2 chain is connected.
    expect(
      connectorsOf([undefined, undefined, { pillars: { showBridgesBefore: false } }]).length
    ).toBe(3);
  });

  test("hiding the FIRST segment drops only ITS connector", () => {
    // Y1→Y2 hidden, Y2→A→B→Y3 intact ⇒ 3 connectors out of the 4 slots.
    expect(
      connectorsOf([undefined, { pillars: { showBridgesBefore: false } }, undefined]).length
    ).toBe(3);
  });

  test("INVARIANT Σ cells per column = bar.actual, with a hidden segment", () => {
    const v: Any = makeVisual();
    runUpdate(
      v,
      synthDvWithTable([undefined, undefined, { pillars: { showBridgesBefore: false } }])
    );
    const cells: number[][] = v.cachedAnalysisCells;
    const items = v.lastValidRenderInput.layout.items;
    expect(items.length).toBe(5);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0].length).toBe(5); // hidden bridges are NOT table columns
    for (let col = 0; col < items.length; col++) {
      const colSum = cells.reduce((s, row) => s + (row[col] ?? 0), 0);
      expect(colSum).toBeCloseTo(items[col].actualVal, 6);
    }
  });

  test("INVARIANT still holds with NOTHING hidden (7 columns)", () => {
    const v: Any = makeVisual();
    runUpdate(v, synthDvWithTable());
    const cells: number[][] = v.cachedAnalysisCells;
    const items = v.lastValidRenderInput.layout.items;
    expect(cells[0].length).toBe(7);
    for (let col = 0; col < items.length; col++) {
      const colSum = cells.reduce((s, row) => s + (row[col] ?? 0), 0);
      expect(colSum).toBeCloseTo(items[col].actualVal, 6);
    }
  });

  test("VERTICAL orientation: the hiding lives upstream of the projection", () => {
    const v: Any = makeVisual();
    const dv = synthDv([undefined, undefined, { pillars: { showBridgesBefore: false } }]);
    dv.metadata.objects.general = { mode: "comparison", orientation: "vertical" };
    const target = runUpdate(v, dv);
    expect(barCount(target)).toBe(5);
    expect(v.cachedCategoryDisplay.map((c: Any) => c.label)).toEqual([
      "Y1", "A", "B", "Y2", "Y3"
    ]);
  });

  test("hiding EVERY segment leaves M bare pillars, still renderable", () => {
    const v: Any = makeVisual();
    const target = runUpdate(
      v,
      synthDv([
        undefined,
        { pillars: { showBridgesBefore: false } },
        { pillars: { showBridgesBefore: false } }
      ])
    );
    expect(barCount(target)).toBe(3);
    expect(v.cachedCategoryDisplay.every((c: Any) => c.isPillar)).toBe(true);
  });

  test("showBridgesBefore is inert outside the synth-comparison layout", () => {
    // No-category comparison has no bridges at all — the property must not
    // change anything (and must not crash).
    const v: Any = makeVisual();
    const target = runUpdate(
      v,
      noCatDv({
        comparison: true,
        measureObjects: [undefined, { pillars: { showBridgesBefore: false } }]
      })
    );
    expect(barCount(target)).toBe(2);
  });
});
