/**
 * Variance rails — position (top / bottom) and style (bars / pin / labels).
 *
 * DOM-level coverage of the feat/variance-rails-position-styles feature:
 *  - "bottom" stacks chart → X labels → rails → analysis table, while the
 *    horizontal alignment of the rail marks on the bars stays EXACT;
 *  - "pin" renders an IBCS lollipop (thin stem + round head) with the same
 *    sign colours and interactivity attributes as the classic bars;
 *  - "labels" renders the signed value alone (▲/▼ marker, no geometry,
 *    no baseline line) — even when showDataLabels is off;
 *  - the new dropdowns persist / read back through metadata.objects and
 *    surface in the pane's rails Layout group;
 *  - high-contrast overrides apply to the new geometry.
 */

import { Visual } from "../src/visual";
import { VisualFormattingSettingsModel } from "../src/settings";
import { makeVisual, makeMockHost, dvBuild } from "./_harness";

const THEME_POS = "#50be87";
const THEME_NEG = "#dd3f3f";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** 2 cats (both default pillars in cumulative mode → variance shown on
 *  each) + one variance measure. `railsObjects` lands on metadata.objects
 *  .rails; `withTable` adds a single-value analysisDim so the footnote
 *  table renders (grand total off to keep the column count stable). */
function railDv(opts: {
  railsObjects?: Record<string, unknown>;
  withTable?: boolean;
  varianceValues?: number[];
}): Any {
  const dv: Any = dvBuild({
    cats: [
      { name: "Cat", values: ["A", "B"] },
      ...(opts.withTable
        ? [{ name: "Region", values: ["E", "E"], isAnalysisDim: true }]
        : [])
    ],
    vals: [
      { name: "Sales", role: "actual", values: [100, 120] },
      {
        name: "Var",
        role: "variance",
        values: opts.varianceValues ?? [50, -100],
        format: "#,##0"
      }
    ]
  });
  dv.metadata.objects = {
    grandTotal: { showGrandTotal: false },
    ...(opts.railsObjects ? { rails: opts.railsObjects } : {})
  };
  return dv;
}

function run(v: Any, dv: Any): HTMLElement {
  v.update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
  const target = v.target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return target;
}

const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

// Rail bar rects / value labels are the only wf-clickable rect/text emitted
// OUTSIDE any <g> wrapper (chart bars live inside g.wf-bar; X-axis labels
// are top-level too but always carry <tspan> children in the default
// horizontal orientation — rail labels never do).
const railRect = (target: HTMLElement, catIdx: number) =>
  Array.from(
    target.querySelectorAll(`rect.wf-clickable[data-cat-idx="${catIdx}"]`)
  ).find(
    (r) => !r.closest("g") && !r.classList.contains("wf-rail-chip")
  ) as SVGRectElement | undefined;
const railLabel = (target: HTMLElement, catIdx: number) =>
  Array.from(
    target.querySelectorAll(`text.wf-clickable[data-cat-idx="${catIdx}"]`)
  ).find((t) => !t.closest("g") && !t.querySelector("tspan")) as
    | SVGTextElement
    | undefined;
const xAxisLabel = (target: HTMLElement, catIdx: number) =>
  Array.from(
    target.querySelectorAll(`text.wf-clickable[data-cat-idx="${catIdx}"]`)
  ).find((t) => !t.closest("g") && !!t.querySelector("tspan")) as
    | SVGTextElement
    | undefined;
const pinHead = (target: HTMLElement, catIdx: number) =>
  target.querySelector(
    `circle.wf-clickable[data-cat-idx="${catIdx}"]`
  ) as SVGCircleElement | null;
const pinStem = (target: HTMLElement, catIdx: number) =>
  target.querySelector(
    `line.wf-clickable[data-cat-idx="${catIdx}"]`
  ) as SVGLineElement | null;
const triMarker = (target: HTMLElement, catIdx: number) =>
  target.querySelector(
    `path.wf-clickable[data-cat-idx="${catIdx}"]`
  ) as SVGPathElement | null;
