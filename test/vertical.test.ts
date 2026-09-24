
import { makeVisual, dvBuild } from "./_harness";

const VIEWPORT = { width: 800, height: 480 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dv = any;

function baseDv(opts?: {
  values?: (number | null)[];
  pillarFlags?: boolean[];
  mode?: string;
  extraObjects?: Record<string, unknown>;
  withVariance?: boolean;
  withAdim?: boolean;
  withLegend?: boolean;
}): Dv {
  const values = opts?.values ?? [100, -40, 20];
  const flags = opts?.pillarFlags ?? [true, false, false];
  const catNames = values.map((_, i) => `Cat${i}`);
  const cats = [
    {
      name: "Cat",
      values: catNames,
      objects: flags.map((f) => ({ pillars: { isPillar: f } }))
    }
  ];
  if (opts?.withAdim) {
    const adimVals: string[] = [];
    const catExp: string[] = [];
    const valExp: (number | null)[] = [];
    values.forEach((v, i) => {
      catExp.push(catNames[i], catNames[i]);
      adimVals.push("P1", "P2");
      const v0 = (v ?? 0) * 0.6;
      valExp.push(v0, (v ?? 0) - v0);
    });
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: catExp,
          objects: catExp.map((c) => ({
            pillars: { isPillar: flags[catNames.indexOf(c)] }
          }))
        },
        { name: "Product", values: adimVals, isAnalysisDim: true }
      ],
      vals: [{ name: "Sales", role: "actual", values: valExp }]
    }) as Dv;
    dv.metadata.objects = {
      general: { orientation: "vertical", mode: opts?.mode || "cumulative" },
      grandTotal: { showGrandTotal: false },
      ...(opts?.extraObjects || {})
    };
    return dv;
  }
  const vals: {
    name: string;
    role: "actual" | "variance";
    values: (number | null)[];
  }[] = [{ name: "Sales", role: "actual", values }];
  if (opts?.withVariance) {
    vals.push({ name: "Δ vs LY", role: "variance", values: values.map((v) => (v ?? 0) / 10) });
  }
  const dv = dvBuild({ cats, vals }) as Dv;
  dv.metadata.objects = {
    general: { orientation: "vertical", mode: opts?.mode || "cumulative" },
    grandTotal: { showGrandTotal: false },
    ...(opts?.extraObjects || {})
  };
  return dv;
}

function render(dv: Dv): HTMLElement {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport: VIEWPORT, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return target;
}

function barBodyRects(target: HTMLElement): SVGRectElement[] {
  return Array.from(target.querySelectorAll("g.wf-bar")).map((bar) => {
    const rects = Array.from(bar.querySelectorAll("rect")).filter(
      (r) => !r.classList.contains("wf-focus-ring") && !r.closest("mask")
    );
    expect(rects.length).toBeGreaterThan(0);
    return rects[0] as SVGRectElement;
  });
}

const num = (el: Element | null, attr: string): number =>
  parseFloat(el?.getAttribute(attr) || "NaN");

describe("vertical orientation — bars are horizontal, first pillar on top", () => {
  test("body rect height == bar thickness; y grows with category index", () => {
    const target = render(baseDv());
    const rects = barBodyRects(target);
    expect(rects.length).toBe(3);
    const h0 = num(rects[0], "height");
    rects.forEach((r) => expect(num(r, "height")).toBeCloseTo(h0, 1));
    expect(num(rects[0], "y")).toBeLessThan(num(rects[1], "y"));
    expect(num(rects[1], "y")).toBeLessThan(num(rects[2], "y"));
    expect(num(rects[0], "width")).toBeGreaterThan(num(rects[0], "height"));
  });

  test("aria: chart desc announces the vertical orientation; per-bar labels intact", () => {
    const target = render(baseDv());
    const svg = target.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toContain("vertical orientation");
    const bar = target.querySelector("g.wf-bar");
    expect(bar?.getAttribute("tabindex")).toBe("0");
    expect(bar?.getAttribute("role")).toBe("button");
    expect(bar?.getAttribute("aria-label")).toContain("Pillar");
  });

  test("focus ring transposes: height == barW + 4 (thin horizontal band)", () => {
    const target = render(baseDv());
    const body = barBodyRects(target)[0];
    const ring = target.querySelector("g.wf-bar .wf-focus-ring");
    expect(num(ring, "height")).toBeCloseTo(num(body, "height") + 4, 1);
    expect(num(ring, "width")).toBeCloseTo(num(body, "width") + 4, 1);
  });
});

