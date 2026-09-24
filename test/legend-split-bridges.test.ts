
import { makeVisual, dvBuild, FX_NEG, FX_POS } from "./_harness";
import { buildTooltipItems } from "../src/tooltip";
import {
  planSplitSegments,
  splitExtent,
  splitLabelText,
  splitSlots,
  splitSteps
} from "../src/subBridges";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;


describe("subBridges — pure planning", () => {
  const seg = (label: string, value: number) => ({ label, value });

  test("fewer than two LIVE parts ⇒ no split (the plain bar stays)", () => {
    expect(planSplitSegments(undefined)).toBeUndefined();
    expect(planSplitSegments([seg("", 78)])).toBeUndefined();
    expect(planSplitSegments([seg("", 78), seg("Sub", 0)])).toBeUndefined();
    expect(planSplitSegments([seg("", 78), seg("Sub", 1e-12)])).toBeUndefined();
  });

  test("the blank remainder leads, named parts follow in legend order", () => {
    const out = planSplitSegments([seg("Sub", 10), seg("", -14), seg("Other", 3)])!;
    expect(out.map((s) => s.label)).toEqual(["", "Sub", "Other"]);
  });

  test("steps chain from runningBefore and land on runningAfter", () => {
    const steps = splitSteps(3310, [seg("", -14), seg("Sub", 10)]);
    expect(steps).toEqual([
      { from: 3310, to: 3296, lo: 3296, hi: 3310 },
      { from: 3296, to: 3306, lo: 3296, hi: 3306 }
    ]);
  });

  test("a mixed-sign split reaches past the net span", () => {
    expect(splitExtent(10, [seg("", -30), seg("P", 25)])).toEqual({ lo: -20, hi: 10 });
  });

  test("slots share the bar thickness with a hairline gap", () => {
    const slots = splitSlots(100, 40, 2);
    expect(slots.length).toBe(2);
    expect(slots[0].lo).toBe(100);
    expect(slots[1].lo + slots[1].w).toBeCloseTo(140, 6);
    expect(slots[1].lo).toBeGreaterThan(slots[0].lo + slots[0].w);
    expect(splitSlots(0, 40, 0)).toEqual([]);
  });

  test("the label names a named part only", () => {
    expect(splitLabelText("Sub", "+10")).toBe("Sub +10");
    expect(splitLabelText("", "-14")).toBe("-14");
    expect(splitLabelText("  ", "-14")).toBe("-14");
  });
});


function ocdDv(opts: { layout?: string; vertical?: boolean; position?: string; wrap?: boolean } = {}): Any {
  const dv: Any = dvBuild({
    cats: [
      { name: "Division", values: ["Proforma", "France", "OB", "OB", "Totem", "End"] },
      { name: "Split", values: [null, null, null, "Sub", null, null], isLegend: true }
    ],
    vals: [{ name: "EBITDAaL", role: "actual", values: [100, 20, -14, 10, 40, 156] }]
  });
  dv.metadata.objects = {
    general: { orientation: opts.vertical ? "vertical" : "horizontal" },
    grandTotal: { showGrandTotal: false },
    ...(opts.layout ? { legend: { layout: opts.layout, ...(opts.wrap ? { splitLabelWrap: true } : {}) } } : {}),
    ...(opts.position ? { bridges: { labelPosition: opts.position } } : {})
  };
  return dv;
}

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

const num = (el: Element, a: string): number => Number(el.getAttribute(a));

