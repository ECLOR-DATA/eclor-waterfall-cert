/**
 * Variation-arc label content modes — audit TG-06.
 *
 * The global `variationArc.defaultSource` dropdown drives EVERY arc label
 * (donut-style "Label contents" cascade in buildArcLabel, src/visual.ts):
 *   "auto-abs"  → delta value only          (formatAbsDelta)
 *   "auto-pct"  → delta percentage only     (formatPctDelta)
 *   "auto-both" → both, " | " separator     ← default + legacy fallback
 * Plus the zero-baseline guard in formatPctDelta (`baseline !== 0 ? … : 0`)
 * that keeps 0-valued departure pillars from emitting Infinity/NaN into SVG.
 * Existing arc suites (fx bg colour, arrowEnds) verify geometry/colour only —
 * this suite pins the label TEXT itself.
 */

import { makeVisual, dvBuild } from "./_harness";

describe("variation-arc label modes (defaultSource dispatch + zero-baseline pct guard)", () => {
  // 2 marked pillars → exactly one arc. Returns every rendered <text>
  // content; the arc label is asserted by exact string membership (pillar
  // value labels carry no "+" sign and no "%", so no collision).
  const arcTextsFor = (
    arcObjects: Record<string, unknown>,
    values: [number, number] = [100, 200]
  ): string[] => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B"],
          objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
        }
      ],
      vals: [{ name: "Sales", role: "actual", values }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = { variationArc: { show: true, ...arcObjects } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = (v as any).target as HTMLElement;
    expect(target.querySelector("parsererror")).toBeNull();
    return Array.from(target.querySelectorAll("text")).map((t) => t.textContent || "");
  };

  test('"auto-pct" → percentage only: "+100.0%" for 100→200 (decimals from the "+0.0;-0.0;0" model format)', () => {
    const texts = arcTextsFor({ defaultSource: "auto-pct" });
    expect(texts).toContain("+100.0%");
    // pct-only mode: no combined " | " label anywhere.
    expect(texts.some((t) => t.includes("|"))).toBe(false);
  });

  test('"auto-abs" → delta value only: "+100" for 100→200, no percentage rendered', () => {
    const texts = arcTextsFor({ defaultSource: "auto-abs" });
    expect(texts).toContain("+100");
    expect(texts.some((t) => t.includes("%"))).toBe(false);
    expect(texts.some((t) => t.includes("|"))).toBe(false);
  });

  test('"auto-both" → combined "abs | pct": "+100 | +100.0%"', () => {
    expect(arcTextsFor({ defaultSource: "auto-both" })).toContain("+100 | +100.0%");
  });

  test("defaultSource unset (fresh report) → auto-both default", () => {
    expect(arcTextsFor({})).toContain("+100 | +100.0%");
  });

  test('legacy "measure-0" (1.0.69–82 saved reports) → silently routed to the auto-both label', () => {
    expect(arcTextsFor({ defaultSource: "measure-0" })).toContain("+100 | +100.0%");
  });

  test("zero-baseline guard: departure pillar = 0 → pct is \"0%\", never Infinity/NaN in the SVG", () => {
    // formatPctDelta: `baseline !== 0 ? delta/baseline*100 : 0` — value 0 hits
    // the model format's zero pattern ("0" → no decimals, no sign).
    const texts = arcTextsFor({ defaultSource: "auto-pct" }, [0, 200]);
    expect(texts).toContain("0%");
    expect(texts.some((t) => /NaN|Infinity/i.test(t))).toBe(false);
  });

  test('zero-baseline + auto-both → abs part still real: "+200 | 0%"', () => {
    expect(arcTextsFor({ defaultSource: "auto-both" }, [0, 200])).toContain("+200 | 0%");
  });

  test('downward arc (200→100) → negative patterns: "-100 | -50.0%"', () => {
    expect(arcTextsFor({ defaultSource: "auto-both" }, [200, 100])).toContain("-100 | -50.0%");
  });

  test("decimalPlaces card override (2) applies to BOTH parts of the combined label", () => {
    // arcDecimals feeds cardDecimals for abs AND the decimalsOverride of the
    // pct's "+0.0;-0.0;0" model format.
    expect(arcTextsFor({ defaultSource: "auto-both", decimalPlaces: 2 })).toContain(
      "+100.00 | +100.00%"
    );
  });
});
