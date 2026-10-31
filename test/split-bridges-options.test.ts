
import { makeVisual, dvBuild, FX_NEG, FX_POS } from "./_harness";
import {
  bridgeInScope,
  makeBridgeScope,
  parseBridgeList,
  parseSplitStyle,
  gapSliceSpans,
  sliceLabelFits,
  splitBarSlices,
  splitDetailFontSize,
  splitDetailLayout,
  splitDetailLines,
  splitLabelText,
  splitPartLabelParts,
  splitTotalSpan
} from "../src/subBridges";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;


describe("subBridges 1.7.0.0 — bridge selection", () => {
  test("the list splits on ; and newlines, trims, folds case, drops blanks", () => {
    expect([...parseBridgeList(" Division D ;Wholesale\n\n; ;ICSS & Other\r\nB2B, France ")]).toEqual([
      "division d",
      "wholesale",
      "icss & other",
      "b2b, france"
    ]);
    expect(parseBridgeList("").size).toBe(0);
    expect(parseBridgeList(undefined).size).toBe(0);
    expect(parseBridgeList(null).size).toBe(0);
  });

  test("scope all touches every bridge; list only the listed ones", () => {
    const all = makeBridgeScope("all", "France");
    expect(bridgeInScope("Anything", all)).toBe(true);
    expect(bridgeInScope("Anything", makeBridgeScope(undefined, ""))).toBe(true);
    const list = makeBridgeScope("list", "division D ; Totem");
    expect(bridgeInScope("Division D", list)).toBe(true);
    expect(bridgeInScope("  totem ", list)).toBe(true);
    expect(bridgeInScope("France", list)).toBe(false);
  });

  test("a list scope with an empty list touches no bridge", () => {
    const empty = makeBridgeScope("list", "  ;  ");
    expect(bridgeInScope("Division D", empty)).toBe(false);
    expect(bridgeInScope("", makeBridgeScope("list", undefined))).toBe(false);
  });
});

describe("subBridges 1.7.0.0 — part label pieces", () => {
  const opts = (showName: boolean, showValue: boolean, showRemainder = true) => ({
    showName,
    showValue,
    showRemainder
  });

  test("defaults = the 1.5.0.0 « Cyber +10 » / « −14 »", () => {
    expect(splitPartLabelParts("Cyber", "+10")).toEqual(["Cyber", "+10"]);
    expect(splitPartLabelParts("", "-14")).toEqual(["-14"]);
    expect(splitLabelText("Cyber", "+10")).toBe("Cyber +10");
    expect(splitLabelText(" ", "-14")).toBe("-14");
  });

  test("the four name / value combinations on a named part", () => {
    expect(splitPartLabelParts("Cyber", "+10", opts(true, true))).toEqual(["Cyber", "+10"]);
    expect(splitPartLabelParts("Cyber", "+10", opts(true, false))).toEqual(["Cyber"]);
    expect(splitPartLabelParts("Cyber", "+10", opts(false, true))).toEqual(["+10"]);
    expect(splitPartLabelParts("Cyber", "+10", opts(false, false))).toEqual([]);
  });

  test("the unnamed remainder shows its value only, and nothing once value or remainder is off", () => {
    expect(splitPartLabelParts("", "-24", opts(true, true))).toEqual(["-24"]);
    expect(splitPartLabelParts("", "-24", opts(false, true))).toEqual(["-24"]);
    expect(splitPartLabelParts("", "-24", opts(true, false))).toEqual([]);
    expect(splitPartLabelParts("", "-24", opts(true, true, false))).toEqual([]);
    expect(splitPartLabelParts("Cyber", "+10", opts(true, true, false))).toEqual(["Cyber", "+10"]);
    expect(splitLabelText("", "-24", opts(true, true, false))).toBe("");
  });
});

describe("subBridges 1.7.0.0 — total label span", () => {
  const base = { extent: 20, frameLo: 0, frameHi: 200, gap: 8 };

  test("past the occupied span on the preferred side", () => {
    expect(splitTotalSpan({ ...base, occupied: { lo: 50, hi: 100 }, towardHigh: true })).toEqual({
      lo: 108,
      hi: 128,
      towardHigh: true
    });
    expect(splitTotalSpan({ ...base, occupied: { lo: 50, hi: 100 }, towardHigh: false })).toEqual({
      lo: 22,
      hi: 42,
      towardHigh: false
    });
  });

  test("the mirror side when the frame blocks the preferred one", () => {
    const s = splitTotalSpan({ ...base, occupied: { lo: 50, hi: 180 }, towardHigh: true });
    expect(s).toEqual({ lo: 22, hi: 42, towardHigh: false });
  });

  test("both sides blocked → clamped into the frame on the preferred side", () => {
    const s = splitTotalSpan({ ...base, occupied: { lo: 10, hi: 190 }, towardHigh: true });
    expect(s.towardHigh).toBe(true);
    expect(s.lo).toBeGreaterThanOrEqual(2);
    expect(s.hi).toBeLessThanOrEqual(198);
  });
});

