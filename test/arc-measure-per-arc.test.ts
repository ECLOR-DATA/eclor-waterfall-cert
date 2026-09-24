import { makeVisual, dvBuild, parse } from "./_harness";
import { ARC_MEASURE_AUTO, resolveArcMeasureIndex, totalArcSlots } from "../src/arcMeasures";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dv = any;

const arcTexts = (target: HTMLElement): string[] =>
  Array.from(target.querySelectorAll("text"))
    .map((t) => t.textContent || "")
    .filter((t) => /%$/.test(t) || /^▲|^▼/.test(t));

function render(dv: Dv, viewport = { width: 900, height: 480 }): { v: Dv; target: HTMLElement } {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return { v, target };
}

describe("resolveArcMeasureIndex — field order and per-arc override", () => {
  const names = ["KPI.A", "KPI.B", "KPI.C"];
  test("nothing bound ⇒ -1", () => {
    expect(resolveArcMeasureIndex(0, [])).toBe(-1);
    expect(resolveArcMeasureIndex(0, [], "KPI.A")).toBe(-1);
  });
  test("k-th arc ⇒ k-th measure, the last one repeating", () => {
    expect(resolveArcMeasureIndex(0, names)).toBe(0);
    expect(resolveArcMeasureIndex(1, names)).toBe(1);
    expect(resolveArcMeasureIndex(2, names)).toBe(2);
    expect(resolveArcMeasureIndex(7, names)).toBe(2);
    expect(resolveArcMeasureIndex(3, ["KPI.A"])).toBe(0);
  });
  test("a bound override wins; a stale or Auto override falls back to the order", () => {
    expect(resolveArcMeasureIndex(0, names, "KPI.C")).toBe(2);
    expect(resolveArcMeasureIndex(2, names, "KPI.A")).toBe(0);
    expect(resolveArcMeasureIndex(1, names, "KPI.GONE")).toBe(1);
    expect(resolveArcMeasureIndex(1, names, ARC_MEASURE_AUTO)).toBe(1);
  });
  test("totalArcSlots carries value, format and text per measure", () => {
    expect(totalArcSlots([{ total: 0.1, format: "0.0%" }, { total: null, format: "#,0", totalText: "▲" }])).toEqual([
      { value: 0.1, format: "0.0%", text: undefined },
      { value: null, format: "#,0", text: "▲" }
    ]);
  });
});

