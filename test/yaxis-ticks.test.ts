
import { makeVisual, dvBuild } from "./_harness";
import { autoScaleDecimals, distinctTickDecimals, formatActualLabel } from "../src/format";

const M = { scale: 1e6, suffix: "M" };
const NONE = { scale: 1, suffix: "" };

function axisTicks(target: HTMLElement): string[] {
  return Array.from(target.querySelectorAll("svg > text[text-anchor='end']")).map(
    (t) => t.textContent || ""
  );
}

function render(dv: unknown, objects: Record<string, unknown> = {}): HTMLElement {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDv = dv as any;
  anyDv.metadata.objects = { ...(anyDv.metadata.objects || {}), ...objects };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [anyDv], viewport: { width: 700, height: 400 }, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (v as any).target as HTMLElement;
}

const pillars = (n: number) =>
  Array.from({ length: n }, () => ({ pillars: { isPillar: true } }));

describe("distinctTickDecimals (pure)", () => {
  test("0 when the ticks already differ at zero decimals", () => {
    expect(distinctTickDecimals([0, 1e6, 2e6, 3e6], M)).toBe(0);
  });

  test("steps up until the labels separate", () => {
    expect(distinctTickDecimals([1.2e6, 1.4e6, 1.6e6], M)).toBe(1);
    expect(distinctTickDecimals([1.02e6, 1.04e6, 1.06e6], M)).toBe(2);
  });

  test("a degenerate range keeps the historical 0 — no precision can help", () => {
    expect(distinctTickDecimals([5, 5, 5], NONE)).toBe(0);
    expect(distinctTickDecimals([7], NONE)).toBe(0);
  });

  test("bounded: never asks for more than `max` digits", () => {
    expect(distinctTickDecimals([1.0001e6, 1.0002e6], M)).toBe(2);
    expect(distinctTickDecimals([1.0001e6, 1.0002e6], M, "en-US", 1)).toBe(1);
  });
});

describe("autoScaleDecimals (pure) — data labels", () => {
  test("a value that scales cleanly keeps the historical 0 decimals", () => {
    expect(autoScaleDecimals(2e6, 1e6)).toBe(0);
    expect(autoScaleDecimals(-3e6, 1e6)).toBe(0);
  });

  test("adds the minimum digits that keep the label within 5 %", () => {
    expect(autoScaleDecimals(1.48e6, 1e6)).toBe(1);
    expect(autoScaleDecimals(1.02e6, 1e6)).toBe(0);
    expect(autoScaleDecimals(1.234e3, 1e3)).toBe(1);
  });

  test("never touches un-scaled labels — that default is the user's call", () => {
    expect(autoScaleDecimals(12.4, 1)).toBe(0);
    expect(autoScaleDecimals(12.4, 0)).toBe(0);
  });

  test("degenerate inputs fall back to 0", () => {
    expect(autoScaleDecimals(0, 1e6)).toBe(0);
    expect(autoScaleDecimals(NaN, 1e6)).toBe(0);
  });
});

describe("auto-scaled data labels", () => {
  const label = (value: number): string =>
    formatActualLabel({
      value,
      modelFormat: "",
      cardUnits: "auto",
      cardDecimals: 0,
      autoDecimals: 0,
      locale: "en-US",
      dataMaxAbs: 1.7e6
    });

  test("1 480 000 no longer reads as \"1M\"", () => {
    expect(label(1.48e6)).toBe("1.5M");
  });

  test("three neighbouring values stay distinguishable", () => {
    expect(new Set([label(1.2e6), label(1.45e6), label(1.7e6)]).size).toBe(3);
  });

  test("a round value is untouched", () => {
    expect(label(2e6)).toBe("2M");
  });
});

describe("percentage axis", () => {
  const pct = { general: { formatString: "0.0%" } };
  const marginDv = () =>
    dvBuild({
      cats: [
        { name: "Effet", values: ["N-1", "Prix", "N"], objects: [
          { pillars: { isPillar: true } },
          { pillars: { isPillar: false } },
          { pillars: { isPillar: true } }
        ] }
      ],
      vals: [
        {
          name: "Taux de marge",
          role: "actual",
          values: [0.182, 0.003, 0.185],
          rowObjects: [pct, pct, pct]
        }
      ]
    });

  test("ticks read as percentages, not as zeroes", () => {
    const ticks = axisTicks(render(marginDv()));
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every((t) => t.endsWith("%"))).toBe(true);
    expect(new Set(ticks).size).toBe(ticks.length);
    const nums = ticks.map((t) => parseFloat(t.replace("%", "")));
    expect(Math.max(...nums)).toBeGreaterThanOrEqual(18.5);
  });

  test("a static model % format gets the same treatment", () => {
    const dv = dvBuild({
      cats: [
        { name: "Effet", values: ["A", "B"], objects: pillars(2) }
      ],
      vals: [{ name: "Marge", role: "actual", values: [0.12, 0.185], format: "0.0%" }]
    });
    expect(axisTicks(render(dv)).every((t) => t.endsWith("%"))).toBe(true);
  });

  test("no K/M scale is applied to a ratio", () => {
    expect(axisTicks(render(marginDv())).some((t) => /[KM]/.test(t))).toBe(false);
  });
});

describe("non-percent axis", () => {
  const bigDv = () =>
    dvBuild({
      cats: [
        { name: "Cat", values: ["A", "B", "C"], objects: pillars(3) }
      ],
      vals: [
        { name: "CA", role: "actual", values: [1.2e6, 1.45e6, 1.7e6], format: "#,##0" }
      ]
    });

  test("ticks that used to collapse onto one string are now distinct", () => {
    const ticks = axisTicks(render(bigDv()));
    expect(ticks.length).toBeGreaterThan(1);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(ticks.every((t) => t.endsWith("M"))).toBe(true);
  });

  test("an explicit decimal count always wins", () => {
    const ticks = axisTicks(render(bigDv(), { yAxis: { decimalPlaces: 3 } }));
    for (const t of ticks) expect(t).toMatch(/^-?\d+\.\d{3}M$/);
  });

  test("an axis that was already distinct does not drift", () => {
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"], objects: pillars(2) }],
      vals: [{ name: "N", role: "actual", values: [100, 300], format: "#,##0" }]
    });
    const ticks = axisTicks(render(dv));
    expect(ticks.every((t) => !t.includes("."))).toBe(true);
  });
});
