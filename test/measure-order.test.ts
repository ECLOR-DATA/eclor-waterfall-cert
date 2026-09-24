
import { makeVisual, dvBuild, parse } from "./_harness";

function pillarLabels(
  delivered: Array<{ name: string; index?: number }>,
  values = [10, 20, 30]
): string[] {
  const v = makeVisual();
  const dv = dvBuild({
    vals: delivered.map((d, i) => ({
      name: d.name,
      role: "actual" as const,
      values: [values[i] ?? 0],
      index: d.index
    })),
    fx: false
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = parse(v, dv) as any;
  return parsed.points.map((p: { label: string }) => p.label);
}

describe("field parameters — pillars follow the projection order", () => {
  test("columns delivered out of order are laid out by source.index", () => {
    expect(
      pillarLabels([
        { name: "Forecast", index: 2 },
        { name: "Actual", index: 0 },
        { name: "Budget", index: 1 }
      ])
    ).toEqual(["Actual", "Budget", "Forecast"]);
  });

  test("the values travel with their column, not with the slot", () => {
    const v = makeVisual();
    const dv = dvBuild({
      vals: [
        { name: "Forecast", role: "actual", values: [30], index: 2 },
        { name: "Actual", role: "actual", values: [10], index: 0 }
      ],
      fx: false
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = parse(v, dv) as any;
    expect(parsed.points.map((p: { label: string; actual: number }) => [p.label, p.actual])).toEqual([
      ["Actual", 10],
      ["Forecast", 30]
    ]);
  });

  test("an already-ordered delivery is untouched", () => {
    expect(
      pillarLabels([
        { name: "Actual", index: 0 },
        { name: "Budget", index: 1 },
        { name: "Forecast", index: 2 }
      ])
    ).toEqual(["Actual", "Budget", "Forecast"]);
  });

  test("no index at all (the ordinary DataView) → delivery order, unchanged", () => {
    expect(
      pillarLabels([{ name: "Forecast" }, { name: "Actual" }, { name: "Budget" }])
    ).toEqual(["Forecast", "Actual", "Budget"]);
  });

  test("partial or duplicate indices are ignored rather than half-applied", () => {
    expect(
      pillarLabels([{ name: "Forecast", index: 2 }, { name: "Actual" }])
    ).toEqual(["Forecast", "Actual"]);
    expect(
      pillarLabels([
        { name: "Forecast", index: 1 },
        { name: "Actual", index: 1 }
      ])
    ).toEqual(["Forecast", "Actual"]);
  });

  test("with a category dim, the comparison anchors take the same order", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings.general.mode.value = { value: "comparison" };
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [
        { name: "PY", role: "actual", values: [40, 60], index: 1 },
        { name: "AC", role: "actual", values: [50, 70], index: 0 }
      ]
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = parse(v, dv) as any;
    expect(parsed.actualMeasures.map((m: { displayName: string }) => m.displayName)).toEqual([
      "AC",
      "PY"
    ]);
  });
});

const solid = (color: string) => ({ solid: { color } });

function renderFills(
  dv: unknown,
  objects: Record<string, unknown>
): { fills: (string | null)[]; texts: (string | null)[]; v: ReturnType<typeof makeVisual> } {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDv = dv as any;
  anyDv.metadata.objects = { grandTotal: { showGrandTotal: false }, ...objects };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [anyDv], viewport: { width: 900, height: 560 }, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  const fills = Array.from(target.querySelectorAll("g.wf-bar")).map((g) => {
    const r = Array.from(g.querySelectorAll("rect")).find(
      (x) => !x.classList.contains("wf-focus-ring") && !x.closest("mask")
    );
    return r?.getAttribute("fill") ?? null;
  });
  const texts = Array.from(target.querySelectorAll("text")).map((t) => t.textContent);
  return { fills, texts, v };
}

describe("field parameters — colours travel with the measure", () => {
  test("measure-only: per-measure fills follow source.index, not the delivery slot", () => {
    const dv = dvBuild({
      vals: [
        { name: "M1", role: "actual", values: [-40], index: 1, objects: { pillars: { measureFillColor: solid("#0000ff") } } },
        { name: "M0", role: "actual", values: [100], index: 0, objects: { pillars: { measureFillColor: solid("#ff0000") } } }
      ]
    });
    const { fills, texts } = renderFills(dv, {});
    expect(fills).toEqual(["#ff0000", "#0000ff"]);
    expect(texts.indexOf("M0")).toBeLessThan(texts.indexOf("M1"));
  });

  test("comparison anchors: the first anchor carries the index-0 colour, the pane echoes each by queryName", () => {
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"], objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }] }],
      vals: [
        { name: "Y1", role: "actual", values: [120, -30], index: 1, objects: { pillars: { measureFillColor: solid("#0000ff") } } },
        { name: "Y0", role: "actual", values: [100, -40], index: 0, objects: { pillars: { measureFillColor: solid("#ff0000") } } }
      ]
    });
    const { fills, v } = renderFills(dv, { general: { mode: "comparison" } });
    expect(fills[0]).toBe("#ff0000");
    expect(fills[fills.length - 1]).toBe("#0000ff");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (v as any).getFormattingModel();
    type Slice = { uid?: string; control?: { properties?: { value?: { value?: string } } } };
    type Group = { uid?: string; slices?: Slice[] };
    const groups: Group[] = [];
    for (const card of model.cards) for (const g of card.groups || []) groups.push(g);
    const echo = (qn: string): string | undefined => {
      const g = groups.find((x) => (x.uid || "").includes(`pillarsMeasure_${qn}`));
      const s = g?.slices?.find((sl) => (sl.uid || "").includes("measureFillColor"));
      return s?.control?.properties?.value?.value;
    };
    expect(echo("Y0")).toBe("#ff0000");
    expect(echo("Y1")).toBe("#0000ff");
  });

  test("fx rule fills on the index-0 column drive the bars after a reorder", () => {
    const dv = dvBuild({
      fx: false,
      cats: [{ name: "Cat", values: ["A", "B", "C"], objects: [
        { pillars: { isPillar: true } }, { pillars: { isPillar: false } }, { pillars: { isPillar: true } }
      ] }],
      vals: [
        { name: "Other", role: "actual", values: [5, 5, 10], index: 1 },
        {
          name: "Primary", role: "actual", values: [100, -40, 60], index: 0,
          rowObjects: [
            { pillars: { pillarColor: solid("#800080") } },
            { bridges: { colorBridge: solid("#ff8c00") } },
            { pillars: { pillarColor: solid("#800080") } }
          ]
        }
      ]
    });
    const { fills, texts } = renderFills(dv, { general: { mode: "cumulative" } });
    expect(fills).toEqual(["#800080", "#ff8c00", "#800080"]);
    expect(texts).toContain("100");
  });
});
