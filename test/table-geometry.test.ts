/**
 * Analysis-table band width (feat/pillar-measure-overrides, demand 3).
 *
 * The band is the row-header margin in horizontal orientation, one
 * analysisDim column in vertical. Auto sizing stays untouched; an explicit
 * width overrides the automatic caps and is limited only by what the
 * viewport can afford.
 */

import {
  resolveTableBandWidth,
  TABLE_COLUMN_WIDTH_MIN,
  TABLE_COLUMN_WIDTH_MAX,
  TABLE_MIN_CHART_WIDTH,
  wrapToWidth
} from "../src/tableGeometry";

const base = {
  auto: 60,
  bandCount: 1,
  viewportWidth: 1000,
  otherMargins: 200,
  minChartWidth: TABLE_MIN_CHART_WIDTH,
  minBand: TABLE_COLUMN_WIDTH_MIN,
  maxBand: TABLE_COLUMN_WIDTH_MAX
};

describe("resolveTableBandWidth — Auto is pixel-exact", () => {
  test("0 / negative / NaN / undefined all return the automatic width verbatim", () => {
    for (const requested of [0, -5, NaN, Infinity * 0, undefined as unknown as number]) {
      expect(resolveTableBandWidth({ ...base, requested })).toBe(60);
    }
  });

  test("Auto is NOT re-clamped — an automatic width below minBand survives", () => {
    // The renderer's own caps already produced this; re-applying minBand here
    // would silently change existing reports.
    expect(resolveTableBandWidth({ ...base, requested: 0, auto: 12 })).toBe(12);
    expect(resolveTableBandWidth({ ...base, requested: 0, auto: 900 })).toBe(900);
  });

  test("Auto ignores a viewport too narrow to afford it (historical behaviour kept)", () => {
    expect(
      resolveTableBandWidth({ ...base, requested: 0, auto: 300, viewportWidth: 260 })
    ).toBe(300);
  });
});

describe("resolveTableBandWidth — an explicit width wins over the automatic caps", () => {
  test("the requested width is honoured when the viewport affords it", () => {
    expect(resolveTableBandWidth({ ...base, requested: 140 })).toBe(140);
  });

  test("it beats a much smaller automatic width — that is the whole point", () => {
    expect(resolveTableBandWidth({ ...base, requested: 140, auto: 40 })).toBe(140);
  });

  test("clamped into [minBand, maxBand]", () => {
    expect(resolveTableBandWidth({ ...base, requested: 1 })).toBe(TABLE_COLUMN_WIDTH_MIN);
    expect(resolveTableBandWidth({ ...base, requested: 99999, viewportWidth: 5000 })).toBe(
      TABLE_COLUMN_WIDTH_MAX
    );
  });
});

describe("resolveTableBandWidth — the chart is never starved", () => {
  test("the plot area keeps minChartWidth: the band is cut, not the chart", () => {
    // 1000 − 200 other − 120 chart = 680 spare for 1 band.
    expect(resolveTableBandWidth({ ...base, requested: 400, viewportWidth: 500 })).toBe(180);
  });

  test("vertical: the affordability budget is shared across the columns", () => {
    // 1000 − 200 − 120 = 680 spare / 4 columns = 170 each.
    expect(resolveTableBandWidth({ ...base, requested: 300, bandCount: 4 })).toBe(170);
    // Under the budget, the request passes through untouched.
    expect(resolveTableBandWidth({ ...base, requested: 120, bandCount: 4 })).toBe(120);
  });

  test("tiny viewport: degrades to a visible 8 px instead of a negative chart", () => {
    expect(
      resolveTableBandWidth({ ...base, requested: 200, viewportWidth: 200, bandCount: 6 })
    ).toBe(8);
    expect(
      resolveTableBandWidth({ ...base, requested: 200, viewportWidth: 40, bandCount: 1 })
    ).toBe(8);
  });

  test("the result is always a whole number of pixels", () => {
    const w = resolveTableBandWidth({
      ...base,
      requested: 300,
      bandCount: 3,
      viewportWidth: 777,
      otherMargins: 111
    });
    expect(Number.isInteger(w)).toBe(true);
    expect(w).toBeGreaterThan(0);
  });

  test("bandCount 0 / NaN is treated as 1 (never divides by zero)", () => {
    expect(resolveTableBandWidth({ ...base, requested: 140, bandCount: 0 })).toBe(140);
    expect(
      resolveTableBandWidth({ ...base, requested: 140, bandCount: NaN as number })
    ).toBe(140);
  });
});