describe("vertical orientation — pillar zero anchoring (transposed y0/y1)", () => {
  test("positive and negative pillars meet at the zero line", () => {
    const target = render(
      baseDv({ values: [100, -40], pillarFlags: [true, true] })
    );
    const [pos, neg] = barBodyRects(target);
    const zeroFromPos = num(pos, "x");
    const zeroFromNeg = num(neg, "x") + num(neg, "width");
    expect(zeroFromPos).toBeCloseTo(zeroFromNeg, 1);
    expect(num(pos, "width")).toBeGreaterThan(0);
    expect(num(neg, "x")).toBeLessThan(zeroFromPos);
  });

  test("bridge crossing zero in positive running spans the full delta", () => {
    const target = render(
      baseDv({ values: [100, -150], pillarFlags: [true, false] })
    );
    const [pillar, bridge] = barBodyRects(target);
    expect(num(bridge, "x")).toBeLessThan(num(pillar, "x"));
    expect(num(bridge, "x") + num(bridge, "width")).toBeCloseTo(
      num(pillar, "x") + num(pillar, "width"),
      0
    );
    expect(num(bridge, "width")).toBeGreaterThan(num(pillar, "width"));
    const labels = Array.from(
      target.querySelectorAll("g.wf-clickable[data-cat-idx] text")
    ).map((t) => t.textContent || "");
    expect(labels.some((l) => l.includes("-150"))).toBe(true);
  });
});

describe("vertical orientation — connectors are vertical at runningAfter", () => {
  test("connector x1 == x2 == the previous bar's running edge", () => {
    const target = render(
      baseDv({
        values: [100, -40],
        pillarFlags: [true, false],
        extraObjects: {
          connectors: {
            showConnectors: true,
            connectorColor: { solid: { color: "#123456" } }
          }
        }
      })
    );
    const [pillar] = barBodyRects(target);
    const connectors = Array.from(target.querySelectorAll("svg > line")).filter(
      (l) => l.getAttribute("stroke") === "#123456"
    );
    expect(connectors.length).toBe(1);
    const conn = connectors[0];
    expect(num(conn, "x1")).toBeCloseTo(num(conn, "x2"), 1);
    expect(num(conn, "x1")).toBeCloseTo(num(pillar, "x") + num(pillar, "width"), 1);
    expect(num(conn, "y2")).toBeGreaterThan(num(conn, "y1"));
  });
});

describe("vertical orientation — tip value labels (IBCS)", () => {
  test("positive pillar label: anchor start, right of the bar tip", () => {
    const target = render(
      baseDv({ values: [100, -40, -60], pillarFlags: [true, true, false] })
    );
    const [pos, neg] = barBodyRects(target);
    const labelGroups = Array.from(
      target.querySelectorAll("g.wf-clickable[data-cat-idx]")
    ).filter((g) => g.querySelector("text"));
    const texts = labelGroups.map((g) => g.querySelector("text") as SVGTextElement);
    const posLabel = texts.find((t) => (t.textContent || "").includes("100"));
    const negLabel = texts.find((t) => (t.textContent || "").includes("-40"));
    expect(posLabel?.getAttribute("text-anchor")).toBe("start");
    expect(num(posLabel!, "x")).toBeGreaterThan(num(pos, "x") + num(pos, "width"));
    expect(negLabel?.getAttribute("text-anchor")).toBe("end");
    expect(num(negLabel!, "x")).toBeLessThan(num(neg, "x"));
    const posCy = num(pos, "y") + num(pos, "height") / 2;
    expect(Math.abs(num(posLabel!, "y") - posCy)).toBeLessThan(10);
  });
});