/** Bottom edge of the lowest chart bar (g.wf-bar rects). */
function chartBarsBottom(target: HTMLElement): number {
  const rects = Array.from(target.querySelectorAll("g.wf-bar rect"));
  expect(rects.length).toBeGreaterThan(0);
  return Math.max(...rects.map((r) => num(r, "y") + num(r, "height")));
}

describe("rails position — top (default, historical layout)", () => {
  test("default renders rails ABOVE the chart, X labels below", () => {
    const target = run(makeVisual(), railDv({}));
    const rect = railRect(target, 0)!;
    expect(rect).toBeTruthy();
    expect(num(rect, "y") + num(rect, "height")).toBeLessThan(chartBarsBottom(target));
    const xLbl = xAxisLabel(target, 0)!;
    expect(num(xLbl, "y")).toBeGreaterThan(num(rect, "y"));
  });
});

describe("rails position — bottom", () => {
  test("rails sit BELOW the chart and below the X-axis labels", () => {
    const target = run(makeVisual(), railDv({ railsObjects: { position: "bottom" } }));
    const rect0 = railRect(target, 0)!;
    const rect1 = railRect(target, 1)!;
    expect(rect0).toBeTruthy();
    expect(rect1).toBeTruthy();
    const barsBottom = chartBarsBottom(target);
    for (const r of [rect0, rect1]) {
      expect(num(r, "y")).toBeGreaterThan(barsBottom);
    }
    // X labels stay attached to the chart — ABOVE the rails.
    const xLbl = xAxisLabel(target, 0)!;
    expect(xLbl).toBeTruthy();
    expect(num(xLbl, "y")).toBeLessThan(num(rect0, "y"));
  });

  test("with the analysis table: vertical order is chart → rails → table", () => {
    const target = run(
      makeVisual(),
      railDv({ railsObjects: { position: "bottom" }, withTable: true })
    );
    const rect0 = railRect(target, 0)!;
    expect(rect0).toBeTruthy();
    expect(num(rect0, "y")).toBeGreaterThan(chartBarsBottom(target));
    // Table row background starts below the lowest rail element.
    const rowBg = target.querySelector("rect.wf-table-row-bg")!;
    expect(rowBg).toBeTruthy();
    const railBottom = Math.max(
      ...[railRect(target, 0)!, railRect(target, 1)!].map(
        (r) => num(r, "y") + num(r, "height")
      )
    );
    expect(num(rowBg, "y")).toBeGreaterThanOrEqual(railBottom);
    // The max-amplitude NEGATIVE label (cat B, −100) must stay clear of
    // the table too — the bottomLabelAllowance reserved below the band.
    const negLabel = railLabel(target, 1)!;
    expect(negLabel).toBeTruthy();
    expect(num(negLabel, "y")).toBeLessThan(num(rowBg, "y"));
  });

  test("horizontal alignment on the bars is EXACT in both positions", () => {
    const top = run(makeVisual(), railDv({}));
    const bottom = run(makeVisual(), railDv({ railsObjects: { position: "bottom" } }));
    for (const catIdx of [0, 1]) {
      const rTop = railRect(top, catIdx)!;
      const rBottom = railRect(bottom, catIdx)!;
      expect(num(rBottom, "x")).toBeCloseTo(num(rTop, "x"), 5);
      expect(num(rBottom, "width")).toBeCloseTo(num(rTop, "width"), 5);
      // Same amplitude too — only the vertical placement moved.
      expect(num(rBottom, "height")).toBeCloseTo(num(rTop, "height"), 5);
    }
  });

  test("bottom + pin: lollipop lands in the bottom band, aligned on the bar centres", () => {
    const pinTop = run(makeVisual(), railDv({ railsObjects: { railStyle: "pin" } }));
    const pinBottom = run(
      makeVisual(),
      railDv({ railsObjects: { position: "bottom", railStyle: "pin" } })
    );
    for (const catIdx of [0, 1]) {
      const hTop = pinHead(pinTop, catIdx)!;
      const hBottom = pinHead(pinBottom, catIdx)!;
      expect(hTop).toBeTruthy();
      expect(hBottom).toBeTruthy();
      expect(num(hBottom, "cx")).toBeCloseTo(num(hTop, "cx"), 5);
    }
    expect(num(pinHead(pinBottom, 0)!, "cy")).toBeGreaterThan(
      chartBarsBottom(pinBottom)
    );
  });
});