describe("Split bridges — horizontal render", () => {
  const OB = 2;

  test("default layout is the historical stacking, byte-identical", () => {
    const a = run(ocdDv()).target.innerHTML;
    const b = run(ocdDv({ layout: "stacked" })).target.innerHTML;
    expect(b).toBe(a);
  });

  test("the split bridge draws one sub-bar per part, side by side", () => {
    const { target } = run(ocdDv({ layout: "subBridges" }));
    const rects = barRects(target, OB);
    expect(rects.length).toBe(2);
    const [rest, part] = rects;
    expect(num(part, "x")).toBeGreaterThan(num(rest, "x") + num(rest, "width"));
    const bottom = (r: Element) => num(r, "y") + num(r, "height");
    expect(bottom(part)).toBeCloseTo(bottom(rest), 0);
    expect(num(rest, "height")).toBeGreaterThan(num(part, "height"));
  });

  test("categories without a split — and every pillar — stay ONE plain bar", () => {
    const { target } = run(ocdDv({ layout: "subBridges" }));
    for (const i of [0, 1, 3, 4]) expect(barRects(target, i).length).toBe(1);
  });

  test("each part is coloured by ITS OWN fx resolution (sign rule)", () => {
    const { target } = run(ocdDv({ layout: "subBridges" }));
    const [rest, part] = barRects(target, OB);
    expect(rest.getAttribute("fill")).toBe(FX_NEG);
    expect(part.getAttribute("fill")).toBe(FX_POS);
  });

  test("labels: « Sub +10 » for the named part, the bare value for the rest", () => {
    const { target } = run(ocdDv({ layout: "subBridges" }));
    const texts = labelTexts(target, OB).map((t) => t.textContent || "");
    expect(texts.length).toBe(2);
    expect(texts[0]).not.toMatch(/Sub/);
    expect(texts[0]).toMatch(/14/);
    expect(texts[1]).toMatch(/^Sub \+10$/);
    expect(texts.some((t) => /(^|[^0-9])4$/.test(t) && !/14/.test(t))).toBe(false);
  });

  test("no swatch strip — the colours do not encode the legend any more", () => {
    const stacked = run(ocdDv()).target;
    expect(stacked.querySelectorAll("[data-legend-idx]").length).toBeGreaterThan(0);
    const split = run(ocdDv({ layout: "subBridges" })).target;
    expect(split.querySelectorAll("[data-legend-idx]").length).toBe(0);
  });

  test("the Y range reserves a mixed-sign dip", () => {
    const dv: Any = dvBuild({
      cats: [
        { name: "Cat", values: ["S", "X", "X", "E"] },
        { name: "L", values: [null, null, "P", null], isLegend: true }
      ],
      vals: [{ name: "V", role: "actual", values: [10, -30, 25, 5] }]
    });
    dv.metadata.objects = { legend: { layout: "subBridges" } };
    const split = run(dv).v.lastValidRenderInput.layout;
    expect(split.minVisual).toBeCloseTo(-20, 6);
    dv.metadata.objects = {};
    const stacked = run(dv).v.lastValidRenderInput.layout;
    expect(stacked.minVisual).toBeCloseTo(0, 6);
  });

  test("center position applies to the parts too", () => {
    const { target } = run(ocdDv({ layout: "subBridges", position: "center" }));
    const rects = barRects(target, OB);
    const texts = labelTexts(target, OB);
    rects.forEach((r, k) => {
      expect(Math.abs(num(texts[k], "x") - (num(r, "x") + num(r, "width") / 2))).toBeLessThan(0.15);
    });
  });

  test("connectors still meet the bridge's running levels", () => {
    const CONN = "#123456";
    const dv = ocdDv({ layout: "subBridges" });
    dv.metadata.objects.connectors = {
      showConnectors: true,
      connectorColor: { solid: { color: CONN } }
    };
    const { v, target } = run(dv);
    const lines = Array.from(target.querySelectorAll("line")).filter(
      (l) => l.getAttribute("stroke") === CONN
    );
    expect(lines.length).toBe(4);
    const items = v.lastValidRenderInput.layout.items;
    expect(items[OB].runningBefore).toBeCloseTo(120, 6);
    expect(items[OB].runningAfter).toBeCloseTo(116, 6);
    const [rest, part] = barRects(target, OB);
    expect(num(lines[1], "y1")).toBeCloseTo(num(rest, "y"), 0);
    expect(num(lines[2], "y1")).toBeCloseTo(num(part, "y"), 0);
  });
});

describe("Split bridges — vertical render", () => {
  test("parts share the row thickness, stacked top→bottom", () => {
    const { target } = run(ocdDv({ layout: "subBridges", vertical: true }));
    const [rest, part] = barRects(target, 2);
    expect(num(part, "y")).toBeGreaterThan(num(rest, "y") + num(rest, "height"));
    expect(num(part, "x")).toBeCloseTo(num(rest, "x"), 0);
    expect(num(rest, "width")).toBeGreaterThan(num(part, "width"));
    const texts = labelTexts(target, 2);
    expect(texts[0].getAttribute("text-anchor")).toBe("end");
    expect(texts[1].getAttribute("text-anchor")).toBe("start");
    expect(texts[1].textContent).toBe("Sub +10");
  });
});

describe("Split bridges — comparison mode", () => {
  test("synth bridges split per legend value on the measure delta", () => {
    const dv: Any = dvBuild({
      cats: [
        { name: "Division", values: ["France", "OB", "OB"] },
        { name: "Split", values: [null, null, "Sub"], isLegend: true }
      ],
      vals: [
        { name: "PY", role: "actual", values: [50, 100, 20] },
        { name: "AC", role: "actual", values: [128, 86, 30] }
      ]
    });
    dv.metadata.objects = { general: { mode: "comparison" }, legend: { layout: "subBridges" } };
    const { v, target } = run(dv);
    expect(v.cachedCategoryDisplay.map((c: Any) => c.label)).toEqual([
      "PY",
      "France",
      "OB",
      "AC"
    ]);
    expect(barRects(target, 1).length).toBe(1);
    expect(barRects(target, 2).length).toBe(2);
    expect(labelTexts(target, 2).map((t) => t.textContent)[1]).toBe("Sub +10");
  });
});