describe("comparison M = 3 — two arc measures, one per arc", () => {
  const build = (overrides: { [measure: string]: string } = {}, extraArc?: boolean): Dv => {
    const objFor = (name: string) =>
      overrides[name] ? { variationArc: { labelMeasure: overrides[name] } } : undefined;
    const dv = dvBuild({
      fx: false,
      cats: [{ name: "Country", values: ["A", "B"] }],
      vals: [
        { name: "M-2", role: "actual", values: [100, 200], format: "#,##0", objects: objFor("M-2") },
        { name: "M-1", role: "actual", values: [110, 210], format: "#,##0", objects: objFor("M-1") },
        { name: "M", role: "actual", values: [120, 240], format: "#,##0", objects: objFor("M") },
        { name: "Δ seg 1", role: "arcMeasure", values: [0.1, 0.05], format: "0.0%", queryName: "KPI.Δ seg 1" },
        { name: "Δ seg 2", role: "arcMeasure", values: [0.09, 0.14], format: "0.0%", queryName: "KPI.Δ seg 2" },
        ...(extraArc
          ? [{ name: "Note", role: "arcMeasure" as const, values: ["▲ objectif", "▲ objectif"], format: "", queryName: "KPI.Note" }]
          : [])
      ],
      matrixVar: {
        xOrder: ["A", "B"],
        measures: [
          { queryName: "KPI.Δ seg 1", values: [0.1, 0.05] },
          { queryName: "KPI.Δ seg 2", values: [0.09, 0.14] }
        ]
      }
    }) as Dv;
    dv.matrix.rows.root.children.push({
      isSubtotal: true,
      level: 0,
      values: { 0: { value: 320 / 300 - 1 }, 1: { value: 360 / 320 - 1 } }
    });
    dv.metadata.objects = { general: { mode: "comparison" }, variationArc: { show: true, defaultSource: "measure" } };
    return dv;
  };

  test("field order: arc 1 prints measure 1's total, arc 2 measure 2's", () => {
    const { target } = render(build());
    const texts = arcTexts(target);
    expect(texts).toContain("6.7%");
    expect(texts).toContain("12.5%");
  });

  test("the parse exposes every bound measure and slot 0 stays the legacy field", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = parse(v, build());
    expect(parsed.arcMeasures.map((m: { queryName: string }) => m.queryName)).toEqual(["KPI.Δ seg 1", "KPI.Δ seg 2"]);
    expect(parsed.arcMeasure.queryName).toBe("KPI.Δ seg 1");
  });

  test("per-arc override on the DESTINATION anchor swaps the measure (persisted per measure)", () => {
    const { target } = render(build({ M: "KPI.Δ seg 1" }));
    const texts = arcTexts(target);
    expect(texts.filter((t) => t === "6.7%").length).toBe(2);
    expect(texts).not.toContain("12.5%");
  });

  test("a stale override (measure no longer bound) falls back to the field order", () => {
    const { target } = render(build({ "M-1": "KPI.removed" }));
    const texts = arcTexts(target);
    expect(texts).toContain("6.7%");
    expect(texts).toContain("12.5%");
  });

  test("a TEXT measure picked for one arc prints verbatim", () => {
    const { target } = render(build({ "M-1": "KPI.Note" }, true));
    const texts = arcTexts(target);
    expect(texts).toContain("▲ objectif");
    expect(texts).toContain("12.5%");
  });

  test("one measure only ⇒ every arc reads it (1.4.0.0 behaviour, byte-identical)", () => {
    const dv = build();
    dv.categorical.values = dv.categorical.values.filter((c: Dv) => c.source.queryName !== "KPI.Δ seg 2");
    dv.matrix.valueSources = dv.matrix.valueSources.filter((s: Dv) => s.queryName !== "KPI.Δ seg 2");
    const { target } = render(dv);
    expect(arcTexts(target).filter((t) => t === "6.7%").length).toBe(2);
  });
});

describe("cumulative — per-category override", () => {
  const build = (overrideOnEnd?: string): Dv => {
    const dv = dvBuild({
      fx: false,
      cats: [
        {
          name: "Step",
          values: ["Start", "Mid", "End"],
          objects: [undefined, undefined, overrideOnEnd ? { variationArc: { labelMeasure: overrideOnEnd } } : undefined]
        }
      ],
      vals: [
        { name: "Amount", role: "actual", values: [1000, 200, 1300], format: "#,##0" },
        { name: "Pct", role: "arcMeasure", values: [0.01, 0.02, 0.03], format: "0.0%", queryName: "KPI.Pct" },
        { name: "Alt", role: "arcMeasure", values: [0.5, 0.6, 0.7], format: "0.0%", queryName: "KPI.Alt" }
      ]
    }) as Dv;
    dv.metadata.objects = {
      general: { mode: "comparison" },
      grandTotal: { showGrandTotal: false },
      variationArc: { show: true, defaultSource: "measure" }
    };
    return dv;
  };
  test("default: the single arc (Start → End) reads measure 1 at End's grain", () => {
    const { target } = render(build());
    expect(arcTexts(target)).toContain("3.0%");
  });
  test("override persisted on the destination category picks measure 2", () => {
    const { target } = render(build("KPI.Alt"));
    expect(arcTexts(target)).toContain("70.0%");
    expect(arcTexts(target)).not.toContain("3.0%");
  });
});