describe("rail style — pin (IBCS lollipop)", () => {
  test("stem + head per category, no histogram rect, sign colours preserved", () => {
    const target = run(makeVisual(), railDv({ railsObjects: { railStyle: "pin" } }));
    // No classic rail rect outside a <g> any more.
    expect(railRect(target, 0)).toBeUndefined();
    expect(railRect(target, 1)).toBeUndefined();
    const head0 = pinHead(target, 0)!;
    const head1 = pinHead(target, 1)!;
    const stem0 = pinStem(target, 0)!;
    expect(head0).toBeTruthy();
    expect(head1).toBeTruthy();
    expect(stem0).toBeTruthy();
    //

    // Sign colours: positive theme green, negative theme red (defaults).
    expect(head0.getAttribute("fill")).toBe(THEME_POS);
    expect(head1.getAttribute("fill")).toBe(THEME_NEG);
    expect(stem0.getAttribute("stroke")).toBe(THEME_POS);
    // Thin stem (IBCS ~1.5–2 px).
    const stemW = Number(stem0.getAttribute("stroke-width"));
    expect(stemW).toBeGreaterThanOrEqual(1.5);
    expect(stemW).toBeLessThanOrEqual(2);
    // Stem runs from the baseline to the head centre.
    expect(num(stem0, "x1")).toBeCloseTo(num(head0, "cx"), 5);
    expect(num(stem0, "y2")).toBeCloseTo(num(head0, "cy"), 5);
    // Positive head above the baseline (stem start), negative head below.
    expect(num(head0, "cy")).toBeLessThan(num(stem0, "y1"));
    expect(num(pinHead(target, 1)!, "cy")).toBeGreaterThan(num(stem0, "y1"));
  });

  test("labels keep the scale-then-format pipeline and clear the head", () => {
    const target = run(makeVisual(), railDv({ railsObjects: { railStyle: "pin" } }));
    const lbl0 = railLabel(target, 0)!;
    const lbl1 = railLabel(target, 1)!;
    expect(lbl0.textContent).toBe("+50");
    expect(lbl1.textContent).toBe("-100");
    // Positive label baseline above the head top, negative below the head bottom.
    const head0 = pinHead(target, 0)!;
    const head1 = pinHead(target, 1)!;
    expect(num(lbl0, "y")).toBeLessThan(num(head0, "cy") - num(head0, "r"));
    expect(num(lbl1, "y")).toBeGreaterThan(num(head1, "cy") + num(head1, "r"));
  });

  test("high contrast: stem + head take the host palette, not the theme colours", () => {
    const HC_FG = "#ffff00";
    const HC_LINK = "#00ffff";
    const target = document.createElement("div");
    document.body.appendChild(target);
    const host = {
      ...makeMockHost(),
      colorPalette: {
        isHighContrast: true,
        foreground: { value: HC_FG },
        background: { value: "#000000" },
        hyperlink: { value: HC_LINK },
        getColor: () => ({ value: "#123456" })
      }
    };
    const v: Any = new Visual({ host, element: target } as Any);
    v.formattingSettings = new VisualFormattingSettingsModel();
    run(v, railDv({ railsObjects: { railStyle: "pin" } }));
    expect(pinHead(target as HTMLElement, 0)!.getAttribute("fill")).toBe(HC_FG);
    expect(pinHead(target as HTMLElement, 1)!.getAttribute("fill")).toBe(HC_LINK);
  });
});

