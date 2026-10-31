
import { makeVisual, makeMockHost, dvBuild, barRectOf, FX_NEG, FX_POS } from "./_harness";
import {
  applyFixedScale,
  impactOf,
  niceTicks,
  parseImpactPolarity,
  parseScenario,
  parseScenarioOverride,
  resolveScenario,
  scenarioPaint,
  uniformScaleDecimals
} from "../src/ibcs";
import { formatActualLabel, labelScaleDivisor } from "../src/format";
import { Visual } from "../src/visual";
import { VisualFormattingSettingsModel } from "../src/settings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const DARK = "#404040";
const PREV = "#a6a6a6";
const GOOD = "#8cb400";
const BAD = "#ff0000";
const NEUTRAL = "#a6a6a6";

function render(dv: Any, viewport = { width: 760, height: 420 }, host?: Any): { v: Any; target: HTMLElement } {
  let v: Any;
  if (host) {
    const target = document.createElement("div");
    document.body.appendChild(target);
    v = new Visual({ host, element: target } as Any);
    v.formattingSettings = new VisualFormattingSettingsModel();
  } else {
    v = makeVisual();
  }
  v.update({ dataViews: [dv], viewport, type: 2 });
  return { v, target: v.target as HTMLElement };
}

function scenarioDv(objects: Record<string, unknown>, perMeasure?: Record<string, string>): Any {
  const dv: Any = dvBuild({
    cats: [{ name: "BU", values: ["North", "South"] }],
    vals: [
      { name: "PY", role: "actual", values: [100, 80] },
      { name: "PL", role: "actual", values: [110, 85] },
      { name: "FC", role: "actual", values: [108, 90] },
      { name: "AC", role: "actual", values: [112, 88] }
    ]
  });
  if (perMeasure) {
    for (const col of dv.categorical.values) {
      const sc = perMeasure[col.source.displayName];
      if (sc) col.source.objects = { pillars: { scenarioOverride: sc } };
    }
  }
  dv.metadata.objects = { general: { mode: "comparison" }, ...objects };
  return dv;
}

const OPEX_LINES = ["Personnel", "IT", "Marketing", "Rent", "Travel"];
function opexDv(objects: Record<string, unknown>): Any {
  const dv: Any = dvBuild({
    cats: [{ name: "Cost line", values: OPEX_LINES }],
    vals: [
      { name: "PY", role: "actual", values: [2350, 610, 640, 420, 180] },
      { name: "AC", role: "actual", values: [2290, 705, 830, 425, 140] }
    ]
  });
  dv.metadata.objects = { general: { mode: "comparison", ...((objects.general as object) || {}) }, ...objects };
  (dv.metadata.objects as Any).general.mode = "comparison";
  return dv;
}

const fillOf = (target: HTMLElement, idx: number): string =>
  String(barRectOf(target, idx)?.getAttribute("fill") || "");


describe("IBCS pure — scenario notation", () => {
  test("parse: unknown → none (global) / default (per pillar); explicit none survives", () => {
    expect(parseScenario("AC")).toBe("AC");
    expect(parseScenario("BU")).toBe("none");
    expect(parseScenario(undefined)).toBe("none");
    expect(parseScenarioOverride("FC")).toBe("FC");
    expect(parseScenarioOverride("none")).toBe("none");
    expect(parseScenarioOverride("xyz")).toBe("default");
  });
  test("resolve: override wins, default follows the global", () => {
    expect(resolveScenario("AC", undefined)).toBe("AC");
    expect(resolveScenario("AC", "default")).toBe("AC");
    expect(resolveScenario("AC", "PY")).toBe("PY");
    expect(resolveScenario("AC", "none")).toBe("none");
  });
  test("paint: AC solid dark, PY solid light, PL outlined, FC hatched, none → null", () => {
    const c = { dark: DARK, previous: PREV };
    expect(scenarioPaint("AC", c)).toEqual({ variant: "solid", color: DARK });
    expect(scenarioPaint("PY", c)).toEqual({ variant: "solid", color: PREV });
    expect(scenarioPaint("PL", c)).toEqual({ variant: "outlined", color: DARK });
    expect(scenarioPaint("FC", c)).toEqual({ variant: "hatched", color: DARK });
    expect(scenarioPaint("none", c)).toBeNull();
  });
});

