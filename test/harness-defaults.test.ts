/**
 * The harness DEFAULTS are themselves under test.
 *
 * `test/_harness.ts` injects conditional-formatting (fx) rule fills and the
 * matrix X-grain subtotal facet into every fixture, so that no future test can
 * be written without exercising the two mechanisms that have failed silently
 * in production:
 *
 *   • the fx cascade (1.1.18.0 — the `values[i].objects[r]` layer was missing,
 *     so rule colours reverted to the default the moment a field sat in the
 *     Table role);
 *   • the matrix `subtotals` block feeding the variance rails (break it and
 *     nothing throws — the rails just degrade to the leaf fallback).
 *
 * This suite guards the guard: if the defaults ever stop being injected, or
 * stop being resolved by the renderer, these tests go red instead of the
 * whole suite quietly losing its coverage.
 */

import {
  makeVisual,
  dvBuild,
  parse,
  expectFxDrivenBars,
  expectMatrixSubtotalWired,
  barRectOf,
  fxRuleFill,
  FX_NEG,
  FX_POS,
  FX_CAT,
  FX_CAT_LABEL
} from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function render(dv: Any, w = 720, h = 460): { v: Any; target: HTMLElement } {
  const v: Any = makeVisual();
  v.update({ dataViews: [dv], viewport: { width: w, height: h }, type: 2 });
  const target = v.target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return { v, target };
}