describe("rail style — labels (no histogram)", () => {
  test("no rect / stem / head / baseline line — value + ▲▼ marker only", () => {
    const target = run(makeVisual(), railDv({ railsObjects: { railStyle: "labels" } }));
    expect(railRect(target, 0)).toBeUndefined();
    expect(pinHead(target, 0)).toBeNull();
    expect(pinStem(target, 0)).toBeNull();
    // The rail's dashed centre line is dropped (connectors are off by
    // default, so no top-level "5 4" dashed line may remain).
    const dashedLines = Array.from(target.querySelectorAll("line")).filter(
      (l) => l.getAttribute("stroke-dasharray") === "5 4"
    );
    expect(dashedLines.length).toBe(0);
    // Signed values with the model format string.
    expect(railLabel(target, 0)!.textContent).toBe("+50");
    expect(railLabel(target, 1)!.textContent).toBe("-100");
    // ▲ marker in the positive colour, ▼ in the negative colour.
    const tri0 = triMarker(target, 0)!;
    const tri1 = triMarker(target, 1)!;
    expect(tri0).toBeTruthy();
    expect(tri1).toBeTruthy();
    expect(tri0.getAttribute("fill")).toBe(THEME_POS);
    expect(tri1.getAttribute("fill")).toBe(THEME_NEG);
  });

  test("values render even when showDataLabels is OFF (the label IS the style)", () => {
    const off = run(
      makeVisual(),
      railDv({ railsObjects: { railStyle: "labels", showDataLabels: false } })
    );
    expect(railLabel(off, 0)!.textContent).toBe("+50");
    // Control: bars style with the toggle off renders no rail label.
    const barsOff = run(
      makeVisual(),
      railDv({ railsObjects: { showDataLabels: false } })
    );
    expect(railLabel(barsOff, 0)).toBeUndefined();
  });
});

// ── A2 variants: auto routing, per-measure override, chips, outlined /
//    hatched fills, neutrality threshold ─────────────────────────────────

/** Two variance measures: an absolute Δ ("#,##0") and a ratio ("0.0%") —
 *  the IBCS pairing the "auto" style routes on. `pctObjects` lands on the
 *  % measure's source.objects (per-measure overrides). */
function twoRailDv(opts: {
  railsObjects?: Record<string, unknown>;
  pctObjects?: Record<string, unknown>;
}): Any {
  const dv: Any = dvBuild({
    cats: [{ name: "Cat", values: ["A", "B"] }],
    vals: [
      { name: "Sales", role: "actual", values: [100, 120] },
      { name: "VarAbs", role: "variance", values: [50, -100], format: "#,##0" },
      {
        name: "VarPct",
        role: "variance",
        values: [0.05, -0.1],
        format: "0.0%",
        objects: opts.pctObjects
      }
    ]
  });
  dv.metadata.objects = {
    grandTotal: { showGrandTotal: false },
    ...(opts.railsObjects ? { rails: opts.railsObjects } : {})
  };
  return dv;
}

const railChip = (target: HTMLElement, catIdx: number) =>
  Array.from(
    target.querySelectorAll(`rect.wf-rail-chip[data-cat-idx="${catIdx}"]`)
  ) as SVGRectElement[];

