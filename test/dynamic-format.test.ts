
import * as fs from "fs";
import * as path from "path";
import { makeVisual, dvBuild } from "./_harness";

const capabilities = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "capabilities.json"), "utf-8")
) as Record<string, never>;

const fmt = (formatString: string) => ({ general: { formatString } });

function renderTexts(
  dv: unknown,
  objects: Record<string, unknown> = {},
  viewport = { width: 700, height: 460 }
): string[] {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDv = dv as any;
  anyDv.metadata.objects = { ...(anyDv.metadata.objects || {}), ...objects };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [anyDv], viewport, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return Array.from(target.querySelectorAll("text")).map((t) => t.textContent || "");
}

describe("dynamic format strings — capability declaration", () => {
  test("capabilities declares general.formatString (the switch that makes the host send them)", () => {
    const prop = capabilities["objects"]["general"]["properties"]["formatString"];
    expect(prop).toEqual({ type: { formatting: { formatString: true } } });
  });
});

describe("dynamic format strings — pillars and bridges", () => {
  const pctDv = () =>
    dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B"],
          objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
        }
      ],
      vals: [
        {
          name: "Marge",
          role: "actual",
          values: [0.12, 0.185],
          rowObjects: [fmt("0.0%"), fmt("0.0%")]
        }
      ]
    });

  test("a per-cell `0.0%` renders as a percentage on the pillar labels", () => {
    const texts = renderTexts(pctDv());
    expect(texts).toContain("12.0%");
    expect(texts).toContain("18.5%");
  });

  test("without the dynamic format the same data is a bare number (the bug)", () => {
    const bare = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B"],
          objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
        }
      ],
      vals: [{ name: "Marge", role: "actual", values: [0.12, 0.185] }]
    });
    const texts = renderTexts(bare);
    expect(texts.some((t) => t.includes("%"))).toBe(false);
  });

  test("two categories, two DIFFERENT dynamic formats — each bar keeps its own", () => {
    const dv = dvBuild({
      cats: [
        {
          name: "Indicateur",
          values: ["Revenue", "Marge"],
          objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
        }
      ],
      vals: [
        {
          name: "Valeur",
          role: "actual",
          values: [1250, 0.185],
          rowObjects: [fmt("#,##0 €"), fmt("0.0%")]
        }
      ]
    });
    const texts = renderTexts(dv);
    expect(texts).toContain("1,250 €");
    expect(texts).toContain("18.5%");
  });

  test("a BRIDGE label takes the dynamic format of its own category", () => {
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["Start", "Delta", "End"],
          objects: [
            { pillars: { isPillar: true } },
            { pillars: { isPillar: false } },
            { pillars: { isPillar: true } }
          ]
        }
      ],
      vals: [
        {
          name: "Valeur",
          role: "actual",
          values: [100, 25, 125],
          rowObjects: [fmt("#,##0 €"), fmt("#,##0 €"), fmt("#,##0 €")]
        }
      ]
    });
    const texts = renderTexts(dv);
    expect(texts).toContain("+25 €");
  });
});

describe("dynamic format strings — variance rails", () => {
  test("a rail label uses the per-cell format of its own bar", () => {
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B"],
          objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
        }
      ],
      vals: [
        { name: "Sales", role: "actual", values: [100, 200] },
        {
          name: "Δ",
          role: "variance",
          values: [0.052, -0.031],
          rowObjects: [fmt("+0.0%;-0.0%"), fmt("+0.0%;-0.0%")]
        }
      ],
      matrixSubtotals: false
    });
    const texts = renderTexts(dv);
    expect(texts).toContain("+5.2%");
    expect(texts).toContain("-3.1%");
  });
});

describe("what the screen reader hears matches what the label shows", () => {
  const ariaOf = (dv: unknown, objects: Record<string, unknown> = {}): string[] => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyDv = dv as any;
    anyDv.metadata.objects = { ...(anyDv.metadata.objects || {}), ...objects };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [anyDv], viewport: { width: 700, height: 420 }, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = (v as any).target as HTMLElement;
    return Array.from(target.querySelectorAll("g.wf-bar")).map(
      (g) => g.getAttribute("aria-label") || ""
    );
  };

  test("a per-cell % category is announced as a percentage, not in the primary measure's unit", () => {
    const dv = dvBuild({
      cats: [
        {
          name: "Indicateur",
          values: ["CA", "Marge"],
          objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
        }
      ],
      vals: [
        {
          name: "Valeur",
          role: "actual",
          values: [1250, 0.185],
          rowObjects: [fmt("#,##0 €"), fmt("0.0%")]
        }
      ]
    });
    const aria = ariaOf(dv);
    expect(aria.some((a) => a.includes("18.5%"))).toBe(true);
    expect(aria.some((a) => a.includes("1,250 €"))).toBe(true);
  });

  test("a card Custom format is announced too", () => {
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "B"], objects: [
          { pillars: { isPillar: true } }, { pillars: { isPillar: true } }
        ] }
      ],
      vals: [{ name: "Sales", role: "actual", values: [12.4, 14.2] }]
    });
    const aria = ariaOf(dv, { pillars: { customFormat: "0.0 pts" } });
    expect(aria.some((a) => a.includes("12.4 pts"))).toBe(true);
  });
});

describe("custom format overrides — one format per card", () => {
  const baseDv = () =>
    dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B"],
          objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
        }
      ],
      vals: [{ name: "Sales", role: "actual", values: [100, 250], format: "#,##0" }]
    });

  test("Pillars → Custom format beats the model format", () => {
    const texts = renderTexts(baseDv(), { pillars: { customFormat: "0.0 k€" } });
    expect(texts).toContain("100.0 k€");
    expect(texts).toContain("250.0 k€");
  });

  test("a blank custom format changes nothing (the default)", () => {
    const texts = renderTexts(baseDv(), { pillars: { customFormat: "   " } });
    expect(texts).toContain("100");
    expect(texts).toContain("250");
  });

  test("the ARC formats independently of the pillars it spans", () => {
    const texts = renderTexts(baseDv(), {
      pillars: { customFormat: "#,##0 €" },
      variationArc: { show: true, defaultSource: "auto-abs", customFormat: "+0.0 pts;-0.0 pts" }
    });
    expect(texts).toContain("100 €");
    expect(texts).toContain("+150.0 pts");
  });

  test("Bridges → Custom format applies to bridge labels only", () => {
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["Start", "Delta", "End"],
          objects: [
            { pillars: { isPillar: true } },
            { pillars: { isPillar: false } },
            { pillars: { isPillar: true } }
          ]
        }
      ],
      vals: [{ name: "Sales", role: "actual", values: [100, 25, 125], format: "#,##0" }]
    });
    const texts = renderTexts(dv, { bridges: { customFormat: "+0.00;-0.00" } });
    expect(texts).toContain("+25.00");
    expect(texts).toContain("100");
  });
});
