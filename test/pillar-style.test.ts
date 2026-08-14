/**
 * Pillar fill styles (IBCS scenario notation — AC solid, BU/PL outlined,
 * FC hatched) + configurable outline. Pillars ONLY — bridges keep their
 * historical solid rendering; the Grand Total keeps its dedicated-card
 * look (solid — open decision at merge).
 */

import { Visual } from "../src/visual";
import { VisualFormattingSettingsModel } from "../src/settings";
import { makeVisual, makeMockHost, dvBuild } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const PILLAR_C = "#0000aa";

/** 4 cats: A + D default pillars, B/C bridges. Fixed global pillar colour
 *  so stroke/pattern assertions are deterministic. */
function pillarDv(opts: {
  pillarsObjects?: Record<string, unknown>;
  rowObjects?: (Record<string, unknown> | undefined)[];
  showGrandTotal?: boolean;
  railsObjects?: Record<string, unknown>;
  withVariance?: boolean;
}): Any {
  const dv: Any = dvBuild({
    // fx OFF (harness default is ON — see test/_harness.ts). Justification:
    // this suite asserts the FILL STYLE machinery (solid / outlined / hatched
    // + the outline knobs) against a KNOWN pillar colour, and the hatch
    // pattern id is derived from that colour (`wf-hatch-0000aa`). A per-row
    // rule fill would make every bar a different colour and turn these into
    // colour-resolution tests, which is what fx-orientation.test.ts covers.
    // The rule cascade × fill style combination is covered by
    // test/pillar-measure-overrides.test.ts, which keeps the default ON.
    fx: false,
    cats: [{ name: "Cat", values: ["A", "B", "C", "D"], objects: opts.rowObjects }],
    vals: [
      { name: "Sales", role: "actual", values: [100, 20, -30, 150] },
      ...(opts.withVariance
        ? [{ name: "Var", role: "variance" as const, values: [50, -10, 20, -100], format: "#,##0" }]
        : [])
    ]
  });
  dv.metadata.objects = {
    grandTotal: { showGrandTotal: opts.showGrandTotal ?? false },
    pillars: {
      pillarColor: { solid: { color: PILLAR_C } },
      ...(opts.pillarsObjects || {})
    },
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

/** The BAR rect of one wf-bar group (excludes the focus ring). */
function barRect(target: HTMLElement, catIdx: number): SVGRectElement {
  const g = target.querySelector(`g.wf-bar[data-cat-idx="${catIdx}"]`)!;
  expect(g).toBeTruthy();
  const rect = Array.from(g.querySelectorAll("rect")).find(
    (r) => !r.classList.contains("wf-focus-ring")
  ) as SVGRectElement;
  expect(rect).toBeTruthy();
  return rect;
}

describe("pillar fill style — global dropdown", () => {
  test("default solid: historical plain fill on pillars AND bridges", () => {
    const target = run(makeVisual(), pillarDv({}));
    expect(barRect(target, 0).getAttribute("fill")).toBe(PILLAR_C);
    expect(barRect(target, 0).getAttribute("stroke")).toBeNull();
    expect(barRect(target, 3).getAttribute("fill")).toBe(PILLAR_C);
  });

  test("outlined: pillars hollow out (transparent fill + pillar-colour stroke), bridges untouched", () => {
    const target = run(
      makeVisual(),
      pillarDv({ pillarsObjects: { pillarFillStyle: "outlined" } })
    );
    for (const catIdx of [0, 3]) {
      const r = barRect(target, catIdx);
      expect(r.getAttribute("fill")).toBe("transparent");
      expect(r.getAttribute("stroke")).toBe(PILLAR_C);
      expect(r.getAttribute("stroke-width")).toBe("1");
    }
    // Bridges keep their solid theme fill — no stroke, no transparent fill.
    for (const catIdx of [1, 2]) {
      const r = barRect(target, catIdx);
      expect(r.getAttribute("fill")).not.toBe("transparent");
      expect(r.getAttribute("stroke")).toBeNull();
    }
  });

  test("hatched: 45° pattern in the pillar colour + 1px frame, defs emitted", () => {
    const target = run(
      makeVisual(),
      pillarDv({ pillarsObjects: { pillarFillStyle: "hatched" } })
    );
    const r = barRect(target, 0);
    expect(r.getAttribute("fill")).toBe("url(#wf-hatch-0000aa)");
    expect(r.getAttribute("stroke")).toBe(PILLAR_C);
    const pattern = target.querySelector("defs pattern#wf-hatch-0000aa");
    expect(pattern).toBeTruthy();
    expect(pattern!.querySelector("line")!.getAttribute("stroke")).toBe(PILLAR_C);
  });
});

describe("pillar fill style — per-pillar override (cat_N dropdown)", () => {
  test("AC/BU/FC mix: per-row hatched pillar next to a global solid one", () => {
    const target = run(
      makeVisual(),
      pillarDv({
        rowObjects: [{ pillars: { fillStyle: "hatched" } }, undefined, undefined, undefined]
      })
    );
    expect(barRect(target, 0).getAttribute("fill")).toBe("url(#wf-hatch-0000aa)");
    expect(barRect(target, 3).getAttribute("fill")).toBe(PILLAR_C); // follows global solid
  });

  test("override 'default' follows the global; override read back on the model", () => {
    const v: Any = makeVisual();
    run(
      v,
      pillarDv({
        pillarsObjects: { pillarFillStyle: "outlined" },
        rowObjects: [{ pillars: { fillStyle: "default" } }, undefined, undefined, undefined]
      })
    );
    expect(barRect(v.target, 0).getAttribute("fill")).toBe("transparent");
    expect(v.cachedCategoryDisplay[0].fillStyleOverride).toBe("default");
  });
});

describe("pillar outline group", () => {
  test("outlineShow forces a configurable contour on solid pillars only", () => {
    const target = run(
      makeVisual(),
      pillarDv({
        pillarsObjects: {
          outlineShow: true,
          outlineColor: { solid: { color: "#123123" } },
          outlineWidth: 2.5,
          outlineStyle: "dashed"
        }
      })
    );
    const r = barRect(target, 0);
    expect(r.getAttribute("fill")).toBe(PILLAR_C);
    expect(r.getAttribute("stroke")).toBe("#123123");
    expect(r.getAttribute("stroke-width")).toBe("2.5");
    expect(r.getAttribute("stroke-dasharray")).toBeTruthy();
    // Bridges never get the pillar outline.
    expect(barRect(target, 1).getAttribute("stroke")).toBeNull();
  });

  test("outlined style without outlineColor strokes in the pillar colour and outline width", () => {
    const target = run(
      makeVisual(),
      pillarDv({
        pillarsObjects: { pillarFillStyle: "outlined", outlineWidth: 3 }
      })
    );
    const r = barRect(target, 0);
    expect(r.getAttribute("stroke")).toBe(PILLAR_C);
    expect(r.getAttribute("stroke-width")).toBe("3");
  });
});

describe("pillar styles — grand total, HC and the shared hatch registry", () => {
  test("the Grand Total pillar stays SOLID under a global outlined style (open decision)", () => {
    const v: Any = makeVisual();
    const target = run(
      v,
      pillarDv({ pillarsObjects: { pillarFillStyle: "outlined" }, showGrandTotal: true })
    );
    const gtIdx = v.cachedCategoryDisplay.findIndex((c: Any) => c.isGrandTotal);
    expect(gtIdx).toBeGreaterThanOrEqual(0);
    const gtRect = barRect(target, gtIdx);
    expect(gtRect.getAttribute("fill")).not.toBe("transparent");
    expect(gtRect.getAttribute("stroke")).toBeNull();
  });

  test("high contrast: hatch pattern + outline take the host foreground", () => {
    const HC_FG = "#ffff00";
    const target = document.createElement("div");
    document.body.appendChild(target);
    const host = {
      ...makeMockHost(),
      colorPalette: {
        isHighContrast: true,
        foreground: { value: HC_FG },
        background: { value: "#000000" },
        hyperlink: { value: "#00ffff" },
        getColor: () => ({ value: "#123456" })
      }
    };
    const v: Any = new Visual({ host, element: target } as Any);
    v.formattingSettings = new VisualFormattingSettingsModel();
    run(v, pillarDv({ pillarsObjects: { pillarFillStyle: "hatched" } }));
    const r = barRect(target as HTMLElement, 0);
    expect(r.getAttribute("fill")).toBe("url(#wf-hatch-ffff00)");
    const pattern = (target as HTMLElement).querySelector("defs pattern#wf-hatch-ffff00");
    expect(pattern!.querySelector("line")!.getAttribute("stroke")).toBe(HC_FG);
  });

  test("rails + pillars share ONE pattern per colour (registry dedupe)", () => {
    // Pillar colour == the rails' positive default (#50be87): a hatched
    // pillar AND a hatched rail must resolve to the SAME pattern def.
    const target = run(
      makeVisual(),
      pillarDv({
        pillarsObjects: {
          pillarColor: { solid: { color: "#50be87" } },
          pillarFillStyle: "hatched"
        },
        railsObjects: { railStyle: "hatched" },
        withVariance: true
      })
    );
    const ids = Array.from(target.querySelectorAll("defs pattern")).map((p) =>
      p.getAttribute("id")
    );
    expect(ids.filter((id) => id === "wf-hatch-50be87").length).toBe(1);
    // Both consumers reference it.
    expect(barRect(target, 0).getAttribute("fill")).toBe("url(#wf-hatch-50be87)");
    const railRects = Array.from(
      target.querySelectorAll('rect.wf-clickable[data-cat-idx="0"]')
    ).filter((r) => !r.closest("g"));
    expect(railRects[0]!.getAttribute("fill")).toBe("url(#wf-hatch-50be87)");
  });
});

// ============ VERTICAL PARITY (finding GEN-25-b) ============
//
// The fill style and the outline are PAINT, not geometry: nothing about
// `fill="url(#…)"` or `stroke-dasharray` depends on which axis carries the
// value. They were nevertheless horizontal-only — the vertical branch emitted
// a plain `fill=` rect — so every one of these knobs was silently inert in
// the orientation the 1.2.0.0 release had just introduced.

/** Same fixture, rendered in vertical orientation. */
function verticalDv(pillarsObjects: Record<string, unknown>): Any {
  const dv = pillarDv({ pillarsObjects });
  dv.metadata.objects.general = { orientation: "vertical" };
  return dv;
}

describe("pillar fill style — VERTICAL parity", () => {
  test("hatched: the vertical pillar carries the pattern fill, like horizontal", () => {
    const h = barRect(run(makeVisual(), pillarDv({ pillarsObjects: { pillarFillStyle: "hatched" } })), 0);
    const v = barRect(run(makeVisual(), verticalDv({ pillarFillStyle: "hatched" })), 0);
    expect(h.getAttribute("fill")).toMatch(/^url\(#/);
    expect(v.getAttribute("fill")).toBe(h.getAttribute("fill"));
  });

  test("outlined: transparent fill + coloured stroke in vertical too", () => {
    const v = barRect(run(makeVisual(), verticalDv({ pillarFillStyle: "outlined" })), 0);
    expect(v.getAttribute("fill")).toBe("transparent");
    expect(v.getAttribute("stroke")).toBeTruthy();
  });

  test("outline group: show + width + dashed reach the vertical rect", () => {
    const v = barRect(
      run(
        makeVisual(),
        verticalDv({
          outlineShow: true,
          outlineColor: { solid: { color: "#091612" } },
          outlineWidth: 2.5,
          outlineStyle: "dashed"
        })
      ),
      0
    );
    expect(v.getAttribute("stroke")).toBe("#091612");
    expect(Number(v.getAttribute("stroke-width"))).toBeCloseTo(2.5, 3);
    expect(v.getAttribute("stroke-dasharray")).toBeTruthy();
  });

  test("solid (default) stays byte-identical in vertical: plain fill, no stroke", () => {
    const v = barRect(run(makeVisual(), verticalDv({})), 0);
    expect(v.getAttribute("fill")).toBe(PILLAR_C);
    expect(v.getAttribute("stroke")).toBeNull();
  });
});