describe("vertical orientation — value axis on top", () => {
  test("gridlines are vertical, tick labels sit above the chart", () => {
    const dv = baseDv({ extraObjects: { yAxis: { showGridlines: true } } });
    const target = render(dv);
    const rects = barBodyRects(target);
    const firstBarTop = Math.min(...rects.map((r) => num(r, "y")));
    const gridlines = Array.from(target.querySelectorAll("svg > line")).filter(
      (l) => l.getAttribute("stroke") === "#d4d4d4"
    );
    expect(gridlines.length).toBe(6);
    gridlines.forEach((l) => expect(num(l, "x1")).toBeCloseTo(num(l, "x2"), 1));
    const ticks = Array.from(target.querySelectorAll("svg > text")).filter(
      (t) =>
        t.getAttribute("text-anchor") === "middle" &&
        num(t, "y") < firstBarTop &&
        !t.closest("g")
    );
    expect(ticks.length).toBeGreaterThanOrEqual(6);
  });
});

describe("vertical orientation — broken axis transposes", () => {
  test("comparison + floor offset: mask band is barW-tall, diagonals slant along Y", () => {
    const dv = baseDv({
      values: [150, 200],
      pillarFlags: [true, true],
      mode: "comparison",
      extraObjects: { yAxis: { yMinOffset: 50 } }
    });
    const target = render(dv);
    const masks = Array.from(target.querySelectorAll('mask[id^="wf-break-"]'));
    expect(masks.length).toBe(2);
    const bodies = barBodyRects(target);
    const barH = num(bodies[0], "height");
    for (const m of masks) {
      const white = m.querySelector('rect[fill="white"]');
      expect(num(white, "height")).toBeCloseTo(barH + 2, 1);
      expect(m.querySelector('polygon[fill="black"]')).toBeTruthy();
    }
    const diag = Array.from(target.querySelectorAll("g.wf-bar line"));
    expect(diag.length).toBe(4);
    diag.forEach((l) => {
      expect(num(l, "x1")).not.toBeCloseTo(num(l, "x2"), 1);
      expect(num(l, "y1")).not.toBeCloseTo(num(l, "y2"), 1);
    });
    expect(num(bodies[0], "x")).toBeCloseTo(num(bodies[1], "x"), 1);
  });
});

