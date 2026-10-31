
import { makeVisual, makeMockHost, dvBuild } from "./_harness";
import { Visual } from "../src/visual";
import { VisualFormattingSettingsModel } from "../src/settings";
import {
  ArcTextOptions,
  arcBlockHeight,
  arcLabelLines,
  arcLabelText,
  arcLineBaselines,
  bubbleShapeSvg,
  bubbleSize,
  isPlainArcLabel,
  readBubbleShape
} from "../src/arcBubble";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const OPTS: ArcTextOptions = {
  layout: "inline",
  order: "value",
  pctParens: false,
  prefix: "",
  caption: "",
  captionPosition: "above",
  fontSize: 12,
  pctFontSize: 12,
  pctItalic: false,
  captionFontSize: 12
};

const texts = (lines: ReturnType<typeof arcLabelLines>): string[] =>
  lines.map((l) => l.segments.map((s) => s.text).join(""));

describe("arcLabelLines — the label plan", () => {
  test("defaults: ONE plain line « value | pct » — the pre-1.8 string, legacy draw path", () => {
    const lines = arcLabelLines({ value: "+100", pct: "+12.5%" }, OPTS);
    expect(texts(lines)).toEqual(["+100 | +12.5%"]);
    expect(isPlainArcLabel(lines, 12)).toBe(true);
    expect(arcLabelText(lines)).toBe("+100 | +12.5%");
  });

  test("value only / percentage only / measure text stay plain single lines", () => {
    expect(texts(arcLabelLines({ value: "+100" }, OPTS))).toEqual(["+100"]);
    expect(texts(arcLabelLines({ pct: "+12.5%" }, OPTS))).toEqual(["+12.5%"]);
    const m = arcLabelLines({ text: "On track" }, OPTS);
    expect(texts(m)).toEqual(["On track"]);
    expect(isPlainArcLabel(m, 12)).toBe(true);
  });

  test("an empty measure text plans no line (legacy empty label)", () => {
    expect(arcLabelLines({ text: "" }, OPTS)).toEqual([]);
  });

  test("two lines: value then percentage; « Percentage first » swaps them", () => {
    expect(texts(arcLabelLines({ value: "+100", pct: "+12.5%" }, { ...OPTS, layout: "stack" }))).toEqual([
      "+100",
      "+12.5%"
    ]);
    expect(
      texts(arcLabelLines({ value: "+100", pct: "+12.5%" }, { ...OPTS, layout: "stack", order: "pct" }))
    ).toEqual(["+12.5%", "+100"]);
  });

  test("brackets: « +100 (+12.5%) » inline, « (+12.5%) » stacked; order respected", () => {
    const both = { value: "+100", pct: "+12.5%" };
    expect(texts(arcLabelLines(both, { ...OPTS, pctParens: true }))).toEqual(["+100 (+12.5%)"]);
    expect(texts(arcLabelLines(both, { ...OPTS, pctParens: true, order: "pct" }))).toEqual(["(+12.5%) +100"]);
    expect(texts(arcLabelLines(both, { ...OPTS, pctParens: true, layout: "stack" }))).toEqual([
      "+100",
      "(+12.5%)"
    ]);
    expect(texts(arcLabelLines({ pct: "+12.5%" }, { ...OPTS, pctParens: true }))).toEqual(["+12.5%"]);
  });

  test("percentage size / italics become their own segment; the line takes the larger size", () => {
    const lines = arcLabelLines({ value: "+100", pct: "+12.5%" }, { ...OPTS, pctFontSize: 9, pctItalic: true });
    expect(lines).toHaveLength(1);
    expect(lines[0].segments).toEqual([
      { text: "+100 | ", size: 12, italic: false },
      { text: "+12.5%", size: 9, italic: true }
    ]);
    expect(lines[0].size).toBe(12);
    expect(isPlainArcLabel(lines, 12)).toBe(false);
  });

  test("prefix goes before the first line that is not the caption", () => {
    const lines = arcLabelLines(
      { value: "+100", pct: "+12.5%" },
      { ...OPTS, layout: "stack", prefix: "Δ ", caption: "vs N-1" }
    );
    expect(texts(lines)).toEqual(["vs N-1", "Δ +100", "+12.5%"]);
    expect(lines[0].caption).toBe(true);
  });

  test("caption above (default) or below, at its own size; blank caption = none", () => {
    const below = arcLabelLines({ value: "+100" }, { ...OPTS, caption: "vs N-1", captionPosition: "below", captionFontSize: 9 });
    expect(texts(below)).toEqual(["+100", "vs N-1"]);
    expect(below[1].size).toBe(9);
    expect(arcLabelLines({ value: "+100" }, { ...OPTS, caption: "   " })).toHaveLength(1);
  });

  test("block height = Σ (size + 2); baselines centred on 0 and increasing", () => {
    const lines = arcLabelLines({ value: "+100", pct: "+12.5%" }, { ...OPTS, layout: "stack", pctFontSize: 8 });
    expect(arcBlockHeight(lines)).toBe(12 + 2 + 8 + 2);
    const b = arcLineBaselines(lines);
    expect(b).toHaveLength(2);
    expect(b[0]).toBeLessThan(0);
    expect(b[1]).toBeGreaterThan(b[0]);
  });
});