describe("Split bridges — format pane", () => {
  const legendSliceNames = (v: Any): string[] => {
    const model = v.getFormattingModel();
    const card = model.cards.find((c: Any) => c.uid === "legend-card");
    return card.groups.flatMap((g: Any) =>
      (g.slices || []).map((s: Any) => s.control?.properties?.descriptor?.propertyName)
    );
  };

  test("stacked: the strip and per-value colour groups are there", () => {
    const { v } = run(ocdDv());
    const names = legendSliceNames(v);
    expect(names).toContain("layout");
    expect(names).toContain("position");
    expect(names.some((n: string) => /^itemColor\d+$/.test(n))).toBe(true);
    expect(v.formattingSettings.bridges.colorBridge.visible).toBe(false);
  });

  test("split: only the layout remains; the bridge colour picker comes back", () => {
    const { v } = run(ocdDv({ layout: "subBridges" }));
    const names = legendSliceNames(v).filter(Boolean);
    expect(names).toEqual(["layout", "splitLabelWrap"]);
    expect(v.formattingSettings.bridges.colorBridge.visible).toBe(true);
    expect(v.formattingSettings.pillars.pillarColor.visible).toBe(true);
  });

  test("switching back to stacked restores every slice", () => {
    const v: Any = makeVisual();
    const upd = (dv: Any) =>
      v.update({ dataViews: [dv], viewport: { width: 760, height: 480 }, type: 2 });
    upd(ocdDv({ layout: "subBridges" }));
    v.getFormattingModel();
    upd(ocdDv());
    expect(legendSliceNames(v)).toContain("position");
  });
});

describe("Split bridges — tooltip", () => {
  test("segment rows carry the painted colour, not the legend swatch", () => {
    const { v } = run(ocdDv({ layout: "subBridges" }));
    const ob = v.cachedCategoryDisplay[2];
    const items = buildTooltipItems(ob, 2, v.buildTooltipContext());
    const byName = (n: string): Any => items.find((it: Any) => it.displayName === n);
    expect(byName("(blank)").color).toBe(FX_NEG);
    expect(byName("Sub").color).toBe(FX_POS);
  });

  test("stacked layout keeps the legend swatch on segment rows", () => {
    const { v } = run(ocdDv());
    const ob = v.cachedCategoryDisplay[2];
    const items = buildTooltipItems(ob, 2, v.buildTooltipContext());
    const ocdRow: Any = items.find((it: Any) => it.displayName === "Sub");
    const ocdLegend = v.cachedLegendValues.find((lv: Any) => lv.label === "Sub");
    expect(ocdRow.color).toBe(ocdLegend.color);
  });
});

describe("Split bridges — wrap part labels", () => {
  const OB2 = 2;
  const partLabel = (target: HTMLElement): SVGTextElement => {
    const t = labelTexts(target, OB2).find((el) => /Sub/.test(el.textContent || ""));
    expect(t).toBeTruthy();
    return t!;
  };

  test("off (default): the 1.5.0.0 single line « Sub +10 », no tspan", () => {
    const { target } = run(ocdDv({ layout: "subBridges" }));
    const t = partLabel(target);
    expect(t.textContent).toBe("Sub +10");
    expect(t.querySelectorAll("tspan").length).toBe(0);
  });

  test("on, horizontal: two tspans — name first, value second — both anchored on the same x", () => {
    const { target } = run(ocdDv({ layout: "subBridges", wrap: true }));
    const t = partLabel(target);
    const spans = Array.from(t.querySelectorAll("tspan"));
    expect(spans.map((s) => s.textContent)).toEqual(["Sub", "+10"]);
    expect(spans[0].getAttribute("x")).toBe(spans[1].getAttribute("x"));
    expect(Number(spans[1].getAttribute("dy"))).toBeGreaterThan(0);
    const rest = labelTexts(target, OB2).find((el) => /14/.test(el.textContent || ""))!;
    expect(rest.querySelectorAll("tspan").length).toBe(0);
  });

  test("on, vertical: same two lines, the block stays centred on the row", () => {
    const { target } = run(ocdDv({ layout: "subBridges", wrap: true, vertical: true }));
    const t = partLabel(target);
    expect(Array.from(t.querySelectorAll("tspan")).map((s) => s.textContent)).toEqual(["Sub", "+10"]);
    const [, part] = barRects(target, OB2);
    const rowCentre = num(part, "y") + num(part, "height") / 2;
    const y0 = num(t, "y");
    const dy = Number(t.querySelectorAll("tspan")[1].getAttribute("dy"));
    expect(y0).toBeLessThan(rowCentre + 2);
    expect(y0 + dy).toBeGreaterThan(rowCentre - 2);
  });

  test("the pane shows the toggle only in the Split bridges layout", () => {
    const split = run(ocdDv({ layout: "subBridges" })).v;
    split.getFormattingModel();
    expect(split.formattingSettings.legend.splitLabelWrap.visible).toBe(true);
    const stacked = run(ocdDv()).v;
    stacked.getFormattingModel();
    expect(stacked.formattingSettings.legend.splitLabelWrap.visible).toBe(false);
  });
});