describe("vertical orientation — arc anti-collision (render feedback)", () => {
  const consEnd = (t: SVGTextElement): number => {
    const size = parseFloat(t.getAttribute("font-size") || "14");
    const bold = t.getAttribute("font-weight") === "bold";
    const len = (t.textContent || "").length;
    return num(t, "x") + len * size * (bold ? 0.62 : 0.58);
  };

  const renderWide = (dv: Dv): HTMLElement => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: { width: 1100, height: 560 }, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = (v as any).target as HTMLElement;
    expect(target.querySelector("parsererror")).toBeNull();
    return target;
  };

  test("arc arrows land past the pillar tip labels with a clear gap (>= 6px)", () => {
    const dv = dvBuild({
      cats: [
        {
          name: "Driver",
          values: ["FY24", "Churn", "FY25"],
          objects: [true, false, true].map((f) => ({ pillars: { isPillar: f } }))
        }
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vals: [{ name: "Rev", role: "actual", values: [2900, -220, 2680], format: "#,##0" } as any]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = {
      general: { orientation: "vertical" },
      grandTotal: { showGrandTotal: false },
      variationArc: { show: true }
    };
    const target = renderWide(dv);
    const arrows = Array.from(target.querySelectorAll("svg > path"));
    expect(arrows.length).toBe(2);
    const labels = Array.from(
      target.querySelectorAll("g.wf-clickable[data-cat-idx] text")
    ) as SVGTextElement[];
    for (const arrow of arrows) {
      const nums = (arrow.getAttribute("d") || "").match(/-?\d+(\.\d+)?/g)!.map(Number);
      const xs = nums.filter((_, i) => i % 2 === 0);
      const ys = nums.filter((_, i) => i % 2 === 1);
      const tipX = Math.min(...xs);
      const rowY = ys[0];
      const rowLabel = labels.find(
        (t) => Math.abs(num(t, "y") - rowY) < 10 && t.getAttribute("text-anchor") === "start"
      );
      expect(rowLabel).toBeTruthy();
      expect(tipX).toBeGreaterThanOrEqual(consEnd(rowLabel!) + 6);
    }
  });

  test("the arc's vertical line clears intermediate bridge tip labels (>= 6px)", () => {
    const dv = dvBuild({
      cats: [
        {
          name: "Driver",
          values: ["Open", "Boost", "Close"],
          objects: [true, false, true].map((f) => ({ pillars: { isPillar: f } }))
        }
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vals: [{ name: "Rev", role: "actual", values: [1000, 500, 1300], format: "#,##0" } as any]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = {
      general: { orientation: "vertical" },
      grandTotal: { showGrandTotal: false },
      variationArc: { show: true }
    };
    const target = renderWide(dv);
    const arcVertLines = Array.from(target.querySelectorAll("svg > line")).filter(
      (l) =>
        l.getAttribute("stroke") === "#000000" &&
        Math.abs(num(l, "x1") - num(l, "x2")) < 0.2
    );
    expect(arcVertLines.length).toBe(1);
    const xArc = num(arcVertLines[0], "x1");
    const labels = Array.from(
      target.querySelectorAll("g.wf-clickable[data-cat-idx] text")
    ) as SVGTextElement[];
    const bridgeLabel = labels.find((t) => (t.textContent || "").includes("+500"));
    expect(bridgeLabel).toBeTruthy();
    expect(bridgeLabel!.getAttribute("text-anchor")).toBe("start");
    expect(xArc).toBeGreaterThanOrEqual(consEnd(bridgeLabel!) + 6);
  });
});

describe("vertical orientation — rail labels stay inside their own column (B2 sweep)", () => {
  test("adjacent rails with opposite signs on the same row: label boxes never overlap", () => {
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B"],
          objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: false } }]
        }
      ],
      vals: [
        { name: "Sales", role: "actual", values: [100, -40] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { name: "D1", role: "variance", values: [8, 2], format: "+#,##0.0;-#,##0.0" } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { name: "D2", role: "variance", values: [-6, -1], format: "+#,##0.0;-#,##0.0" } as any
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = {
      general: { orientation: "vertical" },
      grandTotal: { showGrandTotal: false }
    };
    const target = render(dv);
    const chartRight = Math.max(
      ...barBodyRects(target).map((r) => num(r, "x") + num(r, "width"))
    );
    const railTexts = (
      Array.from(target.querySelectorAll("svg > text[data-cat-idx]")) as SVGTextElement[]
    ).filter((t) => num(t, "x") > chartRight);
    expect(railTexts.length).toBe(4);
    const box = (t: SVGTextElement): { lo: number; hi: number; y: number } => {
      const size = parseFloat(t.getAttribute("font-size") || "12");
      const estW = (t.textContent || "").length * size * 0.55;
      const x = num(t, "x");
      return t.getAttribute("text-anchor") === "end"
        ? { lo: x - estW, hi: x, y: num(t, "y") }
        : { lo: x, hi: x + estW, y: num(t, "y") };
    };
    const boxes = railTexts.map(box);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (Math.abs(boxes[i].y - boxes[j].y) > 2) continue;
        const overlap =
          Math.min(boxes[i].hi, boxes[j].hi) - Math.max(boxes[i].lo, boxes[j].lo);
        expect(overlap).toBeLessThanOrEqual(0);
      }
    }
  });
});