describe("IBCS pure — impact", () => {
  const hb = { polarity: "higherBetter" as const, inverted: false, neutral: 0 };
  test("higher is better: gain good, loss bad, zero neutral", () => {
    expect(impactOf(5, hb)).toBe("good");
    expect(impactOf(-5, hb)).toBe("bad");
    expect(impactOf(0, hb)).toBe("neutral");
  });
  test("higher is worse (cost measure) and a per-category inversion flip it", () => {
    expect(impactOf(5, { ...hb, polarity: "higherWorse" })).toBe("bad");
    expect(impactOf(5, { ...hb, inverted: true })).toBe("bad");
    expect(impactOf(5, { polarity: "higherWorse", inverted: true, neutral: 0 })).toBe("good");
  });
  test("neutral threshold is inclusive and sign-blind; NaN is neutral", () => {
    expect(impactOf(10, { ...hb, neutral: 10 })).toBe("neutral");
    expect(impactOf(-10, { ...hb, neutral: 10 })).toBe("neutral");
    expect(impactOf(10.5, { ...hb, neutral: 10 })).toBe("good");
    expect(impactOf(NaN, hb)).toBe("neutral");
  });
  test("polarity parse defaults to higher is better", () => {
    expect(parseImpactPolarity("higherWorse")).toBe("higherWorse");
    expect(parseImpactPolarity(undefined)).toBe("higherBetter");
  });
});

describe("IBCS pure — fixed scale", () => {
  const auto = { yMin: 0, yMax: 1210 };
  test("both 0 = the auto range, untouched (the default)", () => {
    expect(applyFixedScale(auto, { min: 0, max: 1150 }, { min: 0, max: 0 })).toEqual({
      ...auto,
      overflow: false
    });
  });
  test("a fixed max the data fits under replaces the auto max", () => {
    expect(applyFixedScale(auto, { min: 0, max: 1150 }, { min: 0, max: 5000 })).toEqual({
      yMin: 0,
      yMax: 5000,
      overflow: false
    });
  });
  test("data past the bound: keep the auto max (never hide data) and flag it", () => {
    expect(applyFixedScale(auto, { min: 0, max: 1150 }, { min: 0, max: 1000 })).toEqual({
      ...auto,
      overflow: true
    });
  });
  test("a fixed min below zero for negative waterfalls; overflow on that side too", () => {
    const a = { yMin: -900, yMax: 0 };
    expect(applyFixedScale(a, { min: -850, max: 0 }, { min: -2000, max: 0 }).yMin).toBe(-2000);
    expect(applyFixedScale(a, { min: -850, max: 0 }, { min: -500, max: 0 }).overflow).toBe(true);
  });
  test("round ticks: 4 500 tops at 4 000, 5 000 reaches 5 000, no −0", () => {
    expect(niceTicks(0, 4500)).toEqual([0, 1000, 2000, 3000, 4000]);
    expect(niceTicks(0, 5000)).toEqual([0, 1000, 2000, 3000, 4000, 5000]);
    expect(niceTicks(0, 15000)).toEqual([0, 5000, 10000, 15000]);
    expect(Object.is(niceTicks(0, 5000)[0], -0)).toBe(false);
    expect(niceTicks(-1000, 2500)).toEqual([-1000, 0, 1000, 2000]);
    expect(niceTicks(5, 5)).toEqual([5]);
  });
});

