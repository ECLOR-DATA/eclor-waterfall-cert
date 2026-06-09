import { Visual } from "../src/visual";
import { VisualFormattingSettingsModel } from "../src/settings";
import { makeMockHost, dvBuild } from "./_harness";

const HC_FG = "#ffff00";
const HC_BG = "#000000";
const HC_LINK = "#00ffff";
const PALETTE_COLOR = "#123456";
const THEME_GREEN = "#50be87";
const THEME_RED = "#dd3f3f";

function makeHcHost(isHighContrast: boolean) {
  return {
    ...makeMockHost(),
    colorPalette: {
      isHighContrast,
      foreground: { value: HC_FG },
      background: { value: HC_BG },
      hyperlink: { value: HC_LINK },
      getColor: () => ({ value: PALETTE_COLOR })
    }
  };
}

function makeHcVisual(isHighContrast = true): Visual {
  const target = document.createElement("div");
  document.body.appendChild(target);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = new Visual({ host: makeHcHost(isHighContrast), element: target } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).formattingSettings = new VisualFormattingSettingsModel();
  return v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function richDv(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dv = dvBuild({
    cats: [{ name: "Cat", values: ["A", "B", "C"] }],
    vals: [
      { name: "Sales", role: "actual", values: [100, -40, 30] },
      { name: "Var", role: "variance", values: [5, -10, 15] }
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  dv.metadata.objects = {
    connectors: { showConnectors: true },
    grandTotal: { showGrandTotal: false }
  };
  return dv;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function render(v: Visual, dv: any): HTMLElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  expect(target.querySelector("svg")).not.toBeNull();
  return target;
}

function svgHtml(target: HTMLElement): string {
  return (target.querySelector("svg") as Element).outerHTML;
}

describe("high-contrast rendering (audit TG-03)", () => {
  test("HC on — every bar rect is forced to hcForeground; no theme or palette fill survives", () => {
    const target = render(makeHcVisual(), richDv());
    const barRects = Array.from(
      target.querySelectorAll("g.wf-bar rect:not(.wf-focus-ring)")
    );
    expect(barRects.length).toBe(3);
    barRects.forEach((r) => expect(r.getAttribute("fill")).toBe(HC_FG));
    const html = svgHtml(target);
    expect(html).not.toContain(THEME_GREEN);
    expect(html).not.toContain(THEME_RED);
    expect(html).not.toContain(PALETTE_COLOR);
  });

  test("control: HC OFF on the same fixture DOES render the colours the HC assertions exclude", () => {
    const target = render(makeHcVisual(false), richDv());
    const html = svgHtml(target);
    expect(html).toContain(PALETTE_COLOR);
    expect(html).toContain(THEME_GREEN);
    expect(html).toContain(THEME_RED);
  });

  test("HC on — rail bars: positive → hcForeground, negative → hcHyperlink", () => {
    const target = render(makeHcVisual(), richDv());
    const railRects = Array.from(target.querySelectorAll("rect[data-cat-idx]"));
    expect(railRects.length).toBe(3);
    const fillFor = (idx: number) =>
      railRects
        .find((r) => r.getAttribute("data-cat-idx") === String(idx))
        ?.getAttribute("fill");
    expect(fillFor(0)).toBe(HC_FG);
    expect(fillFor(1)).toBe(HC_LINK);
    expect(fillFor(2)).toBe(HC_FG);
  });

  test("HC on — every <text> is foreground except the negative rail label (hyperlink)", () => {
    const target = render(makeHcVisual(), richDv());
    const texts = Array.from(target.querySelectorAll("svg text"));
    expect(texts.length).toBeGreaterThan(5);
    texts.forEach((t) => expect([HC_FG, HC_LINK]).toContain(t.getAttribute("fill")));
    const linkTexts = texts.filter((t) => t.getAttribute("fill") === HC_LINK);
    expect(linkTexts.length).toBe(1);
    expect(linkTexts[0].textContent || "").toContain("10");
  });

  test("HC on — every label background pill uses hcBackground", () => {
    const target = render(makeHcVisual(), richDv());
    const pills = Array.from(target.querySelectorAll('svg rect[pointer-events="none"]'));
    expect(pills.length).toBeGreaterThan(0);
    pills.forEach((r) => expect(r.getAttribute("fill")).toBe(HC_BG));
  });

  test("HC on — connectors, gridlines and the rail centre line all stroke hcForeground", () => {
    const target = render(makeHcVisual(), richDv());
    const lines = Array.from(target.querySelectorAll("svg line"));
    expect(lines.length).toBeGreaterThan(3);
    lines.forEach((l) => expect(l.getAttribute("stroke")).toBe(HC_FG));
  });

  test("focus rings stroke hcHyperlink under HC, PBI blue otherwise", () => {
    const tHc = render(makeHcVisual(), richDv());
    const ringsHc = Array.from(tHc.querySelectorAll("rect.wf-focus-ring"));
    expect(ringsHc.length).toBe(3);
    ringsHc.forEach((r) => {
      expect(r.getAttribute("stroke")).toBe(HC_LINK);
      expect(r.getAttribute("fill")).toBe("none");
    });
    const tStd = render(makeHcVisual(false), richDv());
    const ringStd = tStd.querySelector("rect.wf-focus-ring");
    expect(ringStd?.getAttribute("stroke")).toBe("#0078d4");
  });

  test("HC on — variation arc lines, arrows and label override even a user-persisted arc colour", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B"],
          objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
        }
      ],
      vals: [{ name: "Sales", role: "actual", values: [100, 200] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = {
      variationArc: { show: true, lineColor: { solid: { color: "#ff00ff" } } },
      grandTotal: { showGrandTotal: false }
    };
    const target = render(makeHcVisual(), dv);
    const html = svgHtml(target);
    expect(html).not.toContain("#ff00ff");
    const arrows = Array.from(target.querySelectorAll("svg path"));
    expect(arrows.length).toBe(2);
    arrows.forEach((p) => expect(p.getAttribute("fill")).toBe(HC_FG));
    const arcText = Array.from(target.querySelectorAll("svg text")).find((t) =>
      (t.textContent || "").includes("|")
    );
    expect(arcText).toBeTruthy();
    expect(arcText?.getAttribute("fill")).toBe(HC_FG);
  });

  test("HC on — stacked segments AND legend swatches/labels are forced to foreground", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        { name: "Seg", values: ["X", "Y", "X", "Y"], isLegend: true }
      ],
      vals: [{ name: "Sales", role: "actual", values: [10, 20, 30, 40] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const target = render(makeHcVisual(), dv);
    const segRects = Array.from(
      target.querySelectorAll("g.wf-bar rect:not(.wf-focus-ring)")
    );
    expect(segRects.length).toBeGreaterThanOrEqual(4);
    segRects.forEach((r) => expect(r.getAttribute("fill")).toBe(HC_FG));
    const swatches = Array.from(target.querySelectorAll("rect[data-legend-idx]"));
    expect(swatches.length).toBe(2);
    swatches.forEach((r) => expect(r.getAttribute("fill")).toBe(HC_FG));
    const legendTexts = Array.from(target.querySelectorAll("text[data-legend-idx]"));
    expect(legendTexts.length).toBe(2);
    legendTexts.forEach((t) => expect(t.getAttribute("fill")).toBe(HC_FG));
  });
});