describe("vertical orientation — edge cases", () => {
  test("all-negative comparison + floor offset: bars anchor RIGHT, stripes near the right end", () => {
    const dv = baseDv({
      values: [-150, -200],
      pillarFlags: [true, true],
      mode: "comparison",
      extraObjects: { yAxis: { yMinOffset: 50 } }
    });
    const target = render(dv);
    const bodies = barBodyRects(target);
    const right0 = num(bodies[0], "x") + num(bodies[0], "width");
    const right1 = num(bodies[1], "x") + num(bodies[1], "width");
    expect(right0).toBeCloseTo(right1, 1);
    const masks = Array.from(target.querySelectorAll('mask[id^="wf-break-"]'));
    expect(masks.length).toBe(2);
    masks.forEach((m, i) => {
      const poly = m.querySelector('polygon[fill="black"]');
      const xs = (poly?.getAttribute("points") || "")
        .split(" ")
        .map((p) => parseFloat(p.split(",")[0]));
      const barRight = num(bodies[i], "x") + num(bodies[i], "width");
      xs.forEach((px) => {
        expect(barRight - px).toBeLessThan(40);
        expect(barRight - px).toBeGreaterThan(-5);
      });
    });
  });

  test("single category renders a single horizontal pillar (no NaN geometry)", () => {
    const dv = baseDv({ values: [42], pillarFlags: [true] });
    const target = render(dv);
    const bodies = barBodyRects(target);
    expect(bodies.length).toBe(1);
    ["x", "y", "width", "height"].forEach((a) => {
      expect(Number.isFinite(num(bodies[0], a))).toBe(true);
    });
    expect(num(bodies[0], "width")).toBeGreaterThan(0);
  });

  test("degenerate viewport (120x90) still yields a parseable frame", () => {
    const v = makeVisual();
    const dv = baseDv({ withVariance: true, withAdim: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: { width: 120, height: 90 }, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = (v as any).target as HTMLElement;
    expect(target.querySelector("parsererror")).toBeNull();
    expect(target.querySelectorAll("g.wf-bar").length).toBe(3);
  });
});

describe("vertical orientation — footnote table becomes LEFT columns", () => {
  test("one column per analysis value; cells row-aligned with their bars; vertical separators", () => {
    const target = render(baseDv({ withAdim: true }));
    const rows = Array.from(target.querySelectorAll("g.wf-table-row"));
    expect(rows.length).toBe(2);
    const bodies = barBodyRects(target);
    const chartLeft = Math.min(...bodies.map((r) => num(r, "x")));
    rows.forEach((row) => {
      const bg = row.querySelector(".wf-table-row-bg");
      expect(num(bg, "x") + num(bg, "width")).toBeLessThanOrEqual(chartLeft);
    });
    const cells = Array.from(target.querySelectorAll("g.wf-table-cell"));
    expect(cells.length).toBe(2 * 3);
    cells.forEach((cell) => {
      const col = parseInt(cell.getAttribute("data-table-col") || "-1", 10);
      const hit = cell.querySelector(".wf-table-cell-hit");
      const bar = bodies[col];
      const hitCy = num(hit, "y") + num(hit, "height") / 2;
      const barCy = num(bar, "y") + num(bar, "height") / 2;
      expect(hitCy).toBeCloseTo(barCy, 0);
    });
    rows.forEach((row) => {
      expect(row.getAttribute("tabindex")).toBe("0");
      expect(row.getAttribute("role")).toBe("button");
      expect(row.getAttribute("aria-label")).toContain("total");
    });
  });
});

describe("vertical orientation — variance rails become RIGHT columns", () => {
  test("rail centre line is vertical, right of the chart; rail bars row-aligned", () => {
    const target = render(baseDv({ withVariance: true }));
    const bodies = barBodyRects(target);
    const chartRight = Math.max(...bodies.map((r) => num(r, "x") + num(r, "width")));
    const railLines = Array.from(target.querySelectorAll("svg > line")).filter(
      (l) => l.getAttribute("stroke-dasharray") === "5 4"
    );
    expect(railLines.length).toBe(1);
    const rail = railLines[0];
    expect(num(rail, "x1")).toBeCloseTo(num(rail, "x2"), 1);
    expect(num(rail, "x1")).toBeGreaterThan(chartRight);
    const railRects = Array.from(
      target.querySelectorAll("svg > rect[data-cat-idx]")
    );
    expect(railRects.length).toBe(3);
    railRects.forEach((r) => {
      const idx = parseInt(r.getAttribute("data-cat-idx") || "-1", 10);
      const bar = bodies[idx];
      const rCy = num(r, "y") + num(r, "height") / 2;
      const barCy = num(bar, "y") + num(bar, "height") / 2;
      expect(rCy).toBeCloseTo(barCy, 1);
      expect(num(r, "x")).toBeGreaterThan(chartRight);
    });
  });
});

describe("vertical orientation — legend stacking transposes", () => {
  test("stacked bar renders segments side by side; widths sum to the bar width", () => {
    const flags = [true, false];
    const catExp = ["Cat0", "Cat0", "Cat1", "Cat1"];
    const legendVals = ["L1", "L2", "L1", "L2"];
    const valExp = [60, 40, -25, -15];
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: catExp,
          objects: catExp.map((c) => ({
            pillars: { isPillar: flags[c === "Cat0" ? 0 : 1] }
          }))
        },
        { name: "Region", values: legendVals, isLegend: true }
      ],
      vals: [{ name: "Sales", role: "actual", values: valExp }]
    }) as Dv;
    dv.metadata.objects = {
      general: { orientation: "vertical" },
      grandTotal: { showGrandTotal: false }
    };
    const target = render(dv);
    const bars = Array.from(target.querySelectorAll("g.wf-bar"));
    expect(bars.length).toBe(2);
    const segRects = Array.from(bars[0].querySelectorAll("rect")).filter(
      (r) => !r.classList.contains("wf-focus-ring") && !r.closest("mask")
    );
    expect(segRects.length).toBe(2);
    expect(num(segRects[0], "y")).toBeCloseTo(num(segRects[1], "y"), 1);
    const right0 = num(segRects[0], "x") + num(segRects[0], "width");
    expect(right0).toBeCloseTo(num(segRects[1], "x"), 1);
  });
});