describe("IBCS pure — homogeneous numbers", () => {
  test("uniform decimals = the most any label would need, at that divisor", () => {
    expect(uniformScaleDecimals([2350, -60, 95, 4390], 1e3)).toBe(2);
    expect(uniformScaleDecimals([2000, 3000], 1e3)).toBe(0);
    expect(uniformScaleDecimals([12.34, 5.6], 0)).toBe(0);
  });
  test("labelScaleDivisor mirrors formatActualLabel's branches", () => {
    expect(labelScaleDivisor("auto", false, 4390)).toBe(1e3);
    expect(labelScaleDivisor("auto", true, 4390)).toBe(0);
    expect(labelScaleDivisor("millions", true, 10)).toBe(1e6);
    expect(labelScaleDivisor("none", false, 4e6)).toBe(0);
  });
  test("formatActualLabel: uniformDecimals replaces the per-label auto precision", () => {
    const base = { modelFormat: "", cardUnits: "auto", cardDecimals: 0, autoDecimals: 0, locale: "en-US", dataMaxAbs: 4390 };
    expect(formatActualLabel({ ...base, value: 2000 })).toBe("2K");
    expect(formatActualLabel({ ...base, value: 2000, uniformDecimals: 2 })).toBe("2.00K");
    expect(formatActualLabel({ ...base, value: 2000, cardDecimals: 1, uniformDecimals: 2 })).toBe("2.0K");
  });
  test("formatActualLabel: stripSuffixDivisor drops the K only at that scale", () => {
    const base = { modelFormat: "", cardUnits: "auto", cardDecimals: 0, autoDecimals: 0, locale: "en-US", dataMaxAbs: 4390 };
    expect(formatActualLabel({ ...base, value: 2350, uniformDecimals: 2, stripSuffixDivisor: 1e3 })).toBe("2.35");
    expect(formatActualLabel({ ...base, value: 95, withSign: true, uniformDecimals: 2, stripSuffixDivisor: 1e3 })).toBe("+0.10");
    expect(
      formatActualLabel({ ...base, cardUnits: "millions", value: 2.5e6, cardDecimals: 1, stripSuffixDivisor: 1e3 })
    ).toBe("2.5M");
    expect(
      formatActualLabel({ ...base, modelFormat: "+#,##0.0;-#,##0.0", cardUnits: "thousands", value: 2350, stripSuffixDivisor: 1e3 })
    ).toBe("+2.4");
  });
});