describe("rail style — auto routing and per-measure override (A2)", () => {
  test("auto: absolute rail renders bars, % rail renders pins", () => {
    const target = run(makeVisual(), twoRailDv({ railsObjects: { railStyle: "auto" } }));
    // One histogram rect per category (the absolute rail only)…
    for (const catIdx of [0, 1]) {
      const rects = Array.from(
        target.querySelectorAll(`rect.wf-clickable[data-cat-idx="${catIdx}"]`)
      ).filter((r) => !r.closest("g"));
      expect(rects.length).toBe(1);
      // …and one pin head per category (the % rail only).
      expect(
        target.querySelectorAll(`circle.wf-clickable[data-cat-idx="${catIdx}"]`).length
      ).toBe(1);
    }
  });

  test("per-measure override wins over the global: % rail forced to chips", () => {
    const target = run(
      makeVisual(),
      twoRailDv({
        railsObjects: { railStyle: "auto" },
        pctObjects: { varianceMeasure: { style: "chips" } }
      })
    );
    // No pin heads any more (the % rail no longer routes to pin)…
    expect(target.querySelectorAll("circle.wf-clickable").length).toBe(0);
    // …chips instead, one per category.
    expect(railChip(target, 0).length).toBe(1);
    expect(railChip(target, 1).length).toBe(1);
    // The absolute rail still renders its bars.
    expect(railRect(target, 0)).toBeTruthy();
  });

  test("per-measure style round-trips through the formatting model", () => {
    const v: Any = makeVisual();
    run(v, twoRailDv({ pctObjects: { varianceMeasure: { style: "pin" } } }));
    const vmStyles = v.cachedVarianceMeasures.map((vm: Any) => vm.styleOverride);
    expect(vmStyles).toEqual(["default", "pin"]);
  });
});

describe("rail style — chips (A2)", () => {
  test("sign-coloured pill at low opacity + matching text colour", () => {
    const target = run(makeVisual(), railDv({ railsObjects: { railStyle: "chips" } }));
    const chip0 = railChip(target, 0)[0];
    const chip1 = railChip(target, 1)[0];
    expect(chip0).toBeTruthy();
    expect(chip1).toBeTruthy();
    expect(chip0.getAttribute("fill")).toBe(THEME_POS);
    expect(chip1.getAttribute("fill")).toBe(THEME_NEG);
    expect(chip0.getAttribute("fill-opacity")).toBe("0.15");
    // Fully-rounded pill: rx = height / 2.
    expect(num(chip0, "rx")).toBeCloseTo(num(chip0, "height") / 2, 5);
    // Text pairs with the sign colour.
    expect(railLabel(target, 0)!.getAttribute("fill")).toBe(THEME_POS);
    expect(railLabel(target, 1)!.getAttribute("fill")).toBe(THEME_NEG);
    // No geometry, no baseline line (same contract as "labels").
    expect(railRect(target, 0)).toBeUndefined();
    expect(pinHead(target, 0)).toBeNull();
    const dashedLines = Array.from(target.querySelectorAll("line")).filter(
      (l) => l.getAttribute("stroke-dasharray") === "5 4"
    );
    expect(dashedLines.length).toBe(0);
  });

  test("high contrast: chip = host background + foreground ring and text", () => {
    const HC_FG = "#ffff00";
    const HC_BG = "#000000";
    const target = document.createElement("div");
    document.body.appendChild(target);
    const host = {
      ...makeMockHost(),
      colorPalette: {
        isHighContrast: true,
        foreground: { value: HC_FG },
        background: { value: HC_BG },
        hyperlink: { value: "#00ffff" },
        getColor: () => ({ value: "#123456" })
      }
    };
    const v: Any = new Visual({ host, element: target } as Any);
    v.formattingSettings = new VisualFormattingSettingsModel();
    run(v, railDv({ railsObjects: { railStyle: "chips" } }));
    const chip = railChip(target as HTMLElement, 0)[0];
    expect(chip.getAttribute("fill")).toBe(HC_BG);
    expect(chip.getAttribute("stroke")).toBe(HC_FG);
    expect(railLabel(target as HTMLElement, 0)!.getAttribute("fill")).toBe(HC_FG);
  });
});

