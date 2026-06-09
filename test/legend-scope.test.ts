
import { makeVisual, dvBuild } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function legendDv(applyTo?: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dv: any = dvBuild({
    cats: [
      { name: "Cat", values: ["A", "A", "B", "B", "C", "C"] },
      { name: "Seg", values: ["X", "Y", "X", "Y", "X", "Y"], isLegend: true }
    ],
    vals: [{ name: "Sales", role: "actual", values: [10, 20, 5, 5, 30, 10] }]
  });
  dv.metadata.objects = {
    grandTotal: { showGrandTotal: false },
    ...(applyTo ? { legend: { applyTo } } : {})
  };
  return dv;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function render(dv: any): { target: HTMLElement; v: any } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v: any = makeVisual();
  v.update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
  const target = v.target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return { target, v };
}

function bodyRects(target: HTMLElement, catIdx: number): Element[] {
  const bar = target.querySelector(`g.wf-bar[data-cat-idx="${catIdx}"]`);
  expect(bar).toBeTruthy();
  return Array.from(bar!.querySelectorAll("rect")).filter(
    (r) => !r.classList.contains("wf-focus-ring") && !r.closest("mask")
  );
}

describe("legend applyTo scope — stacked vs flat per bar type", () => {
  test("default (both): pillars AND bridges render stacked segments", () => {
    const { target } = render(legendDv());
    expect(bodyRects(target, 0).length).toBe(2);
    expect(bodyRects(target, 1).length).toBe(2);
    expect(bodyRects(target, 2).length).toBe(2);
  });

  test("pillars only: bridges go flat (single rect), pillars stay stacked", () => {
    const { target } = render(legendDv("pillars"));
    expect(bodyRects(target, 0).length).toBe(2);
    expect(bodyRects(target, 1).length).toBe(1);
    expect(bodyRects(target, 2).length).toBe(2);
  });

  test("bridges only: pillars go flat, bridges stay stacked", () => {
    const { target } = render(legendDv("bridges"));
    expect(bodyRects(target, 0).length).toBe(1);
    expect(bodyRects(target, 1).length).toBe(2);
    expect(bodyRects(target, 2).length).toBe(1);
  });
});

describe("legend applyTo scope — pane fallback picker visibility", () => {
  test("scope=pillars keeps the Bridges colour picker visible (it's the bridge fallback)", () => {
    const { v } = render(legendDv("pillars"));
    v.getFormattingModel();
    expect(v.formattingSettings.bridges.colorBridge.visible).toBe(true);
    expect(v.formattingSettings.pillars.pillarColor.visible).toBe(false);
  });

  test("scope=bridges keeps the Pillars colour picker visible", () => {
    const { v } = render(legendDv("bridges"));
    v.getFormattingModel();
    expect(v.formattingSettings.pillars.pillarColor.visible).toBe(true);
    expect(v.formattingSettings.bridges.colorBridge.visible).toBe(false);
  });

  test("scope=both (default) hides both global colour pickers as before", () => {
    const { v } = render(legendDv());
    v.getFormattingModel();
    expect(v.formattingSettings.pillars.pillarColor.visible).toBe(false);
    expect(v.formattingSettings.bridges.colorBridge.visible).toBe(false);
  });
});