describe("format pane — per-arc « Label measure »", () => {
  test("each arc group lists Auto + every bound measure; the override is echoed", () => {
    const dv = dvBuild({
      fx: false,
      cats: [{ name: "Country", values: ["A", "B"] }],
      vals: [
        { name: "M-1", role: "actual", values: [100, 200], format: "#,##0" },
        { name: "M", role: "actual", values: [120, 240], format: "#,##0", objects: { variationArc: { labelMeasure: "KPI.B" } } },
        { name: "A", role: "arcMeasure", values: [0.1, 0.1], format: "0.0%", queryName: "KPI.A" },
        { name: "B", role: "arcMeasure", values: [0.2, 0.2], format: "0.0%", queryName: "KPI.B" }
      ]
    }) as Dv;
    dv.metadata.objects = { general: { mode: "comparison" }, variationArc: { show: true, defaultSource: "measure" } };
    const { v } = render(dv);
    const model = v.getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const card = model.cards.find((c: any) => c.uid === "variationArc-card");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arcGroups = card.groups.filter((g: any) => /^arcDest/.test(g.uid || ""));
    expect(arcGroups.length).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dd = arcGroups[0].slices.find((s: any) => s.control?.properties?.descriptor?.propertyName === "labelMeasure");
    expect(dd).toBeTruthy();
    const items = dd.control.properties.items.map((it: { value: string }) => it.value);
    expect(items).toEqual([ARC_MEASURE_AUTO, "KPI.A", "KPI.B"]);
    expect(dd.control.properties.value.value).toBe("KPI.B");
  });

  test("no arc measure bound ⇒ no dropdown (the group keeps Show arc + Arrow ends)", () => {
    const dv = dvBuild({
      fx: false,
      cats: [{ name: "Country", values: ["A", "B"] }],
      vals: [
        { name: "M-1", role: "actual", values: [100, 200], format: "#,##0" },
        { name: "M", role: "actual", values: [120, 240], format: "#,##0" }
      ]
    }) as Dv;
    dv.metadata.objects = { general: { mode: "comparison" }, variationArc: { show: true } };
    const { v } = render(dv);
    const model = v.getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const card = model.cards.find((c: any) => c.uid === "variationArc-card");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const group = card.groups.find((g: any) => /^arcDest/.test(g.uid || ""));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const names = group.slices.map((s: any) => s.control?.properties?.descriptor?.propertyName);
    expect(names).toEqual(["showArc", "arrowEnds"]);
  });
});

describe("comparison anchors — a TEXT arc measure reads the engine grand total", () => {
  test("the anchor arc prints the total's string, not the first category's", () => {
    const dv = dvBuild({
      fx: false,
      cats: [{ name: "Country", values: ["Canada", "France"] }],
      vals: [
        { name: "M-1", role: "actual", values: [100, 200], format: "#,##0" },
        { name: "M", role: "actual", values: [120, 240], format: "#,##0" },
        { name: "Txt", role: "arcMeasure", values: ["▼ -2.5% (Canada)", "▲ +9.0% (France)"], format: "", queryName: "KPI.Txt" }
      ],
      matrixVar: { xOrder: ["Canada", "France"], measures: [{ queryName: "KPI.Txt", values: [0, 0] }] }
    }) as Dv;
    dv.matrix.rows.root.children.push({ isSubtotal: true, level: 0, values: { 0: { value: "▲ +3.8% (total)" } } });
    dv.metadata.objects = { general: { mode: "comparison" }, variationArc: { show: true, defaultSource: "measure" } };
    const { target } = render(dv);
    const texts = arcTexts(target);
    expect(texts).toContain("▲ +3.8% (total)");
    expect(texts).not.toContain("▼ -2.5% (Canada)");
  });
  test("no facet ⇒ the first non-empty leaf string, as in 1.6.0.0", () => {
    const dv = dvBuild({
      fx: false,
      matrixSubtotals: false,
      cats: [{ name: "Country", values: ["Canada", "France"] }],
      vals: [
        { name: "M-1", role: "actual", values: [100, 200], format: "#,##0" },
        { name: "M", role: "actual", values: [120, 240], format: "#,##0" },
        { name: "Txt", role: "arcMeasure", values: ["", "▲ leaf"], format: "", queryName: "KPI.Txt" }
      ]
    }) as Dv;
    dv.metadata.objects = { general: { mode: "comparison" }, variationArc: { show: true, defaultSource: "measure" } };
    const { target } = render(dv);
    expect(arcTexts(target)).toContain("▲ leaf");
  });
});
