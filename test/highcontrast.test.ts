/**
 * High-contrast rendering (audit TG-03) — every isHighContrast branch in
 * buildSVG must swap theme / user colours for the host palette's
 * foreground / background / hyperlink. AppSource cert checks HC support;
 * before this suite the only HC coverage was the pure getBarColor helper
 * (tooltip.test.ts) — none of the ~30 render-side branches were verified.
 */
import { Visual } from "../src/visual";
import { VisualFormattingSettingsModel } from "../src/settings";
import { makeMockHost, dvBuild } from "./_harness";

const HC_FG = "#ffff00";
const HC_BG = "#000000";
const HC_LINK = "#00ffff";
/** Fixed colour the mock palette hands out for EVERY getColor key — the
 *  themed pillar default AND legend series colours resolve to this. */
const PALETTE_COLOR = "#123456";
// Sentiment fallbacks (src/visual.ts FALLBACK_POSITIVE / FALLBACK_NEGATIVE):
// with no positive/negative indicators on the palette these become the
// bridge default (themePositive) and the negative rail colour (themeNegative).
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

/** Pillar (A) + bridge (B) + pillar (C) — isPillar defaults to first+last —
 *  plus one variance rail with a negative entry and connectors on. Hits
 *  bars, bar labels, rails, rail labels, connectors and gridlines. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function richDv(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dv = dvBuild({
    // fx OFF (harness default is ON — see test/_harness.ts). Justification:
    // this suite proves the HC branch overrides the THEME/palette defaults
    // (`getColor("pillar")`, themePositive, themeNegative), and its control
    // test asserts those exact defaults render when HC is off. A per-row rule
    // fill replaces them, so the control would become vacuous. HC × fx is
    // covered by test/fx-orientation.test.ts and by pillar-style.test.ts's
    // high-contrast case.
    fx: false,
    cats: [{ name: "Cat", values: ["A", "B", "C"] }],
    vals: [
      { name: "Sales", role: "actual", values: [100, -40, 30] },
      { name: "Var", role: "variance", values: [5, -10, 15] }
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  // GT off — the suite counts exactly 3 bars (1.1.62: GT appends by default).
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
    expect(barRects.length).toBe(3); // pillar A + bridge B + pillar C
    barRects.forEach((r) => expect(r.getAttribute("fill")).toBe(HC_FG));
    const html = svgHtml(target);
    expect(html).not.toContain(THEME_GREEN); // bridge default beaten
    expect(html).not.toContain(THEME_RED); // negative rail default beaten
    expect(html).not.toContain(PALETTE_COLOR); // getColor("pillar") beaten
  });

  test("control: HC OFF on the same fixture DOES render the colours the HC assertions exclude", () => {
    // Proves the negative assertions above are not vacuous — the fixture
    // genuinely exercises every colour site the HC branch must override.
    const target = render(makeHcVisual(false), richDv());
    const html = svgHtml(target);
    expect(html).toContain(PALETTE_COLOR); // pillar default = getColor("pillar")
    expect(html).toContain(THEME_GREEN); // bridge default = themePositive
    expect(html).toContain(THEME_RED); // negative rail bar = themeNegative
  });

  test("HC on — rail bars: positive → hcForeground, negative → hcHyperlink", () => {
    const target = render(makeHcVisual(), richDv());
    // Rail bar rects carry data-cat-idx directly (bar rects only via their <g>).
    const railRects = Array.from(target.querySelectorAll("rect[data-cat-idx]"));
    expect(railRects.length).toBe(3);
    const fillFor = (idx: number) =>
      railRects
        .find((r) => r.getAttribute("data-cat-idx") === String(idx))
        ?.getAttribute("fill");
    expect(fillFor(0)).toBe(HC_FG); // Var = +5
    expect(fillFor(1)).toBe(HC_LINK); // Var = -10
    expect(fillFor(2)).toBe(HC_FG); // Var = +15
  });

  test("HC on — every <text> is foreground except the negative rail label (hyperlink)", () => {
    const target = render(makeHcVisual(), richDv());
    const texts = Array.from(target.querySelectorAll("svg text"));
    expect(texts.length).toBeGreaterThan(5); // axes + bar labels + rail name/labels
    texts.forEach((t) => expect([HC_FG, HC_LINK]).toContain(t.getAttribute("fill")));
    const linkTexts = texts.filter((t) => t.getAttribute("fill") === HC_LINK);
    expect(linkTexts.length).toBe(1);
    expect(linkTexts[0].textContent || "").toContain("10"); // the -10 rail label
  });

  test("HC on — every label background pill uses hcBackground", () => {
    const target = render(makeHcVisual(), richDv());
    // svgLabelBg pills are the only pointer-events="none" rects. Under HC the
    // bg colour is forced to hcBackground (non-empty), so the pills that stay
    // hidden by default in standard mode (empty colour short-circuit) DO
    // render — readable labels on a foreground-coloured chart.
    const pills = Array.from(target.querySelectorAll('svg rect[pointer-events="none"]'));
    expect(pills.length).toBeGreaterThan(0);
    pills.forEach((r) => expect(r.getAttribute("fill")).toBe(HC_BG));
  });

  test("HC on — connectors, gridlines and the rail centre line all stroke hcForeground", () => {
    const target = render(makeHcVisual(), richDv());
    const lines = Array.from(target.querySelectorAll("svg line"));
    // 1 rail centre line + 6 gridlines + 2 connectors in this fixture.
    expect(lines.length).toBeGreaterThan(3);
    lines.forEach((l) => expect(l.getAttribute("stroke")).toBe(HC_FG));
  });

  test("focus rings stroke hcHyperlink under HC, PBI blue otherwise", () => {
    const tHc = render(makeHcVisual(), richDv());
    const ringsHc = Array.from(tHc.querySelectorAll("rect.wf-focus-ring"));
    expect(ringsHc.length).toBe(3); // one per bar
    ringsHc.forEach((r) => {
      expect(r.getAttribute("stroke")).toBe(HC_LINK);
      expect(r.getAttribute("fill")).toBe("none");
    });
    const tStd = render(makeHcVisual(false), richDv());
    const ringStd = tStd.querySelector("rect.wf-focus-ring");
    expect(ringStd?.getAttribute("stroke")).toBe("#0078d4"); // FOCUS_RING_COLOR
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
      // GT off — the test counts the 2 arrow heads of the single A→B arc.
      grandTotal: { showGrandTotal: false }
    };
    const target = render(makeHcVisual(), dv);
    const html = svgHtml(target);
    expect(html).not.toContain("#ff00ff"); // persisted arc colour beaten by HC
    // Arrow heads are the only <path> elements — arrowEnds defaults to "both".
    const arrows = Array.from(target.querySelectorAll("svg path"));
    expect(arrows.length).toBe(2);
    arrows.forEach((p) => expect(p.getAttribute("fill")).toBe(HC_FG));
    // Arc label (auto-both default → contains the " | " separator).
    const arcText = Array.from(target.querySelectorAll("svg text")).find((t) =>
      (t.textContent || "").includes("|")
    );
    expect(arcText).toBeTruthy();
    expect(arcText?.getAttribute("fill")).toBe(HC_FG);
  });

  test("HC on — stacked segments AND legend swatches/labels are forced to foreground", () => {
    // 1.1.59.0 closes the audit TG-03 gap: the legend block was the one
    // render region with NO HC override (swatch fill = lv.color, label /
    // title colours read without an isHighContrast ternary). Cert requires
    // every user-picked colour to be overridden under forced-color themes.
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
    // In-bar legend segments: HC forces foreground (drawSegmentStack).
    const segRects = Array.from(
      target.querySelectorAll("g.wf-bar rect:not(.wf-focus-ring)")
    );
    expect(segRects.length).toBeGreaterThanOrEqual(4); // 2 pillars × 2 segments
    segRects.forEach((r) => expect(r.getAttribute("fill")).toBe(HC_FG));
    // Legend swatches: forced to hcForeground, per-series colours beaten.
    const swatches = Array.from(target.querySelectorAll("rect[data-legend-idx]"));
    expect(swatches.length).toBe(2); // X + Y
    swatches.forEach((r) => expect(r.getAttribute("fill")).toBe(HC_FG));
    // Legend item labels: forced to hcForeground too.
    const legendTexts = Array.from(target.querySelectorAll("text[data-legend-idx]"));
    expect(legendTexts.length).toBe(2);
    legendTexts.forEach((t) => expect(t.getAttribute("fill")).toBe(HC_FG));
  });
});