// ============ HEADER WRAPPING ============

/** 8.5 pt × the renderer's CHAR_W_RATIO (0.55) ≈ 4.675 px per glyph. */
const CW = 8.5 * 0.55;
/** Chars that fit on one line at the widths used below. */
const perLine = (w: number) => Math.floor(w / CW);

describe("wrapToWidth — maxLines 1 is the historical truncation, verbatim", () => {
  test("short text passes through untouched", () => {
    expect(wrapToWidth("Enterprise", 200, CW, 1)).toEqual(["Enterprise"]);
  });

  test("long text ellipsises on ONE line — same result as truncateToWidth", () => {
    const w = 60;
    const [line] = wrapToWidth("Channel Partners", w, CW, 1);
    expect(line.endsWith("…")).toBe(true);
    expect(line.length).toBe(perLine(w));
    // The renderer's own rule: slice(0, maxChars - 1) + "…".
    expect(line).toBe("Channel Partners".slice(0, perLine(w) - 1) + "…");
  });

  test("maxLines 0 / NaN degrade to 1 rather than emitting nothing", () => {
    expect(wrapToWidth("Channel Partners", 60, CW, 0)).toHaveLength(1);
    expect(wrapToWidth("Channel Partners", 60, CW, NaN)).toHaveLength(1);
  });
});

describe("wrapToWidth — the point of the feature", () => {
  test("two lines show the full label where one line truncated it", () => {
    expect(wrapToWidth("Channel Partners", 60, CW, 2)).toEqual(["Channel", "Partners"]);
    expect(wrapToWidth("Small Business", 60, CW, 2)).toEqual(["Small", "Business"]);
  });

  test("a label that already fits stays on one line even when 3 are allowed", () => {
    expect(wrapToWidth("Enterprise", 200, CW, 3)).toEqual(["Enterprise"]);
  });

  test("greedy fill — words pack onto a line while they fit", () => {
    const out = wrapToWidth("United States of America", 60, CW, 3);
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out.join(" ")).toBe("United States of America");
  });

  test("no line ever exceeds the budget", () => {
    for (const label of ["Channel Partners", "United States of America", "Small Business"]) {
      for (const lines of [1, 2, 3, 4]) {
        for (const w of [40, 60, 90, 140]) {
          for (const line of wrapToWidth(label, w, CW, lines)) {
            expect(line.length).toBeLessThanOrEqual(perLine(w));
          }
        }
      }
    }
  });
});

describe("wrapToWidth — adversarial", () => {
  test("a single word longer than the line is hard-broken, not reduced to a glyph", () => {
    const out = wrapToWidth("Wholesaledistribution", 40, CW, 2);
    expect(out).toHaveLength(2);
    expect(out[0].length).toBeGreaterThan(1);
    expect(out[0]).toBe("Wholesaledistribution".slice(0, perLine(40)));
  });

  test("what does not fit in maxLines ellipsises on the LAST line", () => {
    const out = wrapToWidth("Channel Partners Northern Region", 60, CW, 2);
    expect(out).toHaveLength(2);
    expect(out[1].endsWith("…")).toBe(true);
  });

  test("empty label yields one empty line, never an empty array", () => {
    expect(wrapToWidth("", 60, CW, 2)).toEqual([""]);
  });

  test("a zero / negative width still emits at least one character per line", () => {
    for (const w of [0, -10]) {
      const out = wrapToWidth("Channel Partners", w, CW, 2);
      expect(out.length).toBeGreaterThan(0);
      for (const line of out) expect(line.length).toBeGreaterThan(0);
    }
  });
});
