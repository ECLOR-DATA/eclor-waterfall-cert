
import * as fs from "fs";
import * as path from "path";
import { makeVisual, dvBuild } from "./_harness";

const capabilities = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "capabilities.json"), "utf-8")
) as Record<string, never>;

function arcTexts(
  arcObjects: Record<string, unknown>,
  arcVals?: { values: (number | string | null)[]; format?: string; rowObjects?: unknown[] }
): string[] {
  const v = makeVisual();
  const dv = dvBuild({
    cats: [
      {
        name: "Cat",
        values: ["Start", "Mid", "End"],
        objects: [
          { pillars: { isPillar: true } },
          { pillars: { isPillar: false } },
          { pillars: { isPillar: true } }
        ]
      }
    ],
    vals: [
      { name: "Sales", role: "actual", values: [100, 20, 200] },
      ...(arcVals
        ? [
            {
              name: "Indicateur",
              role: "arcMeasure" as const,
              values: arcVals.values,
              format: arcVals.format,
              rowObjects: arcVals.rowObjects as never
            }
          ]
        : [])
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  dv.metadata.objects = { variationArc: { show: true, ...arcObjects } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport: { width: 700, height: 460 }, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return Array.from(target.querySelectorAll("text")).map((t) => t.textContent || "");
}

describe("variation arc — the measure bucket exists in capabilities", () => {
  test("arcMeasure is a Measure role, selected by the matrix values mapping", () => {
    const role = (capabilities["dataRoles"] as unknown as Array<Record<string, string>>).find(
      (r) => r.name === "arcMeasure"
    );
    expect(role).toBeDefined();
    expect(role!.kind).toBe("Measure");
    const select = (
      capabilities["dataViewMappings"] as unknown as Array<Record<string, never>>
    )[0]["matrix"]["values"]["select"] as unknown as Array<{ for: { in: string } }>;
    expect(select.map((x) => x.for.in)).toContain("arcMeasure");
  });

  test('"Measure" is offered in the Label contents dropdown, after the three computed ones', () => {
    const items = (
      capabilities["objects"] as unknown as Record<string, never>
    )["variationArc"]["properties"]["defaultSource"]["type"][
      "enumeration"
    ] as unknown as Array<{ value: string }>;
    expect(items.map((i) => i.value)).toEqual([
      "auto-abs",
      "auto-pct",
      "auto-both",
      "measure"
    ]);
  });
});

describe("variation arc — Label contents = Measure", () => {
  test("shows the bound measure at the destination pillar, in its own format", () => {
    const texts = arcTexts(
      { defaultSource: "measure" },
      { values: [0.121, 0.121, 0.084], format: "+0.0%;-0.0%" }
    );
    expect(texts).toContain("+8.4%");
    expect(texts.some((t) => t.includes("+100 | "))).toBe(false);
  });

  test("a TEXT measure is printed verbatim (escaped)", () => {
    const texts = arcTexts({ defaultSource: "measure" }, { values: ["ok", "ok", "▲ objectif <2026>"] });
    expect(texts).toContain("▲ objectif <2026>");
  });

  test("the measure's DYNAMIC format string wins over its model format", () => {
    const texts = arcTexts(
      { defaultSource: "measure" },
      {
        values: [0.5, 0.5, 0.25],
        format: "#,##0",
        rowObjects: [
          { general: { formatString: "0.0%" } },
          { general: { formatString: "0.0%" } },
          { general: { formatString: "0.0%" } }
        ]
      }
    );
    expect(texts).toContain("25.0%");
  });

  test("the arc's Custom format still overrides the measure's own", () => {
    const texts = arcTexts(
      { defaultSource: "measure", customFormat: "0.000" },
      { values: [0.5, 0.5, 0.25], format: "0.0%" }
    );
    expect(texts).toContain("0.250");
  });

  test("bucket empty → falls back to the computed delta, never a blank arc", () => {
    const texts = arcTexts({ defaultSource: "measure" });
    expect(texts).toContain("+100 | +100.0%");
  });

  test("the three historical choices are untouched by the new role", () => {
    const withBucket = { values: [1, 1, 9], format: "#,##0" };
    expect(arcTexts({ defaultSource: "auto-abs" }, withBucket)).toContain("+100");
    expect(arcTexts({ defaultSource: "auto-pct" }, withBucket)).toContain("+100.0%");
    expect(arcTexts({ defaultSource: "auto-both" }, withBucket)).toContain(
      "+100 | +100.0%"
    );
  });
});