describe("IBCS render — scenario notation", () => {
  test("per measure: PY light grey, PL outlined, FC hatched, AC dark — over the fx rule", () => {
    const { target } = render(scenarioDv({}, { PY: "PY", PL: "PL", FC: "FC", AC: "AC" }));
    expect(fillOf(target, 0)).toBe(PREV);
    const pl = barRectOf(target, 3)!;
    expect(pl.getAttribute("stroke")).toBe(DARK);
    expect(pl.getAttribute("fill")).not.toBe(DARK);
    expect(fillOf(target, 6)).toMatch(/^url\(#/);
    expect(fillOf(target, 9)).toBe(DARK);
  });
  test("global scenario applies to every pillar; a per-pillar None opts one out", () => {
    const { target } = render(scenarioDv({ pillars: { scenario: "AC" } }, { PY: "none" }));
    expect(fillOf(target, 3)).toBe(DARK);
    expect(fillOf(target, 9)).toBe(DARK);
    expect(fillOf(target, 0)).not.toBe(DARK);
  });
  test("scenario colours come from the two pickers", () => {
    const { target } = render(
      scenarioDv(
        { pillars: { scenarioColor: { solid: { color: "#112233" } }, scenarioColorPrevious: { solid: { color: "#ccddee" } } } },
        { PY: "PY", AC: "AC" }
      )
    );
    expect(fillOf(target, 0)).toBe("#ccddee");
    expect(fillOf(target, 9)).toBe("#112233");
  });
  test("cumulative: category pillars take the global scenario, bridges are untouched", () => {
    const dv: Any = dvBuild({
      cats: [
        {
          name: "Line",
          values: ["Revenue", "COGS", "GM"],
          objects: [true, false, true].map((f) => ({ pillars: { isPillar: f } }))
        }
      ],
      vals: [{ name: "AC", role: "actual", values: [100, -40, 60] }]
    });
    dv.metadata.objects = { grandTotal: { showGrandTotal: false }, pillars: { scenario: "PY" } };
    const { target } = render(dv);
    expect(fillOf(target, 0)).toBe(PREV);
    expect(fillOf(target, 2)).toBe(PREV);
    expect(fillOf(target, 1)).toBe(FX_NEG);
  });
  test("an inside label on a solid dark scenario pillar turns white; without a scenario it does not", () => {
    const labelFill = (objects: Record<string, unknown>) => {
      const { target } = render(scenarioDv(objects), { width: 760, height: 200 });
      const t = Array.from(target.querySelectorAll('g.wf-clickable[data-cat-idx="9"] text')).find(
        (x) => x.textContent === "200"
      );
      expect(t).toBeDefined();
      return (t!.getAttribute("fill") || "").toLowerCase();
    };
    expect(labelFill({ pillars: { scenario: "AC" } })).toBe("#ffffff");
    expect(labelFill({})).toBe("#000000");
  });
  test("high contrast keeps the host foreground on scenario pillars", () => {
    const host: Any = makeMockHost();
    host.colorPalette = {
      ...host.colorPalette,
      isHighContrast: true,
      foreground: { value: "#ffff00" },
      background: { value: "#000000" },
      hyperlink: { value: "#00ffff" },
      foregroundSelected: { value: "#ffff00" }
    };
    const { target } = render(scenarioDv({ pillars: { scenario: "AC" } }), undefined, host);
    expect(fillOf(target, 9)).toBe("#ffff00");
  });
});

describe("IBCS render — bridge colour by impact", () => {
  test("Single color (default): bridges keep the fx rule colour — even where it misleads", () => {
    const { target } = render(opexDv({}));
    expect(fillOf(target, 1)).toBe(FX_POS);
    expect(fillOf(target, 2)).toBe(FX_POS);
    expect(fillOf(target, 1)).not.toBe(FX_NEG);
  });
  test("Impact, higher is better: gain good, loss bad — bar AND label, over the fx rule", () => {
    const { target } = render(opexDv({ bridges: { colorMode: "impact" } }));
    expect(fillOf(target, 1)).toBe(BAD);
    expect(fillOf(target, 2)).toBe(GOOD);
    const label = target.querySelector('g.wf-clickable[data-cat-idx="2"] text');
    expect((label?.getAttribute("fill") || "").toLowerCase()).toBe(GOOD);
  });
  test("Impact, higher is worse + neutral threshold: the cost reading", () => {
    const { target } = render(
      opexDv({ bridges: { colorMode: "impact", impactPolarity: "higherWorse", neutralThreshold: 10 } })
    );
    expect(fillOf(target, 1)).toBe(GOOD);
    expect(fillOf(target, 2)).toBe(BAD);
    expect(fillOf(target, 3)).toBe(BAD);
    expect(fillOf(target, 4)).toBe(NEUTRAL);
    expect(fillOf(target, 5)).toBe(GOOD);
  });
  test("inverted categories flip the listed lines only (trimmed, case-insensitive)", () => {
    const { target } = render(
      opexDv({ bridges: { colorMode: "impact", invertedList: " it ;MARKETING" } })
    );
    expect(fillOf(target, 1)).toBe(BAD);
    expect(fillOf(target, 2)).toBe(BAD);
    expect(fillOf(target, 3)).toBe(BAD);
    expect(fillOf(target, 4)).toBe(GOOD);
  });
  test("custom good / bad colours", () => {
    const { target } = render(
      opexDv({
        bridges: {
          colorMode: "impact",
          colorGood: { solid: { color: "#0000aa" } },
          colorBad: { solid: { color: "#aa0000" } }
        }
      })
    );
    expect(fillOf(target, 1)).toBe("#aa0000");
    expect(fillOf(target, 2)).toBe("#0000aa");
  });
});

describe("IBCS render — identical scales", () => {
  function buDv(f: number, yAxis: Record<string, unknown>): Any {
    const dv: Any = dvBuild({
      cats: [{ name: "Driver", values: ["Volume", "Price"] }],
      vals: [
        { name: "PY", role: "actual", values: [2400 * f, 900 * f] },
        { name: "AC", role: "actual", values: [2650 * f, 960 * f] }
      ]
    });
    dv.metadata.objects = { general: { mode: "comparison" }, yAxis };
    return dv;
  }
  const height = (t: HTMLElement, i: number) => Number(barRectOf(t, i)!.getAttribute("height"));

  test("same Scale max on two visuals: pillar heights are proportional to the values", () => {
    const a = render(buDv(1, { scaleMax: 5000 })).target;
    const b = render(buDv(0.4, { scaleMax: 5000 })).target;
    expect(height(b, 0) / height(a, 0)).toBeCloseTo(0.4, 2);
  });
  test("auto scale (default): both fill the frame — the comparison the rule forbids", () => {
    const a = render(buDv(1, {})).target;
    const b = render(buDv(0.4, {})).target;
    expect(height(b, 0) / height(a, 0)).toBeGreaterThan(0.9);
  });
  test("round ticks on a fixed scale: the top tick reads the bound", () => {
    const t = render(buDv(1, { scaleMax: 5000 })).target;
    const ticks = Array.from(t.querySelectorAll("text"))
      .map((x) => x.textContent || "")
      .filter((s) => /^-?\d+(\.\d+)?K$/.test(s));
    expect(ticks).toContain("5K");
    expect(ticks).toContain("0K");
    expect(ticks).not.toContain("-0K");
  });
  test("overflow: data past the bound widens the axis and raises the warning icon", () => {
    const host: Any = makeMockHost();
    const warn = jest.fn();
    host.displayWarningIcon = warn;
    const t = render(buDv(1, { scaleMax: 1000 }), undefined, host).target;
    expect(warn).toHaveBeenCalledWith("Scale widened", expect.stringContaining("Scale max"));
    expect(height(t, 0)).toBeGreaterThan(50);
  });
  test("no fixed bound: no warning", () => {
    const host: Any = makeMockHost();
    const warn = jest.fn();
    host.displayWarningIcon = warn;
    render(buDv(1, {}), undefined, host);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("IBCS render — homogeneous numbers", () => {
  const texts = (t: HTMLElement) => Array.from(t.querySelectorAll("text")).map((x) => x.textContent || "");

  test("default: per-label decimals, K on every label", () => {
    const all = texts(render(opexDv({})).target);
    expect(all).toContain("4K");
    expect(all).toContain("-0.06K");
  });
  test("uniform decimals: every pillar and bridge label carries the same count", () => {
    const all = texts(render(opexDv({ general: { uniformDecimals: true } })).target);
    for (const s of ["4.20K", "4.39K", "-0.06K", "+0.10K", "+0.19K"]) expect(all).toContain(s);
  });
  test("unit suffix off: no K on labels or ticks, the unit written once", () => {
    const t = render(opexDv({ general: { uniformDecimals: true, unitSuffix: false } })).target;
    const all = texts(t);
    expect(all.filter((s) => /K$/.test(s))).toEqual(["in K"]);
    expect(all).toContain("4.20");
    expect(all).toContain("+0.10");
    const note = t.querySelector("text.wf-unit-note");
    expect(note?.textContent).toBe("in K");
  });
  test("unit suffix off on unscaled data: nothing to strip, no note", () => {
    const dv: Any = dvBuild({
      cats: [{ name: "Line", values: ["A", "B"] }],
      vals: [
        { name: "PY", role: "actual", values: [40, 30] },
        { name: "AC", role: "actual", values: [45, 28] }
      ]
    });
    dv.metadata.objects = { general: { mode: "comparison", unitSuffix: false } };
    const t = render(dv).target;
    expect(t.querySelector("text.wf-unit-note")).toBeNull();
  });
  test("vertical orientation: the note sits top-left and the frame makes room", () => {
    const t = render(opexDv({ general: { orientation: "vertical", unitSuffix: false } })).target;
    const note = t.querySelector("text.wf-unit-note");
    expect(note).not.toBeNull();
    expect(Number(note!.getAttribute("x"))).toBeLessThan(10);
  });
});

describe("IBCS pane", () => {
  test("Impact knobs only show in Impact mode; the single colour leaves then", () => {
    const v: Any = makeVisual();
    v.update({ dataViews: [opexDv({})], viewport: { width: 700, height: 400 }, type: 2 });
    const uids = (fm: Any) =>
      fm.cards.flatMap((c: Any) => c.groups.flatMap((g: Any) => (g.slices || []).map((s: Any) => s.uid)));
    const single = uids(v.getFormattingModel());
    expect(single).toContain("bridges-colorMode");
    expect(single).toContain("bridges-colorBridge");
    expect(single).not.toContain("bridges-colorGood");

    const v2: Any = makeVisual();
    v2.update({ dataViews: [opexDv({ bridges: { colorMode: "impact" } })], viewport: { width: 700, height: 400 }, type: 2 });
    const impact = uids(v2.getFormattingModel());
    expect(impact).toContain("bridges-colorGood");
    expect(impact).toContain("bridges-invertedList");
    expect(impact).not.toContain("bridges-colorBridge");
  });
  test("per-measure pillar groups lead with the Scenario dropdown, echoing the persisted value", () => {
    const v: Any = makeVisual();
    v.update({
      dataViews: [scenarioDv({}, { PL: "PL" })],
      viewport: { width: 700, height: 400 },
      type: 2
    });
    v.getFormattingModel();
    const g = v.formattingSettings.pillars.groups.find((x: Any) => x.name === "pillarsMeasure_PL");
    const sc = g.slices.find((s: Any) => s.name === "scenarioOverride");
    expect(sc).toBeDefined();
    expect(sc.value.value).toBe("PL");
  });
});