describe("rail style — outlined / hatched fills (A2)", () => {
  test("outlined: transparent fill + sign-coloured stroke (hit-target preserved)", () => {
    const target = run(makeVisual(), railDv({ railsObjects: { railStyle: "outlined" } }));
    const r0 = railRect(target, 0)!;
    const r1 = railRect(target, 1)!;
    expect(r0.getAttribute("fill")).toBe("transparent");
    expect(r0.getAttribute("stroke")).toBe(THEME_POS);
    expect(r1.getAttribute("stroke")).toBe(THEME_NEG);
  });

  test("hatched: pattern fill per sign colour + defs emitted once per colour", () => {
    const target = run(makeVisual(), railDv({ railsObjects: { railStyle: "hatched" } }));
    const r0 = railRect(target, 0)!;
    const r1 = railRect(target, 1)!;
    expect(r0.getAttribute("fill")).toBe("url(#wf-hatch-50be87)");
    expect(r1.getAttribute("fill")).toBe("url(#wf-hatch-dd3f3f)");
    const patterns = target.querySelectorAll("defs pattern");
    expect(patterns.length).toBe(2);
    expect(target.querySelector("#wf-hatch-50be87")).toBeTruthy();
  });

  test("outlined + per-measure pin override = hollow head", () => {
    const target = run(
      makeVisual(),
      twoRailDv({
        railsObjects: { railStyle: "outlined" },
        pctObjects: { varianceMeasure: { style: "pin" } }
      })
    );
    const head = pinHead(target, 0)!;
    expect(head).toBeTruthy();
    expect(head.getAttribute("fill")).toBe("transparent");
    expect(head.getAttribute("stroke")).toBe(THEME_POS);
  });
});

describe("rails — neutrality threshold (A2, transverse)", () => {
  test("|value| under the threshold renders neutral grey (geometry + label)", () => {
    // values [50, −300] → maxAbs 300; threshold 20 % (the slider max) →
    // cutoff 60: |50| neutral, |−300| keeps its sentiment colour.
    const target = run(
      makeVisual(),
      railDv({
        railsObjects: { neutralThresholdPct: 20 },
        varianceValues: [50, -300]
      })
    );
    expect(railRect(target, 0)!.getAttribute("fill")).toBe("#808080");
    expect(railLabel(target, 0)!.getAttribute("fill")).toBe("#808080");
    expect(railRect(target, 1)!.getAttribute("fill")).toBe(THEME_NEG);
    expect(railLabel(target, 1)!.getAttribute("fill")).toBe(THEME_NEG);
  });

  test("threshold 0 (default) keeps every sentiment colour", () => {
    const target = run(makeVisual(), railDv({}));
    expect(railRect(target, 0)!.getAttribute("fill")).toBe(THEME_POS);
    expect(railRect(target, 1)!.getAttribute("fill")).toBe(THEME_NEG);
  });
});

describe("formatting model — persistence and pane surface of the new slices", () => {
  test("metadata.objects round-trip: position + railStyle read back into the model", () => {
    const v: Any = makeVisual();
    run(v, railDv({ railsObjects: { position: "bottom", railStyle: "pin" } }));
    const fs = v.formattingSettings;
    expect(fs.rails.position.value.value).toBe("bottom");
    expect(fs.rails.railStyle.value.value).toBe("pin");
  });

  test("defaults: top / bars (zero-regression for saved reports)", () => {
    const v: Any = makeVisual();
    run(v, railDv({}));
    const fs = v.formattingSettings;
    expect(fs.rails.position.value.value).toBe("top");
    expect(fs.rails.railStyle.value.value).toBe("bars");
  });

  test("pane: both dropdowns live in the rails Layout group, descriptors on the rails object", () => {
    const v: Any = makeVisual();
    run(v, railDv({}));
    const fm = v.getFormattingModel();
    const rails = fm.cards.find((c: Any) => c.uid === "rails-card");
    expect(rails).toBeTruthy();
    const layoutGroup = rails.groups.find((g: Any) => g.uid === "railsLayout-group");
    expect(layoutGroup).toBeTruthy();
    const sliceUids = layoutGroup.slices.map((s: Any) => s.uid);
    expect(sliceUids).toContain("rails-position");
    expect(sliceUids).toContain("rails-railStyle");
    for (const s of layoutGroup.slices) {
      expect(s.control.properties.descriptor.objectName).toBe("rails");
    }
  });
});