describe("bubble geometry + SVG", () => {
  test("ellipse / pill / rect = text + padding; circle / square take the larger side", () => {
    const g = { padX: 8, padY: 5 };
    expect(bubbleSize(40, 14, { ...g, shape: "ellipse" })).toEqual({ w: 56, h: 24 });
    expect(bubbleSize(40, 14, { ...g, shape: "pill" })).toEqual({ w: 56, h: 24 });
    expect(bubbleSize(40, 14, { ...g, shape: "circle" })).toEqual({ w: 56, h: 56 });
    expect(bubbleSize(10, 40, { ...g, shape: "square" })).toEqual({ w: 50, h: 50 });
  });

  test("ellipse / circle grow until the text block's corners are inside (stacked label)", () => {
    const g = { padX: 8, padY: 5 };
    const e = bubbleSize(40, 28, { ...g, shape: "ellipse" });
    expect(e.w).toBeGreaterThan(56);
    expect((20 / (e.w / 2)) ** 2 + (14 / (e.h / 2)) ** 2).toBeLessThanOrEqual(1 + 1e-9);
    const c = bubbleSize(30, 42, { ...g, shape: "circle" });
    expect(c.w / 2).toBeGreaterThanOrEqual(Math.hypot(15, 21));
  });

  test("unknown persisted shape → ellipse", () => {
    expect(readBubbleShape("hexagon")).toBe("ellipse");
    expect(readBubbleShape("square")).toBe("square");
  });

  const paint = { fill: "#FFFFFF", fillOpacity: 1, stroke: "#000000", strokeWidth: 1, dash: "solid" as const };
  test("one element per shape; pill = fully rounded rect; corner radius clamps to the half side", () => {
    expect(bubbleShapeSvg(50, 20, { w: 40, h: 20 }, "ellipse", 0, paint)).toMatch(/^<ellipse class="wf-arc-bubble" cx="50.0" cy="20.0" rx="20.0" ry="10.0"/);
    expect(bubbleShapeSvg(50, 20, { w: 30, h: 30 }, "circle", 0, paint)).toMatch(/^<circle [^>]*r="15.0"/);
    expect(bubbleShapeSvg(50, 20, { w: 40, h: 20 }, "pill", 0, paint)).toContain('rx="10.0"');
    expect(bubbleShapeSvg(50, 20, { w: 40, h: 20 }, "rect", 0, paint)).not.toContain(" rx=");
    expect(bubbleShapeSvg(50, 20, { w: 40, h: 20 }, "rect", 99, paint)).toContain('rx="10.0"');
  });

  test("paint: transparency, no border, dashes, dots, shadow reference", () => {
    expect(bubbleShapeSvg(0, 0, { w: 10, h: 10 }, "rect", 0, { ...paint, fillOpacity: 0.4 })).toContain('fill-opacity="0.40"');
    const none = bubbleShapeSvg(0, 0, { w: 10, h: 10 }, "rect", 0, { ...paint, stroke: "none" });
    expect(none).toContain('stroke="none"');
    expect(none).not.toContain("stroke-width");
    expect(bubbleShapeSvg(0, 0, { w: 10, h: 10 }, "rect", 0, { ...paint, dash: "dash" })).toContain('stroke-dasharray="5.0 3.0"');
    expect(bubbleShapeSvg(0, 0, { w: 10, h: 10 }, "rect", 0, { ...paint, dash: "dot" })).toContain('stroke-linecap="round"');
    expect(bubbleShapeSvg(0, 0, { w: 10, h: 10 }, "rect", 0, { ...paint, shadowId: "s1" })).toContain('filter="url(#s1)"');
  });
});