describe("subBridges 1.7.0.0 — 'Total + detail text' helpers", () => {
  const fmt = (v: number): string => (v > 0 ? "+" : "") + String(v);
  const THREE_PARTS = [
    { label: "", value: -91 },
    { label: "Cyber", value: 47 },
    { label: "Wholesale", value: 5 }
  ];
  const parts = [
    { label: "", value: -91 },
    { label: "Cyber", value: 47 },
    { label: "Wholesale", value: 5 },
    { label: "Retail", value: -2 }
  ];
  const opts = (showName: boolean, showValue: boolean, showRemainder = true) => ({
    showName,
    showValue,
    showRemainder
  });

  test("the style parses to 'cascade' unless it is exactly 'text'", () => {
    expect(parseSplitStyle("text")).toBe("text");
    expect(parseSplitStyle("cascade")).toBe("cascade");
    expect(parseSplitStyle(undefined)).toBe("cascade");
    expect(parseSplitStyle("TEXT")).toBe("cascade");
  });

  test("one line per part, value then name, gains first — no cap on the count", () => {
    expect(splitDetailLines(parts, fmt)).toEqual(["+47 Cyber", "+5 Wholesale", "-2 Retail", "-91"]);
    const many = Array.from({ length: 7 }, (_, k) => ({ label: `P${k}`, value: k - 3 }));
    expect(splitDetailLines(many, fmt)).toHaveLength(7);
    expect(splitDetailLines(many, fmt)[0]).toBe("+3 P6");
  });

  test("ties keep the legend order", () => {
    const tie = [
      { label: "B", value: 4 },
      { label: "A", value: 4 }
    ];
    expect(splitDetailLines(tie, fmt)).toEqual(["+4 B", "+4 A"]);
  });

  test("the part toggles: name only, value only, remainder off", () => {
    expect(splitDetailLines(parts, fmt, opts(true, false))).toEqual(["Cyber", "Wholesale", "Retail"]);
    expect(splitDetailLines(parts, fmt, opts(false, true))).toEqual(["+47", "+5", "-2", "-91"]);
    expect(splitDetailLines(parts, fmt, opts(true, true, false))).toEqual(["+47 Cyber", "+5 Wholesale", "-2 Retail"]);
    expect(splitDetailLines(parts, fmt, opts(false, false))).toEqual([]);
  });

  test("bar slices: |value| shares of the NET span, laid from runningBefore in detail order", () => {
    const sl = splitBarSlices(120, THREE_PARTS);
    expect(sl.map((s) => s.seg.label)).toEqual(["Cyber", "Wholesale", ""]);
    expect(sl[0].from).toBe(120);
    expect(sl[sl.length - 1].to).toBe(81);
    expect(sl[0].from - sl[0].to).toBeCloseTo((39 * 47) / 143, 9);
    expect(sl[1].from - sl[1].to).toBeCloseTo((39 * 5) / 143, 9);
    for (let k = 1; k < sl.length; k++) expect(sl[k].from).toBe(sl[k - 1].to);
    for (const s of sl) expect(s.lo).toBeLessThanOrEqual(s.hi);
  });

  test("bar slices: same-sign parts are an exact stack; nothing to slice → none", () => {
    const sl = splitBarSlices(10, [
      { label: "A", value: 3 },
      { label: "B", value: 7 }
    ]);
    expect(sl.map((s) => [s.from, s.to])).toEqual([
      [10, 17],
      [17, 20]
    ]);
    expect(splitBarSlices(10, [{ label: "A", value: 0 }])).toEqual([]);
  });

  test("font size: 80 % of the bridge label size, never below 7", () => {
    expect(splitDetailFontSize(14)).toBe(11);
    expect(splitDetailFontSize(10)).toBe(8);
    expect(splitDetailFontSize(6)).toBe(7);
  });

  const lay = (o: Partial<Parameters<typeof splitDetailLayout>[0]>) =>
    splitDetailLayout({
      vertical: true,
      netUp: false,
      occupied: { lo: 300, hi: 400 },
      catC: 100,
      lineCount: 3,
      size: 10,
      textWidth: 60,
      frameLo: 0,
      frameHi: 600,
      gap: 6,
      ...o
    });

  test("vertical: net loss → anchor end left of everything, lines centred on the row", () => {
    const l = lay({});
    expect(l.anchor).toBe("end");
    expect(l.x).toBe(294);
    expect(l.box.x0).toBe(234);
    expect(l.baselines).toHaveLength(3);
    expect(l.baselines[1] - l.baselines[0]).toBe(12);
    expect(l.baselines[1]).toBeCloseTo(100 + 10 * 0.35);
  });

  test("vertical: net gain → anchor start right of everything; mirror side when the frame blocks", () => {
    const g = lay({ netUp: true });
    expect(g.anchor).toBe("start");
    expect(g.x).toBe(406);
    const blocked = lay({ netUp: true, occupied: { lo: 300, hi: 580 } });
    expect(blocked.anchor).toBe("end");
    expect(blocked.box.x1).toBeLessThanOrEqual(294);
  });

  test("horizontal: net gain above, net loss below, anchor middle on the bar centre", () => {
    const up = lay({ vertical: false, netUp: true, occupied: { lo: 200, hi: 260 }, catC: 50 });
    expect(up.anchor).toBe("middle");
    expect(up.x).toBe(50);
    expect(up.box.y1).toBe(194);
    expect(up.box.y1 - up.box.y0).toBe(3 * 12 - 2);
    const down = lay({ vertical: false, netUp: false, occupied: { lo: 200, hi: 260 }, catC: 50 });
    expect(down.box.y0).toBe(266);
    expect(down.baselines[0]).toBeCloseTo(266 + 10 * 0.78);
  });
});


function obDv(o: {
  net?: "loss" | "gain";
  vertical?: boolean;
  layout?: string;
  legend?: Record<string, unknown>;
  bridges?: Record<string, unknown>;
} = {}): Any {
  const parts = (o.net ?? "loss") === "loss" ? [-24, 10] : [9, 4];
  const net = parts[0] + parts[1];
  const dv: Any = dvBuild({
    cats: [
      { name: "Division", values: ["Proforma", "France", "OB", "OB", "Totem", "End"] },
      { name: "Split", values: [null, null, null, "Sub", null, null], isLegend: true }
    ],
    vals: [{ name: "EBITDA", role: "actual", values: [100, 20, parts[0], parts[1], 40, 160 + net] }]
  });
  dv.metadata.objects = {
    general: { orientation: o.vertical ? "vertical" : "horizontal" },
    grandTotal: { showGrandTotal: false },
    legend: { layout: o.layout ?? "subBridges", ...(o.legend || {}) },
    ...(o.bridges ? { bridges: o.bridges } : {})
  };
  return dv;
}