describe("vertical orientation — high contrast parity", () => {
  test("bars + rails take the HC foreground/hyperlink, never the user colours", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).host.colorPalette = {
      getColor: () => ({ value: "#12ab89" }),
      isHighContrast: true,
      foreground: { value: "#0f0f0f" },
      background: { value: "#fefefe" },
      hyperlink: { value: "#00ff00" },
      foregroundSelected: { value: "#ff00ff" }
    };
    const dv = baseDv({ withVariance: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: VIEWPORT, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = (v as any).target as HTMLElement;
    expect(target.querySelector("parsererror")).toBeNull();
    const bodies = barBodyRects(target);
    bodies.forEach((r) => expect(r.getAttribute("fill")).toBe("#0f0f0f"));
    const railRects = Array.from(target.querySelectorAll("svg > rect[data-cat-idx]"));
    railRects.forEach((r) =>
      expect(["#0f0f0f", "#00ff00"]).toContain(r.getAttribute("fill"))
    );
  });
});

describe("vertical orientation — grand total lands at the bottom", () => {
  test("with the GT on, the last (bottom-most) bar is the Grand total pillar", () => {
    const dv = baseDv();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dv as any).metadata.objects.grandTotal = { showGrandTotal: true };
    const target = render(dv);
    const bars = Array.from(target.querySelectorAll("g.wf-bar"));
    expect(bars.length).toBe(4);
    const last = bars[bars.length - 1];
    expect(last.getAttribute("aria-label") || "").toContain("Grand total");
    const rects = barBodyRects(target);
    const lastY = num(rects[rects.length - 1], "y");
    rects.slice(0, -1).forEach((r) => expect(num(r, "y")).toBeLessThan(lastY));
  });
});