const LINE = "#123456";

function arcDv(arc: Record<string, unknown>, general: Record<string, unknown> = {}): Any {
  const dv: Any = dvBuild({
    cats: [
      {
        name: "Cat",
        values: ["A", "B", "C"],
        objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
      }
    ],
    vals: [{ name: "Sales", role: "actual", values: [100, 200, 150] }]
  });
  dv.metadata.objects = {
    general,
    grandTotal: { showGrandTotal: false },
    variationArc: { show: true, lineColor: { solid: { color: LINE } }, ...arc }
  };
  return dv;
}

function makeHcVisual(): Any {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const host = {
    ...makeMockHost(),
    colorPalette: {
      isHighContrast: true,
      foreground: { value: "#ffff00" },
      background: { value: "#000000" },
      hyperlink: { value: "#00ffff" },
      getColor: () => ({ value: "#123456" })
    }
  };
  const v: Any = new Visual({ host, element: target } as Any);
  v.formattingSettings = new VisualFormattingSettingsModel();
  return v;
}

function render(dv: Any, opts: { highContrast?: boolean } = {}): { target: HTMLElement; v: Any } {
  const v: Any = opts.highContrast ? makeHcVisual() : makeVisual();
  v.update({ dataViews: [dv], viewport: { width: 700, height: 440 }, type: 2 });
  const target = v.target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return { target, v };
}

const bubbles = (t: HTMLElement): Element[] => Array.from(t.querySelectorAll(".wf-arc-bubble"));