// ============ VERTICAL PARITY (audit finding GEN-25-b) ============
//
// Until 1.3.2.0 the vertical rails block rendered plain bars: `Variance →
// Style`, the per-measure override and the neutral threshold were all
// silently inert in that orientation, while the pane kept offering them.
// The math is now shared (computeRailMark + transposeRailMark); only the
// emitter differs.

/** Same fixture, vertical orientation. */
function vRailDv(railsObjects: Record<string, unknown>, varianceValues?: number[]): Any {
  const dv = railDv({ railsObjects, varianceValues });
  dv.metadata.objects.general = { orientation: "vertical" };
  return dv;
}
const topLevel = (target: HTMLElement, sel: string) =>
  Array.from(target.querySelectorAll(sel)).filter((e) => !e.closest("g.wf-bar"));

describe("rail styles — VERTICAL parity", () => {
  test("pin: a round head is emitted (it never was in vertical)", () => {
    const plain = run(makeVisual(), vRailDv({ railStyle: "bars" }));
    const pin = run(makeVisual(), vRailDv({ railStyle: "pin" }));
    expect(topLevel(plain, "circle").length).toBe(0);
    expect(topLevel(pin, "circle").length).toBeGreaterThan(0);
  });

  test("pin: the stem is HORIZONTAL here (y1 === y2), unlike the vertical-bar case", () => {
    const t = run(makeVisual(), vRailDv({ railStyle: "pin" }));
    const stems = topLevel(t, "line").filter((l) => l.getAttribute("stroke-width") === "1.5");
    expect(stems.length).toBeGreaterThan(0);
    for (const s of stems) expect(num(s, "y1")).toBeCloseTo(num(s, "y2"), 3);
  });

  test("chips: the pill is emitted and the zero baseline is dropped", () => {
    const t = run(makeVisual(), vRailDv({ railStyle: "chips" }));
    expect(t.querySelectorAll("rect.wf-rail-chip").length).toBeGreaterThan(0);
    // The dashed baseline of a rail column is a <line stroke-dasharray="5 4">.
    const baselines = topLevel(t, 'line[stroke-dasharray="5 4"]');
    expect(baselines.length).toBe(0);
  });

  test("labels: a ▲/▼ marker path appears, with no bar geometry", () => {
    const t = run(makeVisual(), vRailDv({ railStyle: "labels" }));
    expect(topLevel(t, "path").length).toBeGreaterThan(0);
  });

  test("outlined: transparent fill + stroke; hatched: a pattern fill", () => {
    const out = run(makeVisual(), vRailDv({ railStyle: "outlined" }));
    const outRects = topLevel(out, "rect").filter((r) => r.getAttribute("fill") === "transparent");
    expect(outRects.length).toBeGreaterThan(0);
    expect(outRects[0].getAttribute("stroke")).toBeTruthy();

    const hat = run(makeVisual(), vRailDv({ railStyle: "hatched" }));
    const hatRects = topLevel(hat, "rect").filter((r) =>
      (r.getAttribute("fill") || "").startsWith("url(#")
    );
    expect(hatRects.length).toBeGreaterThan(0);
  });

  test("neutral threshold greys BOTH the geometry and the label", () => {
    // 5 is 5 % of the 100 max → under a 20 % threshold.
    const t = run(makeVisual(), vRailDv({ railStyle: "bars", neutralThresholdPct: 20 }, [5, -100]));
    const greys = topLevel(t, 'rect[fill="#808080"]');
    expect(greys.length).toBeGreaterThan(0);
  });

  test("default (bars) is untouched: solid rects, dashed baseline present", () => {
    const t = run(makeVisual(), vRailDv({}));
    expect(topLevel(t, 'line[stroke-dasharray="5 4"]').length).toBeGreaterThan(0);
    expect(topLevel(t, "circle").length).toBe(0);
    expect(t.querySelectorAll("rect.wf-rail-chip").length).toBe(0);
  });
});