const OB = 2;
const FRANCE = 1;

function run(dv: Any): { v: Any; target: HTMLElement } {
  const v: Any = makeVisual();
  v.update({ dataViews: [dv], viewport: { width: 760, height: 480 }, type: 2 });
  const target = v.target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return { v, target };
}

function barRects(target: HTMLElement, catIdx: number): SVGRectElement[] {
  const g = target.querySelector(`g.wf-bar[data-cat-idx="${catIdx}"]`)!;
  expect(g).toBeTruthy();
  return Array.from(g.querySelectorAll("rect")).filter(
    (r) => !r.classList.contains("wf-focus-ring") && r.getAttribute("fill") !== "none"
  ) as SVGRectElement[];
}

function labelTexts(target: HTMLElement, catIdx: number): SVGTextElement[] {
  return Array.from(target.querySelectorAll(`g.wf-clickable[data-cat-idx="${catIdx}"]`))
    .filter((g) => !g.classList.contains("wf-bar"))
    .flatMap((g) => Array.from(g.querySelectorAll("text"))) as SVGTextElement[];
}

const partTexts = (target: HTMLElement, catIdx: number): SVGTextElement[] =>
  labelTexts(target, catIdx).filter((t) => !t.classList.contains("wf-split-total"));

const totalText = (target: HTMLElement, catIdx: number): SVGTextElement | undefined =>
  labelTexts(target, catIdx).find((t) => t.classList.contains("wf-split-total"));