describe("render — bubble on the line (horizontal)", () => {
  test("default style draws no bubble and keeps the single-line text label", () => {
    const { target } = render(arcDv({}));
    expect(bubbles(target)).toHaveLength(0);
    const all = Array.from(target.querySelectorAll("text")).map((t) => t.textContent);
    expect(all).toContain("+100 | +100.0%");
  });

  test("bubble style: one ellipse per arc, centred ON the bracket's horizontal line", () => {
    const { target } = render(arcDv({ labelStyle: "bubble" }));
    const b = bubbles(target);
    expect(b).toHaveLength(2);
    expect(b[0].tagName.toLowerCase()).toBe("ellipse");
    const tops = Array.from(target.querySelectorAll(`line[stroke="${LINE}"]`)).filter(
      (l) => l.getAttribute("y1") === l.getAttribute("y2")
    );
    expect(tops.length).toBeGreaterThanOrEqual(1);
    const yLine = Number(tops[0].getAttribute("y1"));
    expect(Number(b[0].getAttribute("cy"))).toBeCloseTo(yLine, 0);
    for (const e of b) {
      expect(Number(e.getAttribute("cy")) - Number(e.getAttribute("ry"))).toBeGreaterThanOrEqual(0);
    }
  });

  test("text inside the bubble: one <tspan> per line, value then percentage on two lines", () => {
    const { target } = render(arcDv({ labelStyle: "bubble", labelLayout: "stack" }));
    const b = bubbles(target)[0];
    const txt = b.nextElementSibling as Element;
    expect(txt.tagName.toLowerCase()).toBe("text");
    const lines = Array.from(txt.children).map((c) => c.textContent);
    expect(lines).toEqual(["+100", "+100.0%"]);
  });

  test("fill + border by sign follow each arc's own variation", () => {
    const { target } = render(
      arcDv({
        labelStyle: "bubble",
        bubbleFillMode: "sign",
        bubblePosFillColor: { solid: { color: "#00AA00" } },
        bubbleNegFillColor: { solid: { color: "#AA0000" } },
        bubbleBorderMode: "sign",
        bubblePosBorderColor: { solid: { color: "#005500" } },
        bubbleNegBorderColor: { solid: { color: "#550000" } }
      })
    );
    const [rise, fall] = bubbles(target);
    expect(rise.getAttribute("fill")).toBe("#00AA00");
    expect(rise.getAttribute("stroke")).toBe("#005500");
    expect(fall.getAttribute("fill")).toBe("#AA0000");
    expect(fall.getAttribute("stroke")).toBe("#550000");
  });

  test("default border = the arc's line colour, default fill = white; none / transparency honoured", () => {
    const def = bubbles(render(arcDv({ labelStyle: "bubble" })).target)[0];
    expect(def.getAttribute("stroke")).toBe(LINE);
    expect(def.getAttribute("fill")).toBe("#FFFFFF");
    const bare = bubbles(
      render(arcDv({ labelStyle: "bubble", bubbleBorderMode: "none", bubbleFillTransparency: 60 })).target
    )[0];
    expect(bare.getAttribute("stroke")).toBe("none");
    expect(bare.getAttribute("fill-opacity")).toBe("0.40");
  });

  test("shapes: rect with corner radius, square is square", () => {
    const rect = bubbles(render(arcDv({ labelStyle: "bubble", bubbleShape: "rect", bubbleCornerRadius: 4 })).target)[0];
    expect(rect.tagName.toLowerCase()).toBe("rect");
    expect(rect.getAttribute("rx")).toBe("4.0");
    const sq = bubbles(render(arcDv({ labelStyle: "bubble", bubbleShape: "square" })).target)[0];
    expect(sq.getAttribute("width")).toBe(sq.getAttribute("height"));
  });

  test("shadow: the filter is defined ONCE and every bubble references it", () => {
    const { target } = render(arcDv({ labelStyle: "bubble", bubbleShadow: true }));
    expect(target.querySelectorAll("filter#wf-arc-shadow")).toHaveLength(1);
    for (const b of bubbles(target)) expect(b.getAttribute("filter")).toBe("url(#wf-arc-shadow)");
  });

  test("label colour by sign (text style too) — rising green, falling red", () => {
    const { target } = render(
      arcDv({
        labelColorBySign: true,
        labelPosColor: { solid: { color: "#00AA00" } },
        labelNegColor: { solid: { color: "#AA0000" } }
      })
    );
    const label = (s: string) => Array.from(target.querySelectorAll("text")).find((t) => t.textContent === s);
    expect(label("+100 | +100.0%")?.getAttribute("fill")).toBe("#00AA00");
    expect(label("-50 | -25.0%")?.getAttribute("fill")).toBe("#AA0000");
  });

  test("high contrast wins over every bubble paint", () => {
    const { target } = render(arcDv({ labelStyle: "bubble", bubbleFillMode: "sign", bubbleBorderMode: "sign" }), {
      highContrast: true
    });
    for (const b of bubbles(target)) {
      expect(b.getAttribute("fill")).toBe("#000000");
      expect(b.getAttribute("stroke")).toBe("#ffff00");
    }
  });

  test("position along the arc: 0 puts the label over the departure pillar", () => {
    const mid = bubbles(render(arcDv({ labelStyle: "bubble" })).target)[0];
    const start = bubbles(render(arcDv({ labelStyle: "bubble", labelAlong: 0 })).target)[0];
    expect(Number(start.getAttribute("cx"))).toBeLessThan(Number(mid.getAttribute("cx")));
  });
});

describe("render — two-line text label (text style)", () => {
  test("stacked value / percentage: two <tspan> lines above the line, no bubble", () => {
    const { target } = render(arcDv({ labelLayout: "stack", caption: "vs N-1" }));
    expect(bubbles(target)).toHaveLength(0);
    const multi = Array.from(target.querySelectorAll("text")).find((t) => t.children.length === 3);
    expect(multi).toBeTruthy();
    expect(Array.from(multi!.children).map((c) => c.textContent)).toEqual(["vs N-1", "+100", "+100.0%"]);
  });
});