describe("harness default — the two fx rule families are injected and resolved", () => {
  test("rule BY SIGN: negative → red, positive → green", () => {
    // "C" avoids the category rule so both bars are decided by sign alone.
    const { target } = render(
      dvBuild({
        cats: [{ name: "Cat", values: ["A", "C"] }],
        vals: [{ name: "Sales", role: "actual", values: [100, -40] }]
      })
    );
    expect(barRectOf(target, 0)!.getAttribute("fill")).toBe(FX_POS);
    expect(barRectOf(target, 1)!.getAttribute("fill")).toBe(FX_NEG);
  });

  test("rule BY CATEGORY beats the sign rule — 'si catégorie = B alors orange'", () => {
    const { target } = render(
      dvBuild({
        cats: [{ name: "Cat", values: ["A", FX_CAT_LABEL, "C"] }],
        // B is NEGATIVE: if the sign rule won, it would come out red.
        vals: [{ name: "Sales", role: "actual", values: [100, -40, 30] }]
      })
    );
    expectFxDrivenBars(target, [
      { catIdx: 0, value: 100, label: "A" },
      { catIdx: 1, value: -40, label: FX_CAT_LABEL },
      { catIdx: 2, value: 30, label: "C" }
    ]);
    expect(barRectOf(target, 1)!.getAttribute("fill")).toBe(FX_CAT);
  });

  test("the fills land on BOTH cascade layers — L1 category rows and L4 value rows", () => {
    const dv: Any = dvBuild({
      cats: [{ name: "Cat", values: ["A", FX_CAT_LABEL] }],
      vals: [{ name: "Sales", role: "actual", values: [10, -20] }]
    });
    const catObjects = dv.categorical.categories[0].objects;
    const valObjects = dv.categorical.values[0].objects;
    expect(catObjects).toBeDefined();
    expect(valObjects).toBeDefined();
    // L4 is the layer that was missing until 1.1.18.0 — assert it explicitly.
    expect(valObjects[0].pillars.pillarColor.solid.color).toBe(FX_POS);
    expect(valObjects[1].pillars.pillarColor.solid.color).toBe(FX_CAT);
    expect(catObjects[0].bridges.colorBridge.solid.color).toBe(FX_POS);
  });

  test("THE 1.1.18.0 SCENARIO: a field in the Table role must not revert the rule", () => {
    // The exact production shape: the analysisDim (Table) role splits each
    // category into N rows, and the measure-driven rule fill lands on the
    // VALUE column's per-row objects. Before 1.1.18.0 the cascade never read
    // that layer and every bar fell back to the default colour.
    const { target } = render(
      dvBuild({
        cats: [
          { name: "Cat", values: ["A", "A", FX_CAT_LABEL, FX_CAT_LABEL] },
          { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [{ name: "Sales", role: "actual", values: [60, 40, -25, -15] }]
      })
    );
    expectFxDrivenBars(target, [
      { catIdx: 0, value: 60, label: "A" },
      { catIdx: 1, value: -25, label: FX_CAT_LABEL }
    ]);
  });

  test("caller-supplied objects WIN over the default (fixtures keep their meaning)", () => {
    const { target } = render(
      dvBuild({
        cats: [
          {
            name: "Cat",
            values: ["A", "C"],
            objects: [{ pillars: { pillarColor: { solid: { color: "#123456" } } } }, undefined]
          }
        ],
        vals: [{ name: "Sales", role: "actual", values: [100, 30] }]
      })
    );
    expect(barRectOf(target, 0)!.getAttribute("fill")).toBe("#123456");
    expect(barRectOf(target, 1)!.getAttribute("fill")).toBe(FX_POS);
  });

  test("the opt-out really opts out — `fx: false` restores the plain global colour", () => {
    const dv: Any = dvBuild({
      fx: false,
      cats: [{ name: "Cat", values: ["A", FX_CAT_LABEL] }],
      vals: [{ name: "Sales", role: "actual", values: [100, -40] }]
    });
    dv.metadata.objects = { pillars: { pillarColor: { solid: { color: "#0000aa" } } } };
    expect(dv.categorical.categories[0].objects).toBeUndefined();
    expect(dv.categorical.values[0].objects).toBeUndefined();
    const { target } = render(dv);
    expect(barRectOf(target, 0)!.getAttribute("fill")).toBe("#0000aa");
  });

  test("fxRuleFill is the single source of truth for the expected colour", () => {
    expect(fxRuleFill(-1, "A")).toBe(FX_NEG);
    expect(fxRuleFill(1, "A")).toBe(FX_POS);
    expect(fxRuleFill(0, "A")).toBe(FX_POS);
    expect(fxRuleFill(-1, FX_CAT_LABEL)).toBe(FX_CAT);
    expect(fxRuleFill(1, FX_CAT_LABEL)).toBe(FX_CAT);
    expect(fxRuleFill(null, null)).toBe(FX_POS);
  });
});

describe("harness default — matrix X-grain subtotals", () => {
  const railDv = (over?: Any): Any =>
    dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", FX_CAT_LABEL, FX_CAT_LABEL] },
        { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"], isAnalysisDim: true }
      ],
      vals: [
        { name: "Sales", role: "actual", values: [60, 40, -25, -15] },
        { name: "Var", role: "variance", values: [3, 7, -4, -6], format: "#,##0" }
      ],
      ...(over || {})
    });

  test("the facet is attached by DEFAULT — one node per X, every cell harvestable", () => {
    const dv = railDv();
    // The assertion that makes the silent failure noisy: no facet, no wiring,
    // no rails at the X grain — and nothing would have thrown.
    expectMatrixSubtotalWired(dv, 2);
  });

  test("the rails read the X-GRAIN subtotal, not a single leaf", () => {
    const v: Any = makeVisual();
    const result: Any = parse(v, railDv());
    // A = 3 + 7 = 10 at the X grain; a leaf-only read would give 3 or 7.
    expect(result.points[0].varianceValues[0]).toBeCloseTo(10, 6);
    expect(result.points[1].varianceValues[0]).toBeCloseTo(-10, 6);
  });

  test("removing the facet CHANGES the answer — proof the X-grain path is live", () => {
    // Same numbers, subtotals opted out: the rails fall back to the leaf
    // aggregate. If this produced the same result as the test above, the
    // X-grain path would be untested and its breakage undetectable.
    const v: Any = makeVisual();
    const withFacet: Any = parse(v, railDv());
    const withoutFacet: Any = parse(makeVisual(), railDv({ matrixSubtotals: false }));
    expect(withFacet.matrixVarianceByLabel?.size ?? 0).toBeGreaterThan(0);
    expect(withoutFacet.matrixVarianceByLabel?.size ?? 0).toBe(0);
  });

  test("a NON-ADDITIVE (%) variance keeps the fallback — the harness never fabricates a ratio subtotal", () => {
    // Summing a ratio across members (3 × +5% → +15%) is a number no DAX
    // engine would return. The harness must NOT invent it; such fixtures stay
    // on the documented leaf-representative path.
    const dv: Any = railDv({
      vals: [
        { name: "Sales", role: "actual", values: [60, 40, -25, -15] },
        { name: "Pct", role: "variance", values: [0.05, 0.05, -0.03, -0.03], format: "0.0%" }
      ]
    });
    expect(dv.matrix).toBeUndefined();
    const result: Any = parse(makeVisual(), dv);
    expect(result.points[0].varianceValues[0]).toBeCloseTo(0.05, 6);
  });

  test("subtotals and fx rules coexist — both defaults active on one fixture", () => {
    const dv = railDv();
    expectMatrixSubtotalWired(dv, 2);
    const { target } = render(dv);
    expectFxDrivenBars(target, [
      { catIdx: 0, value: 60, label: "A" },
      { catIdx: 1, value: -25, label: FX_CAT_LABEL }
    ]);
  });
});
