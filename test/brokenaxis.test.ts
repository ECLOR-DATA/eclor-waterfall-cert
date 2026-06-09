
import { makeVisual, makeMockHost, dvBuild } from "./_harness";
import { Visual } from "../src/visual";
import { VisualFormattingSettingsModel } from "../src/settings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buildDv = (values: number[], yAxis: Record<string, unknown>, mode: string): any => {
  const dv = dvBuild({
    cats: [
      {
        name: "Cat",
        values: ["A", "B"],
        objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
      }
    ],
    vals: [{ name: "Sales", role: "actual", values }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  dv.metadata.objects = { general: { mode }, yAxis };
  return dv;
};

const render = (
  values: number[],
  yAxis: Record<string, unknown>,
  mode = "comparison"
): HTMLElement => {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({
    dataViews: [buildDv(values, yAxis, mode)],
    viewport: { width: 640, height: 420 },
    type: 2
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return target;
};

const masks = (target: HTMLElement) =>
  Array.from(target.querySelectorAll('mask[id^="wf-break-"]'));

const barLines = (target: HTMLElement) =>
  Array.from(target.querySelectorAll("g.wf-bar line"));

const barBodyRects = (target: HTMLElement) =>
  Array.from(target.querySelectorAll("g.wf-bar rect")).filter(
    (r) => !r.classList.contains("wf-focus-ring") && !r.closest("mask")
  );

const valueLabels = (target: HTMLElement) =>
  Array.from(target.querySelectorAll("g.wf-clickable[data-cat-idx] text")).map(
    (t) => t.textContent || ""
  );

describe("broken-axis indicator: mask + diagonals gate (TG-04)", () => {
  test("comparison + all-positive pillars + floor offset → one wf-break mask per pillar, cut polygon inside, bar drawn through the mask", () => {
    const target = render([150, 200], { yMinOffset: 50 });
    const ms = masks(target);
    expect(ms.map((m) => m.getAttribute("id")).sort()).toEqual(["wf-break-0", "wf-break-1"]);
    for (const m of ms) {
      expect(m.querySelector('rect[fill="white"]')).toBeTruthy();
      expect(m.querySelector('polygon[fill="black"]')).toBeTruthy();
    }
    const bars = Array.from(target.querySelectorAll("g.wf-bar"));
    expect(bars.length).toBe(2);
    bars.forEach((bar, i) => {
      const wrapped = bar.querySelector("g[mask]");
      expect(wrapped?.getAttribute("mask")).toBe(`url(#wf-break-${i})`);
      expect(wrapped?.querySelector("rect")).toBeTruthy();
    });
  });

  test("diagonals: two neutral-grey 1.5px lines per pillar, framing the cutout", () => {
    const target = render([150, 200], { yMinOffset: 50 });
    const lines = barLines(target);
    expect(lines.length).toBe(4);
    for (const l of lines) {
      expect(l.getAttribute("stroke")).toBe("#666666");
      expect(l.getAttribute("stroke-width")).toBe("1.5");
    }
  });

  test("offset 0 → no masks, no diagonals (yMinOffsetPct gate)", () => {
    const target = render([150, 200], { yMinOffset: 0 });
    expect(masks(target).length).toBe(0);
    expect(barLines(target).length).toBe(0);
  });

  test("showBrokenAxis off → no masks even with the offset displacing yMin", () => {
    const target = render([150, 200], { yMinOffset: 50, showBrokenAxis: false });
    expect(masks(target).length).toBe(0);
    expect(barLines(target).length).toBe(0);
  });

  test("cumulative mode → no masks (indicator gates on userMode === comparison)", () => {
    const target = render([150, 200], { yMinOffset: 50 }, "cumulative");
    expect(masks(target).length).toBe(0);
    expect(barLines(target).length).toBe(0);
  });

  test("mixed-sign pillars → no masks (offset auto-disabled, offsetEffective false)", () => {
    const target = render([150, -200], { yMinOffset: 50 });
    expect(masks(target).length).toBe(0);
    expect(barLines(target).length).toBe(0);
  });

  test("stripe position depends on sign: all-positive → near the floor, all-negative → near the ceiling", () => {
    const half = (target: HTMLElement): number[] => {
      const bars = Array.from(target.querySelectorAll("g.wf-bar"));
      return bars.map((bar) => {
        const rect = Array.from(bar.querySelectorAll("rect")).find(
          (r) => !r.classList.contains("wf-focus-ring") && !r.closest("mask")
        ) as Element;
        const top = Number(rect.getAttribute("y"));
        const h = Number(rect.getAttribute("height"));
        const ys = Array.from(bar.querySelectorAll("line")).map(
          (l) => (Number(l.getAttribute("y1")) + Number(l.getAttribute("y2"))) / 2
        );
        const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
        return (mean - top) / h;
      });
    };
    const positive = half(render([150, 200], { yMinOffset: 50 }));
    const negative = half(render([-150, -200], { yMinOffset: 50 }));
    expect(positive.length).toBe(2);
    expect(negative.length).toBe(2);
    for (const frac of positive) {
      expect(frac).toBeGreaterThan(0.5);
    }
    for (const frac of negative) {
      expect(frac).toBeLessThan(0.5);
    }
  });

  test("high contrast: diagonals use the HC foreground colour instead of #666666", () => {
    const targetEl = document.createElement("div");
    document.body.appendChild(targetEl);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const host = makeMockHost() as any;
    host.colorPalette = {
      ...host.colorPalette,
      isHighContrast: true,
      foreground: { value: "#ffff00" },
      background: { value: "#000000" },
      hyperlink: { value: "#00ffff" }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = new Visual({ host, element: targetEl } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings = new VisualFormattingSettingsModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({
      dataViews: [buildDv([150, 200], { yMinOffset: 50 }, "comparison")],
      viewport: { width: 640, height: 420 },
      type: 2
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = (v as any).target as HTMLElement;
    expect(target.querySelector("parsererror")).toBeNull();
    const lines = barLines(target);
    expect(lines.length).toBe(4);
    for (const l of lines) expect(l.getAttribute("stroke")).toBe("#ffff00");
  });
});

describe("yScaleClamped: pillars anchored to the chart floor under the offset (TG-04)", () => {
  test("with the offset active both pillar bottoms sit exactly on the chart floor, heights re-proportioned to the narrowed range", () => {
    const target = render([150, 200], { yMinOffset: 50 });
    const rects = barBodyRects(target);
    expect(rects.length).toBe(2);
    const bottoms = rects.map(
      (r) => Number(r.getAttribute("y")) + Number(r.getAttribute("height"))
    );
    expect(bottoms[0]).toBeCloseTo(bottoms[1], 0);
    const gridYs = Array.from(target.querySelectorAll('line[stroke="#d4d4d4"]')).map(
      (l) => Number(l.getAttribute("y1"))
    );
    expect(gridYs.length).toBeGreaterThan(0);
    const floor = Math.max(...gridYs);
    expect(bottoms[0]).toBeCloseTo(floor, 0);
    const hA = Number(rects[0].getAttribute("height"));
    const hB = Number(rects[1].getAttribute("height"));
    expect(hA / hB).toBeCloseTo(0.5, 2);
  });

  test("pillar value labels are NOT rescaled by the truncation — same texts with and without the offset", () => {
    const withOffset = valueLabels(render([150, 200], { yMinOffset: 50 }));
    const without = valueLabels(render([150, 200], { yMinOffset: 0 }));
    expect(withOffset).toEqual(without);
    expect(withOffset.some((t) => /(^|\s)150(\b|$)/.test(t))).toBe(true);
    expect(withOffset.some((t) => /(^|\s)200(\b|$)/.test(t))).toBe(true);
  });
});