describe("render — vertical orientation", () => {
  test("bubble centred on the bracket's vertical line, between the two pillars", () => {
    const { target } = render(arcDv({ labelStyle: "bubble" }, { orientation: "vertical" }));
    const b = bubbles(target);
    expect(b).toHaveLength(2);
    const walls = Array.from(target.querySelectorAll(`line[stroke="${LINE}"]`)).filter(
      (l) => l.getAttribute("x1") === l.getAttribute("x2")
    );
    expect(walls.length).toBeGreaterThanOrEqual(1);
    const xs = walls.map((w) => Number(w.getAttribute("x1")));
    expect(xs).toContain(Number(Number(b[0].getAttribute("cx")).toFixed(1)));
  });

  test("two-line text starts right of the line", () => {
    const { target } = render(arcDv({ labelLayout: "stack" }, { orientation: "vertical" }));
    const multi = Array.from(target.querySelectorAll("text")).find((t) => t.children.length === 2);
    expect(multi?.getAttribute("text-anchor")).toBe("start");
  });
});

describe("render — the bubble never covers a bar or a data label", () => {
  const VALUES = [2500, 300, 100, 2900, -220, -390, 2290];
  const OVERSHOOT = [2500, 900, -800, 2600, -220, -390, 1990];
  function bridgeDv(arc: Record<string, unknown>, general: Record<string, unknown> = {}, values = VALUES): Any {
    const flags = [true, false, false, true, false, false, true];
    const dv: Any = dvBuild({
      cats: [
        {
          name: "Year",
          values: ["FY23", "Volume", "Price", "FY24", "Mix", "Churn", "FY25"],
          objects: flags.map((f) => ({ pillars: { isPillar: f } }))
        }
      ],
      vals: [{ name: "EBITDA", role: "actual", values }]
    });
    dv.metadata.objects = {
      general,
      grandTotal: { showGrandTotal: false },
      variationArc: { show: true, defaultSource: "auto-both", lineColor: { solid: { color: LINE } }, ...arc }
    };
    return dv;
  }
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const num = (e: Element, a: string): number => Number(e.getAttribute(a));
  const bubbleBox = (e: Element): Box => {
    const tag = e.tagName.toLowerCase();
    if (tag === "rect") {
      return { x0: num(e, "x"), x1: num(e, "x") + num(e, "width"), y0: num(e, "y"), y1: num(e, "y") + num(e, "height") };
    }
    const rx = tag === "circle" ? num(e, "r") : num(e, "rx");
    const ry = tag === "circle" ? num(e, "r") : num(e, "ry");
    return { x0: num(e, "cx") - rx, x1: num(e, "cx") + rx, y0: num(e, "cy") - ry, y1: num(e, "cy") + ry };
  };
  const textBox = (t: Element): Box => {
    const size = num(t, "font-size") || 12;
    const w = (t.textContent ?? "").length * size * 0.55;
    const x = num(t, "x");
    const anchor = t.getAttribute("text-anchor");
    const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
    return { x0, x1: x0 + w, y0: num(t, "y") - 0.8 * size, y1: num(t, "y") + 0.2 * size };
  };
  const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

  function expectClear(target: HTMLElement): void {
    const b = bubbles(target);
    expect(b.length).toBe(2);
    const own = new Set(b.map((e) => e.nextElementSibling));
    const texts = Array.from(target.querySelectorAll("text")).filter((t) => !own.has(t));
    const bars = Array.from(target.querySelectorAll(".wf-bar > rect:first-child"));
    expect(bars.length).toBeGreaterThan(0);
    for (const e of b) {
      const box = bubbleBox(e);
      for (const t of texts) expect({ label: t.textContent, hit: overlaps(box, textBox(t)) }).toEqual({ label: t.textContent, hit: false });
      for (const r of bars) {
        const rb = { x0: num(r, "x"), x1: num(r, "x") + num(r, "width"), y0: num(r, "y"), y1: num(r, "y") + num(r, "height") };
        expect(overlaps(box, rb)).toBe(false);
      }
    }
  }

  const BIG = { labelStyle: "bubble", bubbleShape: "circle", labelLayout: "stack" };
  test.each([
    ["circle, along 30", { ...BIG, labelAlong: 30 }],
    ["circle, along 70", { ...BIG, labelAlong: 70 }],
    ["ellipse, two lines + caption", { labelStyle: "bubble", labelLayout: "stack", caption: "vs N-1" }],
    ["pill, one line", { labelStyle: "bubble", bubbleShape: "pill", pctParens: true }]
  ])("horizontal: %s", (_name, arc) => {
    expectClear(render(bridgeDv(arc)).target);
  });

  test.each([
    ["circle", BIG, VALUES],
    ["pill, one line", { labelStyle: "bubble", bubbleShape: "pill", pctParens: true }, VALUES],
    ["circle, a bridge overshooting both pillars", BIG, OVERSHOOT],
    ["pill, a bridge overshooting both pillars", { labelStyle: "bubble", bubbleShape: "pill", pctParens: true }, OVERSHOOT]
  ])("vertical: %s", (_name, arc, values) => {
    expectClear(render(bridgeDv(arc, { orientation: "vertical" }, values)).target);
  });
  test.each([
    ["circle, a bridge overshooting both pillars", BIG],
    ["ellipse, two lines", { labelStyle: "bubble", labelLayout: "stack" }]
  ])("horizontal: %s", (_name, arc) => {
    expectClear(render(bridgeDv(arc, {}, OVERSHOOT)).target);
  });
});

