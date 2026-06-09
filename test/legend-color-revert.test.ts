
import { makeVisual, mtxBuild } from "./_harness";

const RED = "#ff0000";
const GREEN = "#00ff00";
const BLUE = "#0000ff";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mtxLegendDv(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dv: any = mtxBuild({
    levels: [
      { name: "Cat", role: "category" },
      { name: "Seg", role: "legend" }
    ],
    measures: [{ name: "Sales", role: "actual" }],
    children: [
      {
        value: "A",
        children: [
          {
            value: "X",
            cells: [30],
            objects: { legend: { itemColor: { solid: { color: GREEN } } } }
          },
          { value: "Y", cells: [70] }
        ]
      },
      {
        value: "B",
        children: [
          { value: "X", cells: [50] },
          { value: "Y", cells: [20] }
        ]
      }
    ]
  });
  dv.metadata.objects = {
    legend: {
      show: true,
      labelColor: { solid: { color: RED } },
      showTitle: true,
      titleText: "Segments",
      titleColor: { solid: { color: BLUE } }
    },
    grandTotal: { showGrandTotal: false }
  };
  return dv;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function run(v: any, dv: any): HTMLElement {
  v.update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
  const target = v.target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return target;
}

describe("legend colours persisted on a MATRIX dataview (revert repro)", () => {
  test("static labelColor / titleColor from metadata.objects render AND echo in the formatting model", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    const target = run(v, mtxLegendDv());
    const labelTexts = Array.from(target.querySelectorAll("text[data-legend-idx]"));
    expect(labelTexts.length).toBeGreaterThan(0);
    labelTexts.forEach((t) => expect(t.getAttribute("fill")).toBe(RED));
    expect(() => v.getFormattingModel()).not.toThrow();
    const fs = v.formattingSettings;
    expect(fs.legend.labelColor.value.value).toBe(RED);
    expect(fs.legend.titleColor.value.value).toBe(BLUE);
  });

  test("legacy per-NODE itemColor still READS (fallback) and echoes in the itemColor0 slot picker", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    const target = run(v, mtxLegendDv());
    const swatches = Array.from(target.querySelectorAll("rect[data-legend-idx]"));
    expect(swatches.length).toBe(2);
    expect(swatches[0].getAttribute("fill")).toBe(GREEN);
    expect(() => v.getFormattingModel()).not.toThrow();
    const fs = v.formattingSettings;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xGroup = fs.legend.groups.slice(1).find((g: any) => g.displayName === "X");
    expect(xGroup).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemColor = xGroup.slices.find((s: any) => s.name === "itemColor0");
    expect(itemColor).toBeTruthy();
    expect(itemColor.value.value).toBe(GREEN);
    expect(itemColor.selector).toBeUndefined();
  });
});

describe("legend colour METADATA SLOTS (1.1.71 fix — the reliable matrix path)", () => {
  const A_COLOR = "#abcdef";
  const B_COLOR = "#fedcba";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function slotDv(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv: any = mtxBuild({
      levels: [
        { name: "Cat", role: "category" },
        { name: "Seg", role: "legend" }
      ],
      measures: [{ name: "Sales", role: "actual" }],
      children: [
        { value: "P1", children: [{ value: "X", cells: [30] }, { value: "Y", cells: [70] }] },
        { value: "P2", children: [{ value: "X", cells: [50] }, { value: "Y", cells: [20] }] }
      ]
    });
    dv.metadata.objects = {
      grandTotal: { showGrandTotal: false },
      legend: {
        show: true,
        itemColor0: { solid: { color: A_COLOR } },
        itemColor1: { solid: { color: B_COLOR } }
      }
    };
    return dv;
  }

  test("slot colours drive the swatches AND round-trip into the itemColor{i} pickers", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    const target = run(v, slotDv());
    const swatches = Array.from(target.querySelectorAll("rect[data-legend-idx]"));
    expect(swatches[0].getAttribute("fill")).toBe(A_COLOR);
    expect(swatches[1].getAttribute("fill")).toBe(B_COLOR);
    v.getFormattingModel();
    const groups = v.formattingSettings.legend.groups.slice(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pick = (g: any, name: string): any => g.slices.find((s: any) => s.name === name);
    expect(pick(groups[0], "itemColor0").value.value).toBe(A_COLOR);
    expect(pick(groups[1], "itemColor1").value.value).toBe(B_COLOR);
  });

  test("slot colour wins over the theme default AND tints the stacked bar segments", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    const target = run(v, slotDv());
    const bar0 = target.querySelector('g.wf-bar[data-cat-idx="0"]');
    const fills = Array.from(bar0!.querySelectorAll("rect"))
      .filter((r) => !r.classList.contains("wf-focus-ring") && !r.closest("mask"))
      .map((r) => r.getAttribute("fill"));
    expect(fills).toEqual([A_COLOR, B_COLOR]);
  });
});