const num = (el: Element, a: string): number => Number(el.getAttribute(a));

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function textBox(t: SVGTextElement): Box {
  const size = num(t, "font-size");
  const spans = Array.from(t.querySelectorAll("tspan"));
  const lines = spans.length > 1 ? spans.map((s) => s.textContent || "") : [t.textContent || ""];
  const w = Math.max(...lines.map((l) => l.length)) * size * 0.55;
  const x = num(t, "x");
  const anchor = t.getAttribute("text-anchor");
  const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  const y = num(t, "y");
  return { x0, x1: x0 + w, y0: y - size * 0.78, y1: y + (lines.length - 1) * (size + 2) + size * 0.22 };
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function rectSpan(rects: SVGRectElement[], vertical: boolean): { lo: number; hi: number } {
  const lo = Math.min(...rects.map((r) => num(r, vertical ? "x" : "y")));
  const hi = Math.max(
    ...rects.map((r) => num(r, vertical ? "x" : "y") + num(r, vertical ? "width" : "height"))
  );
  return { lo, hi };
}

describe("Legend → Bridges: listed bridges only", () => {
  test("a listed bridge splits — trimmed, case-insensitive", () => {
    const { target } = run(obDv({ legend: { bridgeScope: "list", bridgeList: "  ob ; Totem" } }));
    expect(barRects(target, OB).length).toBe(2);
  });

  test("an unlisted bridge with two live parts stays ONE plain bar with its net label", () => {
    const { target } = run(obDv({ legend: { bridgeScope: "list", bridgeList: "France" } }));
    const rects = barRects(target, OB);
    expect(rects.length).toBe(1);
    expect(rects[0].getAttribute("fill")).toBe(FX_NEG);
    const texts = partTexts(target, OB).map((t) => t.textContent || "");
    expect(texts.length).toBe(1);
    expect(texts[0]).toMatch(/^[-−]14$/);
  });

  test("an empty list splits nothing", () => {
    const { target } = run(obDv({ legend: { bridgeScope: "list", bridgeList: "" } }));
    expect(barRects(target, OB).length).toBe(1);
  });

  test("the Y range does not reserve the dip of an unlisted bridge", () => {
    const dv: Any = dvBuild({
      cats: [
        { name: "Cat", values: ["S", "X", "X", "E"] },
        { name: "L", values: [null, null, "P", null], isLegend: true }
      ],
      vals: [{ name: "V", role: "actual", values: [10, -30, 25, 5] }]
    });
    dv.metadata.objects = { legend: { layout: "subBridges", bridgeScope: "list", bridgeList: "X" } };
    expect(run(dv).v.lastValidRenderInput.layout.minVisual).toBeCloseTo(-20, 6);
    dv.metadata.objects = { legend: { layout: "subBridges", bridgeScope: "list", bridgeList: "S" } };
    expect(run(dv).v.lastValidRenderInput.layout.minVisual).toBeCloseTo(0, 6);
  });

  test("the Stacked layout honours the list too", () => {
    const stackedAll = run(obDv({ layout: "stacked" })).target;
    expect(barRects(stackedAll, OB).length).toBe(2);
    const listed = run(obDv({ layout: "stacked", legend: { bridgeScope: "list", bridgeList: "ob" } })).target;
    expect(barRects(listed, OB).length).toBe(2);
    const unlisted = run(
      obDv({ layout: "stacked", legend: { bridgeScope: "list", bridgeList: "France" } })
    ).target;
    const rects = barRects(unlisted, OB);
    expect(rects.length).toBe(1);
    expect(rects[0].getAttribute("fill")).toBe(FX_NEG);
  });

  test("pillars ignore the bridge list (stacked, applied to both)", () => {
    const a = run(obDv({ layout: "stacked" })).target;
    const b = run(obDv({ layout: "stacked", legend: { bridgeScope: "list", bridgeList: "" } })).target;
    for (const p of [0, 4]) expect(barRects(b, p).length).toBe(barRects(a, p).length);
  });
});

describe("Legend → Layout: part name / value / remainder", () => {
  const texts = (legend: Record<string, unknown>): string[] =>
    partTexts(run(obDv({ legend })).target, OB).map((t) => t.textContent || "");

  test("defaults: « −24 » and « Sub +10 »", () => {
    const t = texts({});
    expect(t.length).toBe(2);
    expect(t[0]).toMatch(/^[-−]24$/);
    expect(t[1]).toBe("Sub +10");
  });

  test("name only: « Sub », the remainder has nothing to show", () => {
    expect(texts({ splitShowPartValue: false })).toEqual(["Sub"]);
  });

  test("value only: « −24 » and « +10 »", () => {
    const t = texts({ splitShowPartName: false });
    expect(t.length).toBe(2);
    expect(t[0]).toMatch(/^[-−]24$/);
    expect(t[1]).toBe("+10");
  });

  test("both off: no part label at all", () => {
    expect(texts({ splitShowPartName: false, splitShowPartValue: false })).toEqual([]);
  });

  test("remainder label off: only the named part is labelled", () => {
    expect(texts({ splitShowRemainderLabel: false })).toEqual(["Sub +10"]);
  });

  test("wrap only applies when both pieces are shown", () => {
    const { target } = run(obDv({ legend: { splitLabelWrap: true, splitShowPartValue: false } }));
    const t = partTexts(target, OB);
    expect(t.length).toBe(1);
    expect(t[0].querySelectorAll("tspan").length).toBe(0);
    const both = partTexts(run(obDv({ legend: { splitLabelWrap: true } })).target, OB).find((el) =>
      /Sub/.test(el.textContent || "")
    )!;
    expect(Array.from(both.querySelectorAll("tspan")).map((s) => s.textContent)).toEqual(["Sub", "+10"]);
  });

  test("the parts keep their own fx colours whatever the labels show", () => {
    const { target } = run(obDv({ legend: { splitShowPartName: false, splitShowPartValue: false } }));
    const [rest, part] = barRects(target, OB);
    expect(rest.getAttribute("fill")).toBe(FX_NEG);
    expect(part.getAttribute("fill")).toBe(FX_POS);
  });
});

describe("Legend → Layout: bridge total", () => {
  const TOTAL_GAP = { vertical: 8, horizontal: 6 };

  test("off by default — no total anywhere", () => {
    const { target } = run(obDv());
    expect(target.querySelectorAll(".wf-split-total").length).toBe(0);
  });

  test("only a SPLIT bridge gets one (a plain bridge never does)", () => {
    const { target } = run(obDv({ legend: { splitShowTotal: true } }));
    expect(target.querySelectorAll(".wf-split-total").length).toBe(1);
    expect(totalText(target, OB)).toBeTruthy();
    expect(totalText(target, FRANCE)).toBeUndefined();
    const unlisted = run(
      obDv({ legend: { splitShowTotal: true, bridgeScope: "list", bridgeList: "France" } })
    ).target;
    expect(unlisted.querySelectorAll(".wf-split-total").length).toBe(0);
  });

  test("gated by the Bridges data-label toggle", () => {
    const { target } = run(obDv({ legend: { splitShowTotal: true }, bridges: { showDataLabels: false } }));
    expect(target.querySelectorAll(".wf-split-total").length).toBe(0);
  });

  test("text = the signed net, bold, in the bar's clickable group", () => {
    const { target } = run(obDv({ legend: { splitShowTotal: true } }));
    const t = totalText(target, OB)!;
    expect(t.textContent).toMatch(/^[-−]14$/);
    expect(t.getAttribute("font-weight")).toBe("bold");
    expect(t.closest("g.wf-clickable")!.getAttribute("data-cat-idx")).toBe(String(OB));
    const gain = totalText(run(obDv({ net: "gain", legend: { splitShowTotal: true } })).target, OB)!;
    expect(gain.textContent).toBe("+13");
  });

  for (const vertical of [true, false]) {
    for (const net of ["loss", "gain"] as const) {
      test(`${vertical ? "vertical" : "horizontal"}, net ${net}: beyond the cascade and every part label, no overlap`, () => {
        const { target } = run(obDv({ vertical, net, legend: { splitShowTotal: true } }));
        const total = textBox(totalText(target, OB)!);
        const parts = partTexts(target, OB).map(textBox);
        expect(parts.length).toBe(2);
        for (const p of parts) expect(overlaps(total, p)).toBe(false);
        const bars = rectSpan(barRects(target, OB), vertical);
        const gap = vertical ? TOTAL_GAP.vertical : TOTAL_GAP.horizontal;
        if (vertical) {
          if (net === "gain") {
            const edge = Math.max(bars.hi, ...parts.map((p) => p.x1));
            expect(total.x0).toBeGreaterThanOrEqual(edge + gap - 0.2);
          } else {
            const edge = Math.min(bars.lo, ...parts.map((p) => p.x0));
            expect(total.x1).toBeLessThanOrEqual(edge - gap + 0.2);
          }
        } else {
          if (net === "gain") {
            const edge = Math.min(bars.lo, ...parts.map((p) => p.y0));
            expect(total.y1).toBeLessThanOrEqual(edge - gap + 0.2);
          } else {
            const edge = Math.max(bars.hi, ...parts.map((p) => p.y1));
            expect(total.y0).toBeGreaterThanOrEqual(edge - 0.2);
          }
        }
      });
    }
  }

  test("THE production look, vertical net loss: « −14 » left of the cascade, « Sub +10 » on the right, remainder unlabelled", () => {
    const { target } = run(
      obDv({ vertical: true, legend: { splitShowTotal: true, splitShowRemainderLabel: false } })
    );
    const parts = partTexts(target, OB);
    expect(parts.map((t) => t.textContent)).toEqual(["Sub +10"]);
    expect(parts[0].getAttribute("text-anchor")).toBe("start");
    const total = totalText(target, OB)!;
    expect(total.textContent).toMatch(/^[-−]14$/);
    expect(total.getAttribute("text-anchor")).toBe("end");
    const bars = rectSpan(barRects(target, OB), true);
    expect(textBox(total).x1).toBeLessThanOrEqual(bars.lo - 7.8);
    expect(textBox(parts[0]).x0).toBeGreaterThanOrEqual(bars.lo);
    expect(overlaps(textBox(total), textBox(parts[0]))).toBe(false);
  });

  test("THE production look, vertical net gain: « +13 » past « Sub +4 » on the right", () => {
    const { target } = run(
      obDv({ vertical: true, net: "gain", legend: { splitShowTotal: true, splitShowRemainderLabel: false } })
    );
    const parts = partTexts(target, OB);
    expect(parts.map((t) => t.textContent)).toEqual(["Sub +4"]);
    const total = totalText(target, OB)!;
    expect(total.textContent).toBe("+13");
    expect(total.getAttribute("text-anchor")).toBe("start");
    expect(textBox(total).x0).toBeGreaterThanOrEqual(textBox(parts[0]).x1 + 7.8);
    expect(overlaps(textBox(total), textBox(parts[0]))).toBe(false);
  });

  test("with every part label off the total still sits past the cascade", () => {
    const { target } = run(
      obDv({
        vertical: true,
        legend: { splitShowTotal: true, splitShowPartName: false, splitShowPartValue: false }
      })
    );
    expect(partTexts(target, OB).length).toBe(0);
    const total = textBox(totalText(target, OB)!);
    const bars = rectSpan(barRects(target, OB), true);
    expect(total.x1).toBeLessThanOrEqual(bars.lo - 7.8);
  });
});


function multiDv(o: {
  parts: Array<[string | null, number]>;
  vertical?: boolean;
  legend?: Record<string, unknown>;
  bridges?: Record<string, unknown>;
}): Any {
  const net = o.parts.reduce((s, p) => s + p[1], 0);
  const dv: Any = dvBuild({
    cats: [
      { name: "Division", values: ["Proforma", "France", ...o.parts.map(() => "OB"), "Totem", "End"] },
      { name: "Split", values: [null, null, ...o.parts.map((p) => p[0]), null, null], isLegend: true }
    ],
    vals: [{ name: "EBITDA", role: "actual", values: [100, 20, ...o.parts.map((p) => p[1]), 40, 160 + net] }]
  });
  dv.metadata.objects = {
    general: { orientation: o.vertical ? "vertical" : "horizontal" },
    grandTotal: { showGrandTotal: false },
    legend: { layout: "subBridges", splitStyle: "text", ...(o.legend || {}) },
    ...(o.bridges ? { bridges: o.bridges } : {})
  };
  return dv;
}

const THREE: Array<[string | null, number]> = [[null, -91], ["Cyber", 47], ["Wholesale", 5]];
const FOUR: Array<[string | null, number]> = [[null, -91], ["Cyber", 47], ["Wholesale", 5], ["Retail", -2]];

const detailText = (target: HTMLElement, catIdx: number): SVGTextElement | undefined =>
  labelTexts(target, catIdx).find((t) => t.classList.contains("wf-split-detail"));
const detailLines = (t: SVGTextElement | undefined): string[] =>
  t ? Array.from(t.querySelectorAll("tspan")).map((s) => (s.textContent || "").replace(/−/g, "-")) : [];
const bridgeLabel = (target: HTMLElement, catIdx: number): SVGTextElement =>
  labelTexts(target, catIdx).find((t) => !t.classList.contains("wf-split-detail"))!;

function detailBox(t: SVGTextElement): Box {
  const size = num(t, "font-size");
  const spans = Array.from(t.querySelectorAll("tspan"));
  const w = Math.max(...spans.map((s) => (s.textContent || "").length)) * size * 0.55;
  const x = num(spans[0], "x");
  const anchor = t.getAttribute("text-anchor");
  const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  const ys = spans.map((s) => num(s, "y"));
  return { x0, x1: x0 + w, y0: Math.min(...ys) - size * 0.78, y1: Math.max(...ys) + size * 0.22 };
}

describe("Legend → Split style: total + detail text", () => {
  test("a 3-part split: ONE plain net bar, its label = the net, one detail line per part (gains first)", () => {
    const { target } = run(multiDv({ parts: THREE, vertical: true, legend: { splitTextBarColors: false } }));
    expect(barRects(target, OB).length).toBe(1);
    expect((bridgeLabel(target, OB).textContent || "").replace(/−/g, "-")).toBe("-39");
    expect(detailLines(detailText(target, OB))).toEqual(["+47 Cyber", "+5 Wholesale", "-91"]);
    expect(totalText(target, OB)).toBeUndefined();
  });

  test("a 4-part split lists all four lines, by value descending", () => {
    const { target } = run(multiDv({ parts: FOUR }));
    expect(detailLines(detailText(target, OB))).toEqual(["+47 Cyber", "+5 Wholesale", "-2 Retail", "-91"]);
  });

  test("the toggles: name only, value only, remainder off", () => {
    const nameOnly = run(multiDv({ parts: FOUR, legend: { splitShowPartValue: false } })).target;
    expect(detailLines(detailText(nameOnly, OB))).toEqual(["Cyber", "Wholesale", "Retail"]);
    const valueOnly = run(multiDv({ parts: FOUR, legend: { splitShowPartName: false } })).target;
    expect(detailLines(detailText(valueOnly, OB))).toEqual(["+47", "+5", "-2", "-91"]);
    const noRest = run(multiDv({ parts: FOUR, legend: { splitShowRemainderLabel: false } })).target;
    expect(detailLines(detailText(noRest, OB))).toEqual(["+47 Cyber", "+5 Wholesale", "-2 Retail"]);
  });

  test("80 % of the bridge label size, in the bar's clickable group", () => {
    const { target } = run(multiDv({ parts: THREE, vertical: true }));
    const t = detailText(target, OB)!;
    expect(num(t, "font-size")).toBe(Math.max(7, Math.round(num(bridgeLabel(target, OB), "font-size") * 0.8)));
    expect(t.closest(`g.wf-clickable[data-cat-idx="${OB}"]`)).toBeTruthy();
  });

  test("'Bridge total' is irrelevant here — no extra total label even when on", () => {
    const { target } = run(multiDv({ parts: THREE, legend: { splitShowTotal: true } }));
    expect(totalText(target, OB)).toBeUndefined();
  });

  test("gated by the Bridges data-label toggle", () => {
    const { target } = run(multiDv({ parts: THREE, bridges: { showDataLabels: false } }));
    expect(detailText(target, OB)).toBeUndefined();
  });

  test("no cascade dip reserved: the bar sits exactly where an unlisted (plain) bridge sits", () => {
    for (const vertical of [false, true]) {
      const text = barRects(run(multiDv({ parts: THREE, vertical, legend: { splitTextBarColors: false } })).target, OB)[0];
      const plain = barRects(
        run(multiDv({ parts: THREE, vertical, legend: { bridgeScope: "list", bridgeList: "France" } })).target,
        OB
      )[0];
      expect(text.outerHTML).toBe(plain.outerHTML);
    }
  });

  for (const vertical of [true, false]) {
    test(`${vertical ? "vertical" : "horizontal"}: the bar is sliced by part — count, widths ∝ |value|, colours, order`, () => {
      const { target } = run(multiDv({ parts: THREE, vertical, legend: { splitTextSliceGap: 0 } }));
      const slices = barRects(target, OB);
      expect(slices.length).toBe(3);
      for (const r of slices) expect(r.classList.contains("wf-split-slice")).toBe(true);
      const plain = barRects(run(multiDv({ parts: THREE, vertical, legend: { splitTextBarColors: false } })).target, OB)[0];
      const plainSpan = rectSpan([plain], vertical);
      const span = rectSpan(slices, vertical);
      expect(span.lo).toBeCloseTo(plainSpan.lo, 0);
      expect(span.hi).toBeCloseTo(plainSpan.hi, 0);
      const len = (r: SVGRectElement): number => num(r, vertical ? "width" : "height");
      const total = slices.reduce((s, r) => s + len(r), 0);
      expect(total).toBeCloseTo(plainSpan.hi - plainSpan.lo, 0);
      [47, 5, 91].forEach((a, k) => expect(len(slices[k]) / total).toBeCloseTo(a / 143, 2));
      expect(slices.map((r) => r.getAttribute("fill"))).toEqual([FX_POS, FX_POS, FX_NEG]);
      const first = slices[0];
      const start = vertical ? num(first, "x") + num(first, "width") : num(first, "y");
      expect(start).toBeCloseTo(vertical ? plainSpan.hi : plainSpan.lo, 0);
    });
  }

  test("toggle off → one single-colour rect, the bridge's own", () => {
    const { target } = run(multiDv({ parts: THREE, legend: { splitTextBarColors: false } }));
    const rects = barRects(target, OB);
    expect(rects.length).toBe(1);
    expect(rects[0].classList.contains("wf-split-slice")).toBe(false);
  });

  const TWO_NEG: Array<[string | null, number]> = [[null, -40], ["Cyber", -30], ["Wholesale", 12]];
  const sliceSpans = (target: HTMLElement, vertical: boolean): Array<{ lo: number; hi: number; r: SVGRectElement }> =>
    barRects(target, OB)
      .map((r) => {
        const lo = num(r, vertical ? "x" : "y");
        return { lo, hi: lo + num(r, vertical ? "width" : "height"), r };
      })
      .sort((a, b) => a.lo - b.lo);
  for (const vertical of [true, false]) {
    test(`${vertical ? "vertical" : "horizontal"}: gap between parts — two losses stay two, outer edges kept`, () => {
      const plain = rectSpan(
        barRects(run(multiDv({ parts: TWO_NEG, vertical, legend: { splitTextBarColors: false } })).target, OB),
        vertical
      );
      const spans = sliceSpans(run(multiDv({ parts: TWO_NEG, vertical })).target, vertical);
      expect(spans).toHaveLength(3);
      expect(spans.filter((s) => s.r.getAttribute("fill") === FX_NEG)).toHaveLength(2);
      for (let k = 1; k < spans.length; k++) expect(spans[k].lo - spans[k - 1].hi).toBeCloseTo(2, 0);
      expect(spans[0].lo).toBeCloseTo(plain.lo, 0);
      expect(spans[spans.length - 1].hi).toBeCloseTo(plain.hi, 0);
      const sum = spans.reduce((a, s) => a + (s.hi - s.lo), 0);
      expect(sum).toBeCloseTo(plain.hi - plain.lo - 4, 0);
      const glued = sliceSpans(run(multiDv({ parts: TWO_NEG, vertical, legend: { splitTextSliceGap: 0 } })).target, vertical);
      for (let k = 1; k < glued.length; k++) expect(Math.abs(glued[k].lo - glued[k - 1].hi)).toBeLessThan(0.15);
    });

    test(`${vertical ? "vertical" : "horizontal"}: values in parts — only where they fit, the right values, off by default`, () => {
      const parts: Array<[string | null, number]> = [[null, -60], ["Cyber", -30], ["Wholesale", 2]];
      const sliceLabels = (target: HTMLElement): SVGTextElement[] =>
        labelTexts(target, OB).filter((t) => t.classList.contains("wf-split-slice-label"));
      expect(sliceLabels(run(multiDv({ parts, vertical })).target)).toHaveLength(0);
      const { target } = run(multiDv({ parts, vertical, legend: { splitTextSliceLabels: true } }));
      const labels = sliceLabels(target);
      expect(labels.map((t) => (t.textContent || "").replace(/−/g, "-")).sort()).toEqual(["-30", "-60"]);
      expect(detailLines(detailText(target, OB))).toContain("+2 Wholesale");
      const spans = sliceSpans(target, vertical);
      for (const t of labels) {
        const at = vertical ? num(t, "x") : num(t, "y") - num(t, "font-size") * 0.35;
        expect(spans.some((s) => at > s.lo && at < s.hi)).toBe(true);
        expect(t.getAttribute("text-anchor")).toBe("middle");
      }
      const off = run(multiDv({ parts, vertical, legend: { splitTextSliceLabels: true }, bridges: { showDataLabels: false } }));
      expect(sliceLabels(off.target)).toHaveLength(0);
    });
  }

  test("a bar too short for its gaps never inverts a slice", () => {
    for (const vertical of [true, false]) {
      const spans = sliceSpans(
        run(multiDv({ parts: [[null, -0.6], ["Cyber", -0.5], ["Wholesale", 0.4]], vertical, legend: { splitTextSliceGap: 8 } })).target,
        vertical
      );
      expect(spans).toHaveLength(3);
      for (const s of spans) expect(s.hi - s.lo).toBeGreaterThanOrEqual(0.9);
    }
  });

  test("the slices never touch the cascade style", () => {
    const { target } = run(obDv({ legend: { splitTextBarColors: true } }));
    expect(target.querySelectorAll(".wf-split-slice").length).toBe(0);
  });

  for (const vertical of [true, false]) {
    for (const gain of [false, true]) {
      const parts: Array<[string | null, number]> = gain ? [[null, 30], ["Cyber", -8], ["Wholesale", 5]] : THREE;
      test(`${vertical ? "vertical" : "horizontal"}, net ${gain ? "gain" : "loss"}: the block sits past the bar and the label, on the net side, overlapping neither`, () => {
        const { target } = run(multiDv({ parts, vertical }));
        const t = detailText(target, OB)!;
        expect(t).toBeTruthy();
        const block = detailBox(t);
        const label = textBox(bridgeLabel(target, OB));
        const bar = rectSpan(barRects(target, OB), vertical);
        const r = barRects(target, OB)[0];
        const barBox: Box = vertical
          ? { x0: bar.lo, x1: bar.hi, y0: num(r, "y"), y1: num(r, "y") + num(r, "height") }
          : { x0: num(r, "x"), x1: num(r, "x") + num(r, "width"), y0: bar.lo, y1: bar.hi };
        expect(overlaps(block, label)).toBe(false);
        expect(overlaps(block, barBox)).toBe(false);
        if (vertical) {
          expect(t.getAttribute("text-anchor")).toBe(gain ? "start" : "end");
          if (gain) expect(block.x0).toBeGreaterThanOrEqual(Math.max(bar.hi, label.x1));
          else expect(block.x1).toBeLessThanOrEqual(Math.min(bar.lo, label.x0));
        } else {
          expect(t.getAttribute("text-anchor")).toBe("middle");
          if (gain) expect(block.y1).toBeLessThanOrEqual(Math.min(bar.lo, label.y0));
          else expect(block.y0).toBeGreaterThanOrEqual(Math.max(bar.hi, label.y1));
        }
      });
    }
  }

  test("a bridge that does not split keeps no block", () => {
    const { target } = run(multiDv({ parts: THREE }));
    expect(detailText(target, FRANCE)).toBeUndefined();
  });

  test("'Mini-cascade' is the default: explicit cascade = no splitStyle at all", () => {
    for (const vertical of [false, true]) {
      const a = run(obDv({ vertical })).target.innerHTML;
      const b = run(obDv({ vertical, legend: { splitStyle: "cascade" } })).target.innerHTML;
      expect(b).toBe(a);
    }
  });
});

describe("Legend → Layout 1.7.0.0: defaults are the 1.6.2.0 render", () => {
  const explicitDefaults = {
    splitStyle: "cascade",
    splitTextBarColors: true,
    bridgeScope: "all",
    bridgeList: "",
    splitShowPartName: true,
    splitShowPartValue: true,
    splitShowRemainderLabel: true,
    splitShowTotal: false
  };
  for (const layout of ["subBridges", "stacked"]) {
    for (const vertical of [false, true]) {
      test(`${layout}, ${vertical ? "vertical" : "horizontal"}: byte-identical with every new prop at its default`, () => {
        const a = run(obDv({ layout, vertical })).target.innerHTML;
        const b = run(obDv({ layout, vertical, legend: explicitDefaults })).target.innerHTML;
        expect(b).toBe(a);
      });
    }
  }

  test("the list text is inert under 'All bridges'", () => {
    const a = run(obDv()).target.innerHTML;
    const b = run(obDv({ legend: { bridgeList: "France" } })).target.innerHTML;
    expect(b).toBe(a);
  });
});

describe("Legend → Layout 1.7.0.0: format pane", () => {
  const legendSliceNames = (v: Any): string[] => {
    const model = v.getFormattingModel();
    const card = model.cards.find((c: Any) => c.uid === "legend-card");
    return card.groups
      .flatMap((g: Any) => (g.slices || []).map((s: Any) => s.control?.properties?.descriptor?.propertyName))
      .filter(Boolean);
  };

  test("the list box shows only under 'Listed bridges only'", () => {
    expect(legendSliceNames(run(obDv()).v)).not.toContain("bridgeList");
    const names = legendSliceNames(run(obDv({ legend: { bridgeScope: "list" } })).v);
    expect(names.slice(0, 4)).toEqual(["layout", "splitStyle", "bridgeScope", "bridgeList"]);
  });

  test("stacked: the selection stays, the split-only label options leave", () => {
    const names = legendSliceNames(run(obDv({ layout: "stacked", legend: { bridgeScope: "list" } })).v);
    expect(names).toContain("bridgeScope");
    expect(names).toContain("bridgeList");
    for (const n of ["splitStyle", "splitTextBarColors", "splitShowPartName", "splitShowPartValue", "splitShowRemainderLabel", "splitShowTotal"]) {
      expect(names).not.toContain(n);
    }
  });

  test("text style: 'Bridge total' and 'Wrap part labels' leave, the part toggles stay", () => {
    const names = legendSliceNames(run(obDv({ legend: { splitStyle: "text" } })).v);
    expect(names).toContain("splitStyle");
    for (const n of ["splitTextBarColors", "splitShowPartName", "splitShowPartValue", "splitShowRemainderLabel"]) {
      expect(names).toContain(n);
    }
    expect(names).not.toContain("splitShowTotal");
    expect(names).not.toContain("splitLabelWrap");
  });

  test("every new slice lives in the Layout group, in the documented order", () => {
    const v = run(obDv({ legend: { bridgeScope: "list" } })).v;
    const model = v.getFormattingModel();
    const card = model.cards.find((c: Any) => c.uid === "legend-card");
    const layoutGroup = card.groups.find((g: Any) => g.uid === "legendLayout-group");
    const names = layoutGroup.slices.map((s: Any) => s.control?.properties?.descriptor?.propertyName);
    expect(names).toEqual([
      "layout",
      "splitStyle",
      "bridgeScope",
      "bridgeList",
      "splitShowPartName",
      "splitShowPartValue",
      "splitShowRemainderLabel",
      "splitLabelWrap",
      "splitShowTotal"
    ]);
  });
});

describe("subBridges — slice gaps and in-slice labels (pure)", () => {
  test("gapSliceSpans: outer edges kept, internal gaps of `gap` px, either direction", () => {
    const up = gapSliceSpans([{ a: 0, b: 50 }, { a: 50, b: 80 }, { a: 80, b: 100 }], 2);
    expect(up).toEqual([{ a: 0, b: 49 }, { a: 51, b: 79 }, { a: 81, b: 100 }]);
    const down = gapSliceSpans([{ a: 100, b: 60 }, { a: 60, b: 0 }], 4);
    expect(down).toEqual([{ a: 100, b: 62 }, { a: 58, b: 0 }]);
  });

  test("gapSliceSpans: gap 0 or one slice returns the spans untouched", () => {
    const s = [{ a: 3, b: 9 }, { a: 9, b: 12 }];
    expect(gapSliceSpans(s, 0)).toEqual(s);
    expect(gapSliceSpans([{ a: 1, b: 5 }], 3)).toEqual([{ a: 1, b: 5 }]);
  });

  test("gapSliceSpans: a short bar shrinks the gap, no slice below 1 px or inverted", () => {
    const out = gapSliceSpans([{ a: 0, b: 1.2 }, { a: 1.2, b: 2.4 }, { a: 2.4, b: 3.6 }], 6);
    for (const s of out) expect(s.b - s.a).toBeGreaterThanOrEqual(1 - 1e-9);
    const tiny = gapSliceSpans([{ a: 0, b: 10 }, { a: 10, b: 10.3 }, { a: 10.3, b: 20 }], 2);
    expect(tiny[1].b - tiny[1].a).toBeCloseTo(1, 6);
    expect(tiny[0].b).toBeCloseTo(9, 6);
    expect(tiny[2].a).toBeCloseTo(11.3, 6);
  });

  test("sliceLabelFits: length for vertical bars, height + bar width for horizontal", () => {
    expect(sliceLabelFits({ vertical: true, sliceLen: 30, thickness: 20, textWidth: 20, size: 8 })).toBe(true);
    expect(sliceLabelFits({ vertical: true, sliceLen: 23, thickness: 20, textWidth: 20, size: 8 })).toBe(false);
    expect(sliceLabelFits({ vertical: true, sliceLen: 30, thickness: 9, textWidth: 20, size: 8 })).toBe(false);
    expect(sliceLabelFits({ vertical: false, sliceLen: 10, thickness: 24, textWidth: 20, size: 8 })).toBe(true);
    expect(sliceLabelFits({ vertical: false, sliceLen: 9, thickness: 24, textWidth: 20, size: 8 })).toBe(false);
    expect(sliceLabelFits({ vertical: false, sliceLen: 40, thickness: 23, textWidth: 20, size: 8 })).toBe(false);
  });
});

describe("Legend → Split style: the total never sits on the sliced bar", () => {
  test.each([true, false])("vertical=%s, Center position, sliced bar → total outside the slices", (vertical) => {
    const parts: Array<[string | null, number]> = [["Mainstream", -56], ["Wholesale", -35], ["Cyber", 47]];
    const { target } = run(multiDv({ parts, vertical, bridges: { labelPosition: "center" } }));
    const slices = Array.from(target.querySelectorAll(`g.wf-bar[data-cat-idx="${OB}"] rect.wf-split-slice`));
    expect(slices.length).toBe(3);
    const a = vertical ? "x" : "y";
    const len = vertical ? "width" : "height";
    const lo = Math.min(...slices.map((r) => num(r, a)));
    const hi = Math.max(...slices.map((r) => num(r, a) + num(r, len)));
    const label = bridgeLabel(target, OB);
    expect((label.textContent || "").replace(/−/g, "-")).toBe("-44");
    const p = num(label, a);
    expect(p < lo || p > hi).toBe(true);
  });

  test("an unsliced text-style bar keeps the Center position", () => {
    const parts: Array<[string | null, number]> = [["Mainstream", -56], ["Wholesale", -35], ["Cyber", 47]];
    const { target } = run(multiDv({ parts, vertical: true, bridges: { labelPosition: "center" }, legend: { splitTextBarColors: false } }));
    const bar = barRects(target, OB)[0];
    const label = bridgeLabel(target, OB);
    expect(label.getAttribute("text-anchor")).toBe("middle");
    expect(num(label, "x")).toBeCloseTo(num(bar, "x") + num(bar, "width") / 2, 0);
  });
});