describe("pane — only the relevant arc slices show", () => {
  const arcSlices = (v: Any): string[] => {
    const fm = v.getFormattingModel();
    const card = fm.cards.find((c: Any) => c.uid === "variationArc-card");
    return card.groups.flatMap((g: Any) => (g.slices || []).map((s: Any) => s.uid));
  };

  test("text style: no Bubble slice; label background shown", () => {
    const { v } = render(arcDv({}));
    const s = arcSlices(v);
    expect(s).toContain("variationArc-labelBgColor");
    expect(s.some((u) => u.startsWith("variationArc-bubble"))).toBe(false);
    expect(s).not.toContain("variationArc-captionPosition");
    expect(s).not.toContain("variationArc-labelPosColor");
  });

  test("bubble style: Bubble group in, label background out; corner radius only for rect / square", () => {
    const { v } = render(arcDv({ labelStyle: "bubble" }));
    let s = arcSlices(v);
    expect(s).toContain("variationArc-bubbleShape");
    expect(s).not.toContain("variationArc-labelBgColor");
    expect(s).not.toContain("variationArc-bubbleCornerRadius");
    const { v: v2 } = render(arcDv({ labelStyle: "bubble", bubbleShape: "rect" }));
    s = arcSlices(v2);
    expect(s).toContain("variationArc-bubbleCornerRadius");
  });

  test("order / brackets need value AND percentage", () => {
    const { v } = render(arcDv({ defaultSource: "auto-abs" }));
    const s = arcSlices(v);
    expect(s).not.toContain("variationArc-labelOrder");
    expect(s).not.toContain("variationArc-pctParens");
    expect(s).not.toContain("variationArc-pctFontSize");
  });
});

describe("General → Text size (%)", () => {
  const sizeOf = (t: HTMLElement, content: string): number =>
    Number(Array.from(t.querySelectorAll("text")).find((x) => x.textContent === content)?.getAttribute("font-size"));

  test("100 (default) keeps every font size; 200 doubles arc and data labels", () => {
    const base = render(arcDv({})).target;
    const big = render(arcDv({}, { textScale: 200 })).target;
    expect(sizeOf(base, "+100 | +100.0%")).toBe(12);
    expect(sizeOf(big, "+100 | +100.0%")).toBe(24);
    expect(sizeOf(base, "200")).toBe(14);
    expect(sizeOf(big, "200")).toBe(28);
  });

  test("odd scales round to 0.01 px and out-of-range values clamp", () => {
    expect(sizeOf(render(arcDv({}, { textScale: 33 })).target, "+100 | +100.0%")).toBe(3.96);
    expect(sizeOf(render(arcDv({}, { textScale: 5 })).target, "+100 | +100.0%")).toBe(3);
  });
});
