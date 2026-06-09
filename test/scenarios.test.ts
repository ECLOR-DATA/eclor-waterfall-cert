
import { Visual } from "../src/visual";
import { VisualFormattingSettingsModel } from "../src/settings";

import {
  makeMockHost,
  makeVisual,
  dvBuild,
  parse,
  mtxBuild
} from "./_harness";


describe("parseDataView: page-switch vs user-cleared states (null vs empty ParseResult)", () => {
  test("dv === undefined → null (page-switch signal)", () => {
    const v = makeVisual();
    expect(parse(v, undefined)).toBeNull();
  });

  test("dv.categorical === undefined → null (page-switch signal)", () => {
    const v = makeVisual();
    expect(parse(v, { categorical: undefined })).toBeNull();
  });

  test("dv.categorical = { undefined cats + undefined vals } → empty ParseResult, NOT null", () => {
    const v = makeVisual();
    const result = parse(v, { categorical: {} });
    expect(result).not.toBeNull();
    expect(result.points).toEqual([]);
    expect(result.isNoCategoryMode).toBe(false);
  });

  test("dv.categorical = { [] cats + [] vals } → empty ParseResult, NOT null", () => {
    const v = makeVisual();
    const result = parse(v, dvBuild({}));
    expect(result).not.toBeNull();
    expect(result.points).toEqual([]);
  });

  test("dim bound but Value bucket empty → empty ParseResult, NOT null", () => {
    const v = makeVisual();
    const dv = dvBuild({ cats: [{ name: "Cat", values: ["A", "B"] }] });
    const result = parse(v, dv);
    expect(result).not.toBeNull();
    expect(result.points).toEqual([]);
  });

  test("dim bound, no Value, but Variance role bound → still empty (Variance alone is not enough)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [{ name: "Var", role: "variance", values: [1, 2] }]
    });
    const result = parse(v, dv);
    expect(result).not.toBeNull();
    expect(result.points).toEqual([]);
  });
});

describe("parseDataView: single dim + 1 actual measure (the canonical cumulative path)", () => {
  test("3 categories, 3 values → 3 points, all with isPillar default=first+last", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [{ name: "Sales", role: "actual", values: [10, 20, 30] }]
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(3);
    expect(result.points[0].isPillar).toBe(true);
    expect(result.points[1].isPillar).toBe(false);
    expect(result.points[2].isPillar).toBe(true);
    expect(result.isNoCategoryMode).toBe(false);
  });

  test("Single row → single point, marked pillar (both first+last)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["X"] }],
      vals: [{ name: "Sales", role: "actual", values: [42] }]
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(1);
    expect(result.points[0].isPillar).toBe(true);
  });

  test("Negative values handled (sum + isPillar)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [{ name: "PnL", role: "actual", values: [-100, 50, -25] }]
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(3);
    expect(result.points[0].actual).toBe(-100);
    expect(result.points[1].actual).toBe(50);
    expect(result.points[2].actual).toBe(-25);
  });

  test("Per-category object override: isPillar=true persists", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B", "C"],
          objects: [
            undefined as unknown as Record<string, unknown>,
            { pillars: { isPillar: true } },
            undefined as unknown as Record<string, unknown>
          ]
        }
      ],
      vals: [{ name: "Sales", role: "actual", values: [10, 20, 30] }]
    });
    const result = parse(v, dv);
    expect(result.points[1].isPillar).toBe(true);
  });

  test("Per-category object override: isPillar=false on first/last (user override beats default)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B", "C"],
          objects: [
            { pillars: { isPillar: false } },
            undefined as unknown as Record<string, unknown>,
            { pillars: { isPillar: false } }
          ]
        }
      ],
      vals: [{ name: "Sales", role: "actual", values: [10, 20, 30] }]
    });
    const result = parse(v, dv);
    expect(result.points[0].isPillar).toBe(false);
    expect(result.points[1].isPillar).toBe(false);
    expect(result.points[2].isPillar).toBe(false);
  });

  test("Categories whose ONLY row is null on the primary actual are filtered out (1.1.12.0+)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [{ name: "Sales", role: "actual", values: [null, 50] }]
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(1);
    expect(result.points[0].label).toBe("B");
    expect(result.points[0].actual).toBe(50);
  });

  test("Mixed null + non-null rows in the SAME unique category keep the category alive", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "A", "B"] }],
      vals: [{ name: "Sales", role: "actual", values: [null, 30, 50] }]
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(2);
    expect(result.points[0].label).toBe("A");
    expect(result.points[0].actual).toBe(30);
    expect(result.points[1].actual).toBe(50);
  });
});

describe("parseDataView: measure-driven fx colour rules (the analysisDim regression)", () => {
  test("colorBridge fill on a VALUE column's per-row objects is resolved onto the bridge", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [
        {
          name: "Sales",
          role: "actual",
          values: [10, 20, 30],
          rowObjects: [
            undefined,
            { bridges: { colorBridge: { solid: { color: "#ff0000" } } } },
            undefined
          ]
        }
      ]
    });
    const result = parse(v, dv);
    expect(result.categoryDisplay[1].bridgeColor).toBe("#ff0000");
    expect(result.categoryDisplay[0].bridgeColor).toBeUndefined();
  });

  test("pillarColor fill on a VALUE column's per-row objects is resolved onto the pillar", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [
        {
          name: "Sales",
          role: "actual",
          values: [10, 20, 30],
          rowObjects: [
            { pillars: { pillarColor: { solid: { color: "#abcdef" } } } },
            undefined,
            undefined
          ]
        }
      ]
    });
    const result = parse(v, dv);
    expect(result.categoryDisplay[0].pillarColor).toBe("#abcdef");
  });

  test("category-column fill keeps PRIORITY over a value-column fill (scan order preserved)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B"],
          objects: [
            { bridges: { colorBridge: { solid: { color: "#00ff00" } } } },
            undefined as unknown as Record<string, unknown>
          ]
        }
      ],
      vals: [
        {
          name: "Sales",
          role: "actual",
          values: [10, 20],
          rowObjects: [
            { bridges: { colorBridge: { solid: { color: "#0000ff" } } } },
            undefined
          ]
        }
      ]
    });
    const result = parse(v, dv);
    expect(result.categoryDisplay[0].bridgeColor).toBe("#00ff00");
  });
});

describe("comparison bridge fx colour is per-X, independent of the Table (analysisDim) split", () => {
  const DEFAULT_PILLAR = "#cccccc";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const synthBridges = (v: any, dv: unknown) => {
    const parsed = parse(v, dv);
    const synth = v.synthesizeComparisonBridge(parsed, DEFAULT_PILLAR);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return synth.categoryDisplay.filter((c: any) => c.isPillar === false);
  };

  test("each X-category bridge keeps its own colour when the Table dim splits it into N rows", () => {
    const v = makeVisual();
    const bridges = synthBridges(
      v,
      dvBuild({
        cats: [
          { name: "Cat", values: ["A", "A", "B", "B"] },
          { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Budget", role: "actual", values: [100, 100, 200, 200] },
          {
            name: "Actual",
            role: "actual",
            values: [120, 120, 250, 250],
            rowObjects: [
              { bridges: { colorBridge: { solid: { color: "#ff0000" } } } },
              { bridges: { colorBridge: { solid: { color: "#ff0000" } } } },
              { bridges: { colorBridge: { solid: { color: "#00ff00" } } } },
              { bridges: { colorBridge: { solid: { color: "#00ff00" } } } }
            ]
          }
        ]
      })
    );
    expect(bridges.length).toBe(2);
    expect(bridges[0].bridgeColor).toBe("#ff0000");
    expect(bridges[1].bridgeColor).toBe("#00ff00");
    expect(bridges[0].bridgeColor).not.toBe(bridges[1].bridgeColor);
  });

  test("majority wins when an X-category's split rows disagree (ties → first-seen)", () => {
    const v = makeVisual();
    const bridges = synthBridges(
      v,
      dvBuild({
        cats: [
          { name: "Cat", values: ["A", "A", "A", "B", "B"] },
          { name: "Region", values: ["EMEA", "NA", "APAC", "EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Budget", role: "actual", values: [10, 10, 10, 20, 20] },
          {
            name: "Actual",
            role: "actual",
            values: [12, 12, 12, 25, 25],
            rowObjects: [
              { bridges: { colorBridge: { solid: { color: "#ff0000" } } } },
              { bridges: { colorBridge: { solid: { color: "#ff0000" } } } },
              { bridges: { colorBridge: { solid: { color: "#0000ff" } } } },
              { bridges: { colorBridge: { solid: { color: "#00ff00" } } } },
              { bridges: { colorBridge: { solid: { color: "#00ff00" } } } }
            ]
          }
        ]
      })
    );
    expect(bridges[0].bridgeColor).toBe("#ff0000");
    expect(bridges[1].bridgeColor).toBe("#00ff00");
  });

  test("single-value Table (1 row per X) stays byte-identical (majority of one)", () => {
    const v = makeVisual();
    const bridges = synthBridges(
      v,
      dvBuild({
        cats: [
          { name: "Cat", values: ["A", "B"] },
          { name: "Region", values: ["EMEA", "EMEA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Budget", role: "actual", values: [100, 200] },
          {
            name: "Actual",
            role: "actual",
            values: [120, 250],
            rowObjects: [
              { bridges: { colorBridge: { solid: { color: "#ff0000" } } } },
              { bridges: { colorBridge: { solid: { color: "#00ff00" } } } }
            ]
          }
        ]
      })
    );
    expect(bridges[0].bridgeColor).toBe("#ff0000");
    expect(bridges[1].bridgeColor).toBe("#00ff00");
  });

  test("dominant-magnitude sub-row wins even when out-numbered (sum-crosses-threshold)", () => {
    const v = makeVisual();
    const bridges = synthBridges(
      v,
      dvBuild({
        cats: [
          { name: "Cat", values: ["A", "A", "A", "B", "B"] },
          { name: "Region", values: ["EMEA", "NA", "APAC", "EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Budget", role: "actual", values: [1, 1, 1000, 20, 20] },
          {
            name: "Actual",
            role: "actual",
            values: [1, 1, 1200, 25, 25],
            rowObjects: [
              { bridges: { colorBridge: { solid: { color: "#000000" } } } },
              { bridges: { colorBridge: { solid: { color: "#000000" } } } },
              { bridges: { colorBridge: { solid: { color: "#ff0000" } } } },
              { bridges: { colorBridge: { solid: { color: "#00ff00" } } } },
              { bridges: { colorBridge: { solid: { color: "#00ff00" } } } }
            ]
          }
        ]
      })
    );
    expect(bridges[0].bridgeColor).toBe("#ff0000");
    expect(bridges[1].bridgeColor).toBe("#00ff00");
  });

  test("numerous AND dominant sub-rows keep their colour (weight agrees with count)", () => {
    const v = makeVisual();
    const bridges = synthBridges(
      v,
      dvBuild({
        cats: [
          { name: "Cat", values: ["A", "A", "A", "B", "B"] },
          { name: "Region", values: ["EMEA", "NA", "APAC", "EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Budget", role: "actual", values: [500, 500, 3, 20, 20] },
          {
            name: "Actual",
            role: "actual",
            values: [600, 600, 4, 25, 25],
            rowObjects: [
              { bridges: { colorBridge: { solid: { color: "#ff0000" } } } },
              { bridges: { colorBridge: { solid: { color: "#ff0000" } } } },
              { bridges: { colorBridge: { solid: { color: "#0000ff" } } } },
              { bridges: { colorBridge: { solid: { color: "#00ff00" } } } },
              { bridges: { colorBridge: { solid: { color: "#00ff00" } } } }
            ]
          }
        ]
      })
    );
    expect(bridges[0].bridgeColor).toBe("#ff0000");
    expect(bridges[1].bridgeColor).toBe("#00ff00");
  });

  test("comparison bridge colour follows the aggregate SIGN, not the largest opposite-sign member", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings.general.mode.value.value = "comparison";
    const bridges = synthBridges(
      v,
      dvBuild({
        cats: [
          { name: "Cat", values: ["A", "A", "A", "A", "B"] },
          { name: "Region", values: ["N", "S", "E", "W", "N"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Budget", role: "actual", values: [200, 200, 200, 200, 100] },
          {
            name: "Actual",
            role: "actual",
            values: [1200, -200, -200, -200, 300],
            rowObjects: [
              { bridges: { colorBridge: { solid: { color: "#00ff00" } } } },
              { bridges: { colorBridge: { solid: { color: "#ff0000" } } } },
              { bridges: { colorBridge: { solid: { color: "#ff0000" } } } },
              { bridges: { colorBridge: { solid: { color: "#ff0000" } } } },
              { bridges: { colorBridge: { solid: { color: "#00ff00" } } } }
            ]
          }
        ]
      })
    );
    expect(bridges[0].bridgeColor).toBe("#ff0000");
    expect(bridges[1].bridgeColor).toBe("#00ff00");
  });
});

describe("sign-aware fx resolution: cumulative / pillar basis (1.1.30.0)", () => {
  test("pillarColor follows the aggregate sign across a mixed-sign analysisDim split", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "A", "A", "B"] },
        { name: "Region", values: ["N", "S", "E", "W", "N"], isAnalysisDim: true }
      ],
      vals: [
        {
          name: "Sales",
          role: "actual",
          values: [1000, -400, -400, -400, 50],
          rowObjects: [
            { pillars: { pillarColor: { solid: { color: "#00ff00" } } } },
            { pillars: { pillarColor: { solid: { color: "#ff0000" } } } },
            { pillars: { pillarColor: { solid: { color: "#ff0000" } } } },
            { pillars: { pillarColor: { solid: { color: "#ff0000" } } } },
            { pillars: { pillarColor: { solid: { color: "#00ff00" } } } }
          ]
        }
      ]
    });
    const r = parse(v, dv);
    expect(r.categoryDisplay[0].pillarColor).toBe("#ff0000");
    expect(r.categoryDisplay[1].pillarColor).toBe("#00ff00");
  });

  test("all-same-sign category stays identical to the weighted vote (no spurious sign gating)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "A"] },
        { name: "Region", values: ["N", "S", "E"], isAnalysisDim: true }
      ],
      vals: [
        {
          name: "Sales",
          role: "actual",
          values: [1000, 5, 5],
          rowObjects: [
            { pillars: { pillarColor: { solid: { color: "#0000ff" } } } },
            { pillars: { pillarColor: { solid: { color: "#ff0000" } } } },
            { pillars: { pillarColor: { solid: { color: "#ff0000" } } } }
          ]
        }
      ]
    });
    const r = parse(v, dv);
    expect(r.categoryDisplay[0].pillarColor).toBe("#0000ff");
  });
});

describe("variance per-measure colour pickers persist to the varianceMeasure object (1.1.37.0)", () => {
  test("getFormattingModel puts the per-measure colour slices under a 'varianceMeasure' card, not 'rails'", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).cachedVarianceMeasures = [
      {
        queryName: "Sum(Var)",
        defaultDisplayName: "Var",
        name: "Var",
        colorPos: "#111111",
        colorNeg: "#222222",
        colorName: "#333333",
        colorTextPos: "#444444",
        colorTextNeg: "#555555",
        colorTextBgPos: "",
        colorTextBgNeg: "",
        colorTextBgTransparency: 0,
        displayUnits: "auto",
        decimalPlaces: 0
      }
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fs = (v as any).formattingSettings;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vmCard = fs.cards.find((c: any) => c.name === "varianceMeasure");
    expect(vmCard).toBeDefined();
    const sliceNames = vmCard.groups.flatMap(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (g: any) => g.slices.map((s: any) => s.name)
    );
    expect(sliceNames).toContain("colorPos");
    expect(sliceNames).toContain("colorTextBgNeg");
    expect(fs.rails.groups.length).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(fs.cards.filter((c: any) => c.name === "varianceMeasure").length).toBe(1);
  });
});

describe("variance rails: per-X aggregation under analysisDim (additive sum vs non-additive %) (1.1.40.0)", () => {
  test("%-formatted variance: representative leaf, NOT the sum, when the Table dim splits the X", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      dvBuild({
        cats: [
          { name: "Month", values: ["A", "A", "B", "B"] },
          { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Amount", role: "actual", values: [100, 100, 200, 200] },
          { name: "VarPct", role: "variance", values: [0.05, 0.05, -0.03, -0.03], format: "0.0%" }
        ]
      })
    );
    expect(result.points.length).toBe(2);
    expect(result.points[0].varianceValues[0]).toBe(0.05);
    expect(result.points[1].varianceValues[0]).toBe(-0.03);
  });

  test("%-format with differing members: one real member's value, never the sum", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      dvBuild({
        cats: [
          { name: "Month", values: ["A", "A"] },
          { name: "Region", values: ["EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Amount", role: "actual", values: [100, 100] },
          { name: "VarPct", role: "variance", values: [0.05, 0.09], format: "0.0%" }
        ]
      })
    );
    expect(result.points[0].varianceValues[0]).toBe(0.05);
  });

  test("additive (non-%) variance: STILL sums across the Table split (bridge alignment preserved)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      dvBuild({
        cats: [
          { name: "Month", values: ["A", "A", "B", "B"] },
          { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Amount", role: "actual", values: [100, 100, 200, 200] },
          { name: "VarAmt", role: "variance", values: [10, 20, -5, -15], format: "#,##0" }
        ]
      })
    );
    expect(result.points[0].varianceValues[0]).toBe(30);
    expect(result.points[1].varianceValues[0]).toBe(-20);
  });

  test("non-% measure IDENTICAL on every member (per-X / table-independent): value verbatim, NOT summed", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      dvBuild({
        cats: [
          { name: "Month", values: ["A", "A", "B", "B"] },
          { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Amount", role: "actual", values: [100, 100, 200, 200] },
          { name: "VarPerX", role: "variance", values: [7, 7, -4, -4], format: "#,##0" }
        ]
      })
    );
    expect(result.points[0].varianceValues[0]).toBe(7);
    expect(result.points[1].varianceValues[0]).toBe(-4);
  });

  test("first leaf null on a %-measure: representative skips to next non-null", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      dvBuild({
        cats: [
          { name: "Month", values: ["A", "A"] },
          { name: "Region", values: ["EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Amount", role: "actual", values: [100, 100] },
          { name: "VarPct", role: "variance", values: [null, 0.07], format: "0.0%" }
        ]
      })
    );
    expect(result.points[0].varianceValues[0]).toBe(0.07);
  });

  test("rail scale: maxAbs tracks the DISPLAYED per-X values (not raw leaves) so bars stay visible", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      dvBuild({
        cats: [
          { name: "X", values: ["A", "A", "B", "B"] },
          { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Actual", role: "actual", values: [100, 100, 100, 100] },
          { name: "VarPct", role: "variance", values: [0.05, 0.09, 0.07, 0.02], format: "0.0%" }
        ]
      })
    );
    expect(result.points[0].varianceValues[0]).toBe(0.05);
    expect(result.points[1].varianceValues[0]).toBe(0.07);
    expect(result.varianceMeasures[0].maxAbs).toBeCloseTo(0.07, 9);
    const maxAbs = result.varianceMeasures[0].maxAbs;
    for (const p of result.points) {
      const val = p.varianceValues[0] as number;
      const normalized = Math.abs(Math.max(Math.min(val / maxAbs, 1), -1));
      expect(normalized).toBeGreaterThan(0.5);
    }
  });

  test("rail scale: additive variance maxAbs = max of the per-X SUMS, not the leaf max", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      dvBuild({
        cats: [
          { name: "X", values: ["A", "A", "B", "B"] },
          { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Actual", role: "actual", values: [100, 100, 100, 100] },
          { name: "VarAmt", role: "variance", values: [10, 20, 4, 7], format: "#,##0" }
        ]
      })
    );
    expect(result.points[0].varianceValues[0]).toBe(30);
    expect(result.points[1].varianceValues[0]).toBe(11);
    expect(result.varianceMeasures[0].maxAbs).toBe(30);
  });
});

describe("variance rails: X-grain matrix lookup mechanics (flat/levels-less shape)", () => {
  test("matrix X-grain value WINS over the categorical leaf SUM", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      dvBuild({
        cats: [
          { name: "Month", values: ["A", "A", "B", "B"] },
          { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Amount", role: "actual", values: [100, 100, 100, 100] },
          { name: "Var", role: "variance", values: [100, 80, 50, 40], format: "#,##0" }
        ],
        matrixVar: {
          xOrder: ["A", "B"],
          measures: [{ queryName: "Var", values: [110, 60] }]
        }
      })
    );
    expect(result.points[0].varianceValues[0]).toBe(110);
    expect(result.points[1].varianceValues[0]).toBe(60);
  });

  test("no matrix facet → falls back to the categorical per-X aggregate (host-version safety)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      dvBuild({
        cats: [
          { name: "Month", values: ["A", "A", "B", "B"] },
          { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Amount", role: "actual", values: [100, 100, 100, 100] },
          { name: "Var", role: "variance", values: [100, 80, 50, 40], format: "#,##0" }
        ]
      })
    );
    expect(result.points[0].varianceValues[0]).toBe(180);
    expect(result.points[1].varianceValues[0]).toBe(90);
  });

  test("alignment is by queryName, NOT matrix column order", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      dvBuild({
        cats: [{ name: "Month", values: ["A", "B"] }],
        vals: [
          { name: "Amount", role: "actual", values: [100, 100] },
          { name: "VarA", role: "variance", values: [1, 2], format: "#,##0" },
          { name: "VarB", role: "variance", values: [3, 4], format: "#,##0" }
        ],
        matrixVar: {
          xOrder: ["A", "B"],
          measures: [
            { queryName: "VarB", values: [33, 44] },
            { queryName: "VarA", values: [11, 22] }
          ]
        }
      })
    );
    expect(result.points[0].varianceValues[0]).toBe(11);
    expect(result.points[0].varianceValues[1]).toBe(33);
    expect(result.points[1].varianceValues[0]).toBe(22);
    expect(result.points[1].varianceValues[1]).toBe(44);
  });

  test("maxAbs (rail scale) follows the matrix X values, not the categorical leaves", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      dvBuild({
        cats: [
          { name: "Month", values: ["A", "A", "B", "B"] },
          { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Amount", role: "actual", values: [100, 100, 100, 100] },
          { name: "Var", role: "variance", values: [100, 80, 50, 40], format: "#,##0" }
        ],
        matrixVar: {
          xOrder: ["A", "B"],
          measures: [{ queryName: "Var", values: [110, 60] }]
        }
      })
    );
    expect(result.varianceMeasures[0].maxAbs).toBe(110);
  });

  test("null matrix value for an X → uses the engine null, not the leaf sum", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      dvBuild({
        cats: [
          { name: "Month", values: ["A", "A", "B", "B"] },
          { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Amount", role: "actual", values: [100, 100, 100, 100] },
          { name: "Var", role: "variance", values: [100, 80, 50, 40], format: "#,##0" }
        ],
        matrixVar: {
          xOrder: ["A", "B"],
          measures: [{ queryName: "Var", values: [null, 60] }]
        }
      })
    );
    expect(result.points[0].varianceValues[0]).toBeNull();
    expect(result.points[1].varianceValues[0]).toBe(60);
  });

  test("queryName mismatch but equal column count → falls back to position mapping (still applies)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      dvBuild({
        cats: [
          { name: "Month", values: ["A", "A", "B", "B"] },
          { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Amount", role: "actual", values: [100, 100, 100, 100] },
          { name: "Var", role: "variance", values: [100, 80, 50, 40], format: "#,##0", queryName: "Var" }
        ],
        matrixVar: {
          xOrder: ["A", "B"],
          measures: [{ queryName: "Sum(Table.Var)", values: [110, 60] }]
        }
      })
    );
    expect(result.points[0].varianceValues[0]).toBe(110);
    expect(result.points[1].varianceValues[0]).toBe(60);
  });

  test("currency-rounded leaves (1e-6 tolerance): representative value, not the double", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      dvBuild({
        cats: [
          { name: "Month", values: ["A", "A"] },
          { name: "Region", values: ["EMEA", "NA"], isAnalysisDim: true }
        ],
        vals: [
          { name: "Amount", role: "actual", values: [100, 100] },
          { name: "Var", role: "variance", values: [150000.4, 150000.5], format: "#,##0" }
        ]
      })
    );
    expect(result.points[0].varianceValues[0]).toBeCloseTo(150000.4, 1);
  });
});

describe("matrix mapping: adapter + X-only subtotals (1.1.49.0)", () => {

  test("adapter parity: 2 countries × 2 products flatten to the same points as categorical", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [
          { name: "Country", role: "category" },
          { name: "Product", role: "analysisDim" }
        ],
        measures: [
          { name: "Amount", role: "actual" },
          { name: "Var", role: "variance", format: "#,##0" }
        ],
        children: [
          {
            value: "Germany",
            children: [
              { value: "VTT", cells: [100, -10] },
              { value: "Velo", cells: [200, -20] }
            ]
          },
          {
            value: "France",
            children: [
              { value: "VTT", cells: [50, -5] },
              { value: "Velo", cells: [70, -7] }
            ]
          }
        ]
      })
    );
    expect(result).not.toBeNull();
    expect(result.isNoCategoryMode).toBe(false);
    expect(result.points.length).toBe(2);
    expect(result.categoryDisplay[0].label).toBe("Germany");
    expect(result.categoryDisplay[1].label).toBe("France");
    expect(result.points[0].actual).toBe(300);
    expect(result.points[1].actual).toBe(120);
    expect(result.analysis).not.toBeNull();
    expect(result.analysis.rowLabels).toEqual(["VTT", "Velo"]);
  });

  test("X-only variance read from the isSubtotal CHILD (engine rollup wins over leaf sum)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [
          { name: "Country", role: "category" },
          { name: "Product", role: "analysisDim" }
        ],
        measures: [
          { name: "Amount", role: "actual" },
          { name: "Var", role: "variance", format: "#,##0.0" }
        ],
        children: [
          {
            value: "Germany",
            children: [
              { isSubtotal: true, cells: [300, -12.5] },
              { value: "VTT", cells: [100, -10] },
              { value: "Velo", cells: [200, -20] }
            ]
          },
          {
            value: "France",
            children: [
              { value: "VTT", cells: [50, -5] },
              { value: "Velo", cells: [70, -7] },
              { isSubtotal: true, cells: [120, -4.2] }
            ]
          }
        ]
      })
    );
    expect(result.points[0].varianceValues[0]).toBe(-12.5);
    expect(result.points[1].varianceValues[0]).toBe(-4.2);
    expect(result.points[0].actual).toBe(300);
    expect(result.points[1].actual).toBe(120);
    expect(result.varianceMeasures[0].maxAbs).toBeCloseTo(12.5, 9);
  });

  test("X-only variance read from the category node's OWN values when no subtotal child", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [
          { name: "Country", role: "category" },
          { name: "Product", role: "analysisDim" }
        ],
        measures: [
          { name: "Amount", role: "actual" },
          { name: "Var", role: "variance", format: "#,##0.0" }
        ],
        children: [
          {
            value: "Germany",
            cells: [300, -12.5],
            children: [
              { value: "VTT", cells: [100, -10] },
              { value: "Velo", cells: [200, -20] }
            ]
          }
        ]
      })
    );
    expect(result.points[0].varianceValues[0]).toBe(-12.5);
  });

  test("no subtotal info anywhere → falls back to the leaf aggregate (additive sum)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [
          { name: "Country", role: "category" },
          { name: "Product", role: "analysisDim" }
        ],
        measures: [
          { name: "Amount", role: "actual" },
          { name: "Var", role: "variance", format: "#,##0" }
        ],
        children: [
          {
            value: "Germany",
            children: [
              { value: "VTT", cells: [100, -10] },
              { value: "Velo", cells: [200, -20] }
            ]
          }
        ]
      })
    );
    expect(result.points[0].varianceValues[0]).toBe(-30);
  });

  test("grand-total root node (isSubtotal) is skipped — no phantom category", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [
          { name: "Country", role: "category" },
          { name: "Product", role: "analysisDim" }
        ],
        measures: [
          { name: "Amount", role: "actual" },
          { name: "Var", role: "variance", format: "#,##0" }
        ],
        children: [
          { isSubtotal: true, cells: [420, -19] },
          {
            value: "Germany",
            children: [
              { value: "VTT", cells: [100, -10] },
              { value: "Velo", cells: [200, -20] }
            ]
          },
          {
            value: "France",
            children: [{ value: "VTT", cells: [120, -9] }]
          }
        ]
      })
    );
    expect(result.points.length).toBe(2);
    expect(result.categoryDisplay.map((c: { label: string }) => c.label)).toEqual([
      "Germany",
      "France"
    ]);
  });

  test("legend as middle row level: legendValues parsed, leaves flattened per (X × legend × member)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [
          { name: "Country", role: "category" },
          { name: "Channel", role: "legend" },
          { name: "Product", role: "analysisDim" }
        ],
        measures: [{ name: "Amount", role: "actual" }],
        children: [
          {
            value: "Germany",
            children: [
              {
                value: "Retail",
                children: [
                  { value: "VTT", cells: [60] },
                  { value: "Velo", cells: [40] }
                ]
              },
              {
                value: "Online",
                children: [{ value: "VTT", cells: [25] }]
              }
            ]
          }
        ]
      })
    );
    expect(result.points.length).toBe(1);
    expect(result.points[0].actual).toBe(125);
    expect(result.legendValues.length).toBe(2);
    expect(result.legendValues.map((l: { label: string }) => l.label)).toEqual([
      "Retail",
      "Online"
    ]);
    expect(result.analysis.rowLabels).toEqual(["VTT", "Velo"]);
  });

  test("highlights flow through matrix cells to highlightedCatIdxs", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [{ name: "Country", role: "category" }],
        measures: [{ name: "Amount", role: "actual" }],
        children: [
          { value: "Germany", cells: [300], cellHighlights: [300] },
          { value: "France", cells: [120], cellHighlights: [null] }
        ]
      })
    );
    expect(result.highlightedCatIdxs).not.toBeNull();
    expect(result.highlightedCatIdxs.has(0)).toBe(true);
    expect(result.highlightedCatIdxs.has(1)).toBe(false);
  });

  test("measures-only (no grouping level): root values become the single row → no-category mode", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [],
        measures: [
          { name: "Actual M-1", role: "actual" },
          { name: "Actual", role: "actual" }
        ],
        children: [],
        rootCells: [1000, 1200]
      })
    );
    expect(result).not.toBeNull();
    expect(result.isNoCategoryMode).toBe(true);
    expect(result.points.length).toBe(2);
  });

  test("empty matrix (no levels, no children, no values) → empty ParseResult, NOT null", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({ levels: [], measures: [], children: [] })
    );
    expect(result).not.toBeNull();
    expect(result.points).toEqual([]);
  });

  test("composite (field-param) category level: adapter + subtotal harvest share the SAME key", () => {
    const v = makeVisual();
    const dv = mtxBuild({
      levels: [
        { name: "Country", role: "category" },
        { name: "Product", role: "analysisDim" }
      ],
      measures: [
        { name: "Amount", role: "actual" },
        { name: "Var", role: "variance", format: "#,##0.0" }
      ],
      children: []
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dv as any).matrix.rows.root.children = [
      {
        levelValues: [{ value: "Germany", levelSourceIndex: 0 }],
        identity: {},
        children: [
          { isSubtotal: true, values: { 0: { value: 300 }, 1: { value: -12.5 } } },
          { value: "VTT", identity: {}, values: { 0: { value: 100 }, 1: { value: -10 } } },
          { value: "Velo", identity: {}, values: { 0: { value: 200 }, 1: { value: -20 } } }
        ]
      }
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(v, dv);
    expect(result.categoryDisplay[0].label).toBe("Germany");
    expect(result.points[0].varianceValues[0]).toBe(-12.5);
  });

  test("multi-level Category (drill expand-all): lookup BAILS to leaf aggregate — never a wrong-level subtotal", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [
          { name: "Region", role: "category" },
          { name: "Country", role: "category" }
        ],
        measures: [
          { name: "Amount", role: "actual" },
          { name: "Var", role: "variance", format: "#,##0.00" }
        ],
        children: [
          {
            value: "EMEA",
            children: [
              { isSubtotal: true, cells: [100, -0.5] },
              { value: "France", cells: [100, -0.97] }
            ]
          },
          {
            value: "France",
            children: [
              { isSubtotal: true, cells: [200, -0.111] },
              { value: "Nice", cells: [200, -0.4] }
            ]
          }
        ]
      })
    );
    expect(result.categoryDisplay.map((c: { label: string }) => c.label)).toEqual([
      "France",
      "Nice"
    ]);
    expect(result.points[0].varianceValues[0]).toBe(-0.97);
    expect(result.points[1].varianceValues[0]).toBe(-0.4);
  });

  test("two level-0 members stringifying to the same key (null vs '') → merged bar falls back, no last-wins subtotal", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [
          { name: "Country", role: "category" },
          { name: "Product", role: "analysisDim" }
        ],
        measures: [
          { name: "Amount", role: "actual" },
          { name: "Var", role: "variance", format: "#,##0.0" }
        ],
        children: [
          {
            value: null,
            children: [
              { isSubtotal: true, cells: [100, -0.2] },
              { value: "VTT", cells: [100, -0.2] }
            ]
          },
          {
            value: "",
            children: [
              { isSubtotal: true, cells: [200, -0.9] },
              { value: "Velo", cells: [200, -0.9] }
            ]
          }
        ]
      })
    );
    expect(result.points.length).toBe(1);
    expect(result.points[0].actual).toBe(300);
    expect(result.points[0].varianceValues[0]).toBeCloseTo(-1.1, 9);
  });

  test("fx cascade layer 1: node.objects on a category node flows into the per-row fx colour resolution", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [{ name: "Country", role: "category" }],
        measures: [{ name: "Amount", role: "actual" }],
        children: [
          {
            value: "Germany",
            cells: [300],
            objects: { bridges: { colorBridge: { solid: { color: "#12ab34" } } } }
          },
          { value: "France", cells: [120] }
        ]
      })
    );
    expect(result.categoryDisplay[0].bridgeColor).toBe("#12ab34");
    expect(result.categoryDisplay[1].bridgeColor).toBeUndefined();
  });

  test("fx cascade layer 4: cell.objects (measure-driven rule fill) flows into the value-column per-row scan", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [
          { name: "Country", role: "category" },
          { name: "Product", role: "analysisDim" }
        ],
        measures: [{ name: "Amount", role: "actual" }],
        children: [
          {
            value: "Germany",
            children: [
              {
                value: "VTT",
                cells: [100],
                cellObjects: [{ bridges: { colorBridge: { solid: { color: "#ab1234" } } } }]
              },
              { value: "Velo", cells: [200] }
            ]
          }
        ]
      })
    );
    expect(result.categoryDisplay[0].bridgeColor).toBe("#ab1234");
  });

  test("THE user scenario: % variance whose leaves vary per product → engine subtotal wins", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [
          { name: "Country", role: "category" },
          { name: "Product", role: "analysisDim" }
        ],
        measures: [
          { name: "Amount", role: "actual" },
          { name: "Δ M-1 %", role: "variance", format: "0.0%" }
        ],
        children: [
          {
            value: "Germany",
            children: [
              { isSubtotal: true, cells: [300, -0.954] },
              { value: "VTT", cells: [100, -0.97] },
              { value: "Velo", cells: [200, -0.98] }
            ]
          }
        ]
      })
    );
    expect(result.points[0].varianceValues[0]).toBe(-0.954);
  });
});

describe("matrix subtotals: multi-level Category (expanded hierarchy / drill) harvests at the DEEPEST category level (1.1.50.0)", () => {

  test("Year > Month expanded + Table: % rail reads the MONTH node's engine subtotal, not the first leaf", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [
          { name: "Year", role: "category" },
          { name: "Month", role: "category" },
          { name: "Product", role: "analysisDim" }
        ],
        measures: [
          { name: "Amount", role: "actual" },
          { name: "Proforma %", role: "variance", format: "0.0%" }
        ],
        children: [
          { isSubtotal: true, cells: [300, -0.95] },
          {
            value: "2026",
            children: [
              { isSubtotal: true, cells: [300, -0.95] },
              {
                value: "Jan",
                children: [
                  { isSubtotal: true, cells: [180, -0.93] },
                  { value: "VTT", cells: [80, -0.97] },
                  { value: "Velo", cells: [100, -0.9] }
                ]
              },
              {
                value: "Feb",
                children: [
                  { value: "VTT", cells: [50, -0.85] },
                  { value: "Velo", cells: [70, -0.91] },
                  { isSubtotal: true, cells: [120, -0.88] }
                ]
              }
            ]
          }
        ]
      })
    );
    expect(result.points.length).toBe(2);
    expect(result.categoryDisplay[0].label).toBe("Jan");
    expect(result.categoryDisplay[1].label).toBe("Feb");
    expect(result.points[0].actual).toBe(180);
    expect(result.points[1].actual).toBe(120);
    expect(result.points[0].varianceValues[0]).toBe(-0.93);
    expect(result.points[1].varianceValues[0]).toBe(-0.88);
  });

  test("duplicate deepest labels across parents (Jan 2025 / Jan 2026) → evicted → fallback, never a wrong-grain subtotal", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [
          { name: "Year", role: "category" },
          { name: "Month", role: "category" },
          { name: "Product", role: "analysisDim" }
        ],
        measures: [
          { name: "Amount", role: "actual" },
          { name: "Proforma %", role: "variance", format: "0.0%" }
        ],
        children: [
          {
            value: "2025",
            children: [
              {
                value: "Jan",
                children: [
                  { isSubtotal: true, cells: [100, -0.5] },
                  { value: "VTT", cells: [40, -0.4] },
                  { value: "Velo", cells: [60, -0.6] }
                ]
              }
            ]
          },
          {
            value: "2026",
            children: [
              {
                value: "Jan",
                children: [
                  { isSubtotal: true, cells: [200, -0.7] },
                  { value: "VTT", cells: [90, -0.65] },
                  { value: "Velo", cells: [110, -0.75] }
                ]
              }
            ]
          }
        ]
      })
    );
    expect(result.points.length).toBe(1);
    expect(result.points[0].actual).toBe(300);
    expect(result.points[0].varianceValues[0]).not.toBe(-0.5);
    expect(result.points[0].varianceValues[0]).not.toBe(-0.7);
    expect(result.points[0].varianceValues[0]).toBeCloseTo(-0.4, 9);
  });

  test("deepest category level IS the leaf level (no Table/Legend): own values read at the deep grain", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = parse(
      v,
      mtxBuild({
        levels: [
          { name: "Year", role: "category" },
          { name: "Month", role: "category" }
        ],
        measures: [
          { name: "Amount", role: "actual" },
          { name: "Proforma %", role: "variance", format: "0.0%" }
        ],
        children: [
          {
            value: "2026",
            children: [
              { value: "Jan", cells: [180, -0.93] },
              { value: "Feb", cells: [120, -0.88] }
            ]
          }
        ]
      })
    );
    expect(result.points.length).toBe(2);
    expect(result.points[0].varianceValues[0]).toBe(-0.93);
    expect(result.points[1].varianceValues[0]).toBe(-0.88);
  });
});

describe("variation-arc fx colour resolves FRESH per render, not from a frozen slice (1.1.38.0)", () => {
  const arcBgFor = (bgDest: string): string | null | undefined => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).cachedDefaultPillarColor = "#cccccc";
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B"],
          objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
        }
      ],
      vals: [
        {
          name: "Sales",
          role: "actual",
          values: [100, 200],
          rowObjects: [
            { variationArc: { labelBgColor: { solid: { color: "#00ff00" } } } },
            { variationArc: { labelBgColor: { solid: { color: bgDest } } } }
          ]
        }
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = { variationArc: { show: true, labelBgShow: true } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = (v as any).target as HTMLElement;
    expect(target.querySelector("parsererror")).toBeNull();
    const texts = Array.from(target.querySelectorAll("text"));
    const arcText = texts.find((t) => (t.textContent || "").includes("|"));
    const bgRect = arcText?.previousElementSibling as Element | null | undefined;
    return bgRect?.getAttribute("fill");
  };

  test("arc bg follows the destination pillar's per-category fill, and flips when it changes", () => {
    expect(arcBgFor("#0000ff")).toBe("#0000ff");
    expect(arcBgFor("#ff0000")).toBe("#ff0000");
  });
});

describe("variation-arc arrowEnds: which bracket end carries the arrow head (1.1.53.0)", () => {
  const arrowPathsFor = (arrowEnds?: string): string[] => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B"],
          objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
        }
      ],
      vals: [{ name: "Sales", role: "actual", values: [100, 200] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = {
      variationArc: {
        show: true,
        lineColor: { solid: { color: "#123456" } },
        ...(arrowEnds ? { arrowEnds } : {})
      },
      grandTotal: { showGrandTotal: false }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = (v as any).target as HTMLElement;
    expect(target.querySelector("parsererror")).toBeNull();
    return Array.from(target.querySelectorAll('path[fill="#123456"]')).map(
      (p) => p.getAttribute("d") || ""
    );
  };
  const tipX = (d: string): number => Number(/L ([\d.]+) [\d.]+ z/.exec(d)?.[1] ?? NaN);

  test("default (unset) → symmetric arrows on BOTH pillars (legacy look preserved)", () => {
    expect(arrowPathsFor(undefined).length).toBe(2);
  });

  test('"both" explicit → two arrows', () => {
    expect(arrowPathsFor("both").length).toBe(2);
  });

  test('"start" → single arrow, on the DEPARTURE pillar (left half)', () => {
    const ds = arrowPathsFor("start");
    expect(ds.length).toBe(1);
    expect(tipX(ds[0])).toBeLessThan(320);
  });

  test('"end" → single arrow, on the ARRIVAL pillar (right half)', () => {
    const ds = arrowPathsFor("end");
    expect(ds.length).toBe(1);
    expect(tipX(ds[0])).toBeGreaterThan(320);
  });

  test("unknown persisted value → falls back to both (saved-report safety)", () => {
    expect(arrowPathsFor("sideways").length).toBe(2);
  });
});

describe("audit lot 1 (1.1.54.0): fx fill escaping, legacy dropdown values, width clamps, rails rename", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const render = (dv: any): HTMLElement => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (v as any).target as HTMLElement;
  };

  test("F1 — a persisted fx fill containing an attribute breakout renders a parseable frame (no parsererror)", () => {
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B", "C"],
          objects: [
            undefined as unknown as Record<string, unknown>,
            { bridges: { colorBridge: { solid: { color: '"/><rect x="0' } } } },
            undefined as unknown as Record<string, unknown>
          ]
        }
      ],
      vals: [{ name: "Sales", role: "actual", values: [100, 50, 30] }]
    });
    const target = render(dv);
    expect(target.querySelector("parsererror")).toBeNull();
    expect(target.querySelectorAll("rect").length).toBeGreaterThan(0);
  });

  test("legacy variationArc.defaultSource 'measure-2' (1.0.69–82 reports) no longer kills the render — arc shows the auto-both label", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B"],
          objects: [{ pillars: { isPillar: true } }, { pillars: { isPillar: true } }]
        }
      ],
      vals: [{ name: "Sales", role: "actual", values: [100, 200] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = { variationArc: { show: true, defaultSource: "measure-2" } };
    const target = render(dv);
    expect(target.querySelector("parsererror")).toBeNull();
    const texts = Array.from(target.querySelectorAll("text"));
    const arcText = texts.find((t) => (t.textContent || "").includes("|"));
    expect(arcText).toBeTruthy();
  });

  test("FM-3 — persisted negative barWidth / connectorWidth are clamped, bars stay visible", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [{ name: "Sales", role: "actual", values: [100, 50, 30] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = {
      layout: { barWidth: -5 },
      connectors: { show: true, connectorWidth: -2 }
    };
    const target = render(dv);
    expect(target.querySelector("parsererror")).toBeNull();
    const barRects = Array.from(target.querySelectorAll("g.wf-bar rect"));
    expect(barRects.length).toBeGreaterThan(0);
    for (const r of barRects) {
      expect(Number(r.getAttribute("width"))).toBeGreaterThan(0);
    }
    const strokes = Array.from(target.querySelectorAll("line"))
      .map((l) => Number(l.getAttribute("stroke-width")))
      .filter((w) => !Number.isNaN(w));
    for (const w of strokes) expect(w).toBeGreaterThan(0);
  });

  test("PERF-3 — selection-id union is built lazily per category and memoised (multi-row = array, single-row = one id)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B"] },
        { name: "Region", values: ["N", "S", "N"], isAnalysisDim: true }
      ],
      vals: [{ name: "Sales", role: "actual", values: [10, 20, 30] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const display = (v as any).cachedCategoryDisplay;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idsA = (v as any).getCategorySelectionIds(display[0]);
    expect(Array.isArray(idsA)).toBe(true);
    expect((idsA as unknown[]).length).toBe(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v as any).getCategorySelectionIds(display[0])).toBe(idsA);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idsB = (v as any).getCategorySelectionIds(display[1]);
    expect(Array.isArray(idsB)).toBe(false);
    expect(idsB).toBe(display[1].selectionId);
  });

  test("PERF-6 — a PURE Resize update skips the re-parse and re-renders from the cached parse; Data|Resize takes the full path", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [{ name: "Sales", role: "actual", values: [100, 50, 30] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy = jest.spyOn(v as any, "parseDataView");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: { width: 500, height: 300 }, type: 4 });
    expect(spy).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = (v as any).target as HTMLElement;
    expect(target.querySelector("svg")).toBeTruthy();
    expect(target.querySelectorAll("g.wf-bar rect").length).toBeGreaterThan(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: { width: 520, height: 320 }, type: 6 });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test("PERF-6 — a Resize arriving with NO cached parse falls through to the full pipeline (fresh instance safety)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [{ name: "Sales", role: "actual", values: [10, 20] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy = jest.spyOn(v as any, "parseDataView");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 4 });
    expect(spy).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((v as any).target as HTMLElement).querySelector("svg")).toBeTruthy();
    spy.mockRestore();
  });

  test("PERF-7 — the tooltip payload is memoised per hovered bar (rebuilt only when the target changes)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [{ name: "Sales", role: "actual", values: [100, 50, 30] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = (v as any).target as HTMLElement;
    const bars = Array.from(target.querySelectorAll("[data-cat-idx]"));
    expect(bars.length).toBeGreaterThan(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy = jest.spyOn(v as any, "buildTooltipContext");
    bars[0].dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    bars[0].dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    bars[0].dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(spy).toHaveBeenCalledTimes(1);
    bars[1].dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  test("FM-2 — the 1.1.8.0 'Variance' card rename is live in BOTH locales (resjson no longer overrides it back)", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require("path") as typeof import("path");
    const read = (locale: string): Record<string, string> =>
      JSON.parse(
        fs.readFileSync(
          path.join(__dirname, "..", "stringResources", locale, "resources.resjson"),
          "utf8"
        )
      );
    expect(read("en-US").Visual_Rails).toBe("Variance");
    expect(read("fr-FR").Visual_Rails).toBe("Variance");
  });
});

describe("analysis-table row label emits no duplicate font-weight (1.1.34.0 freeze fix)", () => {
  test("card bold + rowLabelBold both on → SVG still renders (no parser error)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "B"] },
        { name: "Region", values: ["N", "N"], isAnalysisDim: true }
      ],
      vals: [{ name: "Sales", role: "actual", values: [10, 20] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = { analysisTable: { show: true, bold: true, rowLabelBold: true } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: { width: 520, height: 360 }, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = (v as any).target as HTMLElement;
    expect(target.querySelector("parsererror")).toBeNull();
    expect(target.querySelector("svg")).not.toBeNull();
    const rowTexts = Array.from(target.querySelectorAll(".wf-table-row text"));
    expect(rowTexts.length).toBeGreaterThan(0);
    expect(rowTexts.some((t) => t.getAttribute("font-weight") === "bold")).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fs = (v as any).formattingSettings;
    expect(String(fs.analysisTable.font.fontFamily.value || "").length).toBeGreaterThan(0);
    expect(String(fs.bridges.font.fontFamily.value || "").length).toBeGreaterThan(0);
  });
});

describe("table-row FOCUS re-resolves fx colours over the filtered subset (1.1.30.0)", () => {
  test("deriveFilteredParsed recomputes pillarColor for the focused analysisDim row", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).cachedDefaultPillarColor = "#cccccc";
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        { name: "Region", values: ["N", "S", "N", "S"], isAnalysisDim: true }
      ],
      vals: [
        {
          name: "Sales",
          role: "actual",
          values: [100, -300, 50, 50],
          rowObjects: [
            { pillars: { pillarColor: { solid: { color: "#00ff00" } } } },
            { pillars: { pillarColor: { solid: { color: "#ff0000" } } } },
            { pillars: { pillarColor: { solid: { color: "#00ff00" } } } },
            { pillars: { pillarColor: { solid: { color: "#00ff00" } } } }
          ]
        }
      ]
    });
    const parsed = parse(v, dv);
    expect(parsed.categoryDisplay[0].pillarColor).toBe("#ff0000");
    expect(parsed.categoryDisplay[1].pillarColor).toBe("#00ff00");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const focused = (v as any).deriveFilteredParsed(parsed, new Set([0]));
    expect(focused.categoryDisplay[0].pillarColor).toBe("#00ff00");
    expect(focused.categoryDisplay[1].pillarColor).toBe("#00ff00");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const focusedS = (v as any).deriveFilteredParsed(parsed, new Set([1]));
    expect(focusedS.categoryDisplay[0].pillarColor).toBe("#ff0000");
    expect(focusedS.categoryDisplay[1].pillarColor).toBe("#00ff00");
  });
});

describe("analysisDim row cross-filter targets the VALUE union, not the first (X,value) cell (1.1.32.0)", () => {
  test("rowSelIdsByValue holds one id per contributing data row, per value", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        { name: "Region", values: ["N", "S", "N", "S"], isAnalysisDim: true }
      ],
      vals: [{ name: "Sales", role: "actual", values: [1, 2, 3, 4] }]
    });
    const r = parse(v, dv);
    expect(r.analysis.rowLabels).toEqual(["N", "S"]);
    expect(r.analysis.rowSelIdsByValue.length).toBe(2);
    expect(r.analysis.rowSelIdsByValue[0].length).toBe(2);
    expect(r.analysis.rowSelIdsByValue[1].length).toBe(2);
  });

  test("unbalanced value (present in only one X) → union length matches its row count", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B"] },
        { name: "Region", values: ["N", "S", "N"], isAnalysisDim: true }
      ],
      vals: [{ name: "Sales", role: "actual", values: [1, 2, 3] }]
    });
    const r = parse(v, dv);
    expect(r.analysis.rowSelIdsByValue[0].length).toBe(2);
    expect(r.analysis.rowSelIdsByValue[1].length).toBe(1);
  });
});

describe("per-X majority generalizes to ALL six pillar/bridge fx colour slices (analysisDim split)", () => {
  const split = (objName: string, prop: string) =>
    dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "A", "B", "B"] },
        { name: "Region", values: ["EMEA", "NA", "APAC", "EMEA", "NA"], isAnalysisDim: true }
      ],
      vals: [
        {
          name: "Sales",
          role: "actual",
          values: [12, 12, 12, 25, 25],
          rowObjects: [
            { [objName]: { [prop]: { solid: { color: "#ff0000" } } } },
            { [objName]: { [prop]: { solid: { color: "#ff0000" } } } },
            { [objName]: { [prop]: { solid: { color: "#0000ff" } } } },
            { [objName]: { [prop]: { solid: { color: "#00ff00" } } } },
            { [objName]: { [prop]: { solid: { color: "#00ff00" } } } }
          ]
        }
      ]
    });
  test.each([
    ["pillars", "pillarColor", "pillarColor"],
    ["pillars", "colorPillarLabel", "pillarLabelColor"],
    ["pillars", "labelBgColor", "pillarLabelBgColor"],
    ["bridges", "colorBridge", "bridgeColor"],
    ["bridges", "colorBridgeLabel", "bridgeLabelColor"],
    ["bridges", "labelBgColor", "bridgeLabelBgColor"],
    ["variationArc", "labelColor", "arcLabelColor"],
    ["variationArc", "labelBgColor", "arcLabelBgColor"]
  ])("%s.%s takes the per-X majority, not the first analysisDim member", (obj, prop, field) => {
    const v = makeVisual();
    const r = parse(v, split(obj, prop));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((r.categoryDisplay[0] as any)[field]).toBe("#ff0000");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((r.categoryDisplay[1] as any)[field]).toBe("#00ff00");
  });

  test("category-column fill keeps priority over value-column fill for pillarColor (tie → first-seen)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B"],
          objects: [
            { pillars: { pillarColor: { solid: { color: "#00ff00" } } } },
            undefined as unknown as Record<string, unknown>
          ]
        }
      ],
      vals: [
        {
          name: "Sales",
          role: "actual",
          values: [10, 20],
          rowObjects: [{ pillars: { pillarColor: { solid: { color: "#0000ff" } } } }, undefined]
        }
      ]
    });
    const r = parse(v, dv);
    expect(r.categoryDisplay[0].pillarColor).toBe("#00ff00");
  });
});

describe("legend segment-label colours resolve from metadata SLOTS (1.1.72)", () => {
  test("per-value segmentLabelColor / Bg come from the numbered slots", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv: any = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        { name: "Region", isLegend: true, values: ["US", "EU", "US", "EU"] }
      ],
      vals: [{ name: "Sales", role: "actual", values: [1, 2, 3, 4] }]
    });
    dv.metadata.objects = {
      legend: {
        segmentLabelColor0: { solid: { color: "#ff0000" } },
        segmentLabelColor1: { solid: { color: "#00ff00" } },
        segmentLabelBgColor0: { solid: { color: "#111111" } }
      }
    };
    const r = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const us = r.legendValues.find((l: any) => l.label === "US");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eu = r.legendValues.find((l: any) => l.label === "EU");
    expect(us.segmentLabelColor).toBe("#ff0000");
    expect(eu.segmentLabelColor).toBe("#00ff00");
    expect(us.segmentLabelBgColor).toBe("#111111");
  });

  test("unset slot → the global default segment-label colour", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "B"] },
        { name: "Region", isLegend: true, values: ["US", "EU"] }
      ],
      vals: [{ name: "Sales", role: "actual", values: [10, 20] }]
    });
    const r = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.legendValues.forEach((l: any) => expect(l.segmentLabelColor).toBe("#ffffff"));
  });
});

describe("parseDataView: NO-CATEGORY mode (measures only)", () => {
  test("Only measures bound (no dim) → 1 point per measure", () => {
    const v = makeVisual();
    const dv = dvBuild({
      vals: [
        { name: "Budget", role: "actual", values: [100] },
        { name: "Forecast", role: "actual", values: [120] },
        { name: "Actual", role: "actual", values: [110] }
      ]
    });
    const result = parse(v, dv);
    expect(result).not.toBeNull();
    expect(result.isNoCategoryMode).toBe(true);
    expect(result.points.length).toBe(3);
    expect(result.points[0].label).toBe("Budget");
    expect(result.points[1].label).toBe("Forecast");
    expect(result.points[2].label).toBe("Actual");
  });

  test("No-category + cumulative default: first + last = pillars, middle = bridge", () => {
    const v = makeVisual();
    const dv = dvBuild({
      vals: [
        { name: "M1", role: "actual", values: [10] },
        { name: "M2", role: "actual", values: [20] },
        { name: "M3", role: "actual", values: [30] }
      ]
    });
    const result = parse(v, dv);
    expect(result.points[0].isPillar).toBe(true);
    expect(result.points[1].isPillar).toBe(false);
    expect(result.points[2].isPillar).toBe(true);
  });

  test("No-category + comparison mode: ALL measures forced pillars", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings.general.mode.value = {
      value: "comparison",
      displayName: "Comparison"
    };
    const dv = dvBuild({
      vals: [
        { name: "M1", role: "actual", values: [10] },
        { name: "M2", role: "actual", values: [20] },
        { name: "M3", role: "actual", values: [30] }
      ]
    });
    const result = parse(v, dv);
    expect(result.points.every((p: { isPillar: boolean }) => p.isPillar)).toBe(true);
  });

  test("No-category single measure → 1 pillar", () => {
    const v = makeVisual();
    const dv = dvBuild({
      vals: [{ name: "Only", role: "actual", values: [42] }]
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(1);
    expect(result.points[0].isPillar).toBe(true);
  });

  test("No-category mode reads scalar = sum of values for each measure", () => {
    const v = makeVisual();
    const dv = dvBuild({
      vals: [
        { name: "M1", role: "actual", values: [10, 20, 30] }
      ]
    });
    const result = parse(v, dv);
    expect(result.points[0].actual).toBe(60);
  });

  test("No-category: per-measure isPillar override from source.objects", () => {
    const v = makeVisual();
    const dv = dvBuild({
      vals: [
        {
          name: "M1",
          role: "actual",
          values: [10],
          objects: { pillars: { isPillar: false } }
        },
        { name: "M2", role: "actual", values: [20] },
        {
          name: "M3",
          role: "actual",
          values: [30],
          objects: { pillars: { isPillar: true } }
        }
      ]
    });
    const result = parse(v, dv);
    expect(result.points[0].isPillar).toBe(false);
    expect(result.points[1].isPillar).toBe(false);
    expect(result.points[2].isPillar).toBe(true);
  });

  test("No-category mode caches actualDisplayName from first measure", () => {
    const v = makeVisual();
    const dv = dvBuild({
      vals: [
        { name: "First", role: "actual", values: [10] },
        { name: "Second", role: "actual", values: [20] }
      ]
    });
    parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v as any).cachedActualDisplayName).toBe("First");
  });

  test("No-category: legend/variance/grandTotal are inert; tooltipMeasures are forwarded", () => {
    const v = makeVisual();
    const dv = dvBuild({
      vals: [
        { name: "M1", role: "actual", values: [10] },
        { name: "V", role: "variance", values: [1] },
        { name: "T", role: "tooltips", values: [2] },
        { name: "GT", role: "grandTotalLabel", values: [3] }
      ]
    });
    const result = parse(v, dv);
    expect(result.varianceMeasures).toEqual([]);
    expect(result.tooltipMeasures).toHaveLength(1);
    expect(result.tooltipMeasures[0].displayName).toBe("T");
    expect(result.legendValues).toEqual([]);
    expect(result.grandTotalLabelMeasure).toBe("");
  });
});

describe("parseDataView: variance role", () => {
  test("One variance measure bound → categoryDisplay entries carry the value", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [
        { name: "Sales", role: "actual", values: [10, 20] },
        { name: "vsBud", role: "variance", values: [0.05, -0.1] }
      ]
    });
    const result = parse(v, dv);
    expect(result.varianceMeasures.length).toBe(1);
    expect(result.varianceMeasures[0].name).toBe("vsBud");
    expect(result.varianceMeasures[0].defaultDisplayName).toBe("vsBud");
    expect(result.varianceMeasures[0].values).toEqual([0.05, -0.1]);
  });

  test("Multiple variance measures stack correctly", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [
        { name: "Sales", role: "actual", values: [10, 20] },
        { name: "vsBud", role: "variance", values: [0.05, -0.1] },
        { name: "vsN1", role: "variance", values: [0.2, 0.3] }
      ]
    });
    const result = parse(v, dv);
    expect(result.varianceMeasures.length).toBe(2);
    expect(result.varianceMeasures[1].name).toBe("vsN1");
  });

  test("Variance with null values stays as null (not 0)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [
        { name: "Sales", role: "actual", values: [10, 20] },
        { name: "vsBud", role: "variance", values: [null, 0.5] }
      ]
    });
    const result = parse(v, dv);
    expect(result.varianceMeasures[0].values[0]).toBeNull();
    expect(result.varianceMeasures[0].values[1]).toBe(0.5);
  });
});

describe("parseDataView: tooltip role", () => {
  test("Tooltip measures available with their displayName and format", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A"] }],
      vals: [
        { name: "Sales", role: "actual", values: [10] },
        { name: "QtyTooltip", role: "tooltips", values: [42], format: "0" }
      ]
    });
    const result = parse(v, dv);
    expect(result.tooltipMeasures.length).toBe(1);
    expect(result.tooltipMeasures[0].displayName).toBe("QtyTooltip");
    expect(result.tooltipMeasures[0].format).toBe("0");
  });
});

describe("parseDataView: grandTotalLabel role", () => {
  test("First non-null text value wins", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [
        { name: "Sales", role: "actual", values: [10, 20] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { name: "GT", role: "grandTotalLabel", values: [null, "Total Annuel" as any] }
      ]
    });
    const result = parse(v, dv);
    expect(result.grandTotalLabelMeasure).toBe("Total Annuel");
  });
});

describe("parseDataView: row grouping (legend stacking)", () => {
  test("Without legend: 1 row per category → 1 point per category, no segments", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [{ name: "Sales", role: "actual", values: [10, 20] }]
    });
    const result = parse(v, dv);
    expect(result.points[0].segments).toBeUndefined();
    expect(result.points[1].segments).toBeUndefined();
  });

  test("With legend column: rows grouped per (cat, legendValue) → segments populated", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        { name: "Legend", values: ["x", "y", "x", "y"], isLegend: true }
      ],
      vals: [{ name: "Sales", role: "actual", values: [1, 2, 3, 4] }]
    });
    const result = parse(v, dv);
    expect(result.legendValues.length).toBe(2);
    expect(result.points.length).toBe(2);
    expect(result.points[0].segments?.length).toBe(2);
    expect(result.points[1].segments?.length).toBe(2);
  });

  test("With legend: actual per category is the SUM of segments", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A"] },
        { name: "Legend", values: ["x", "y"], isLegend: true }
      ],
      vals: [{ name: "Sales", role: "actual", values: [10, 30] }]
    });
    const result = parse(v, dv);
    expect(result.points[0].actual).toBe(40);
  });

  test("Without legend, multi-row same-cat values are summed", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "A", "B"] }],
      vals: [{ name: "Sales", role: "actual", values: [10, 5, 20] }]
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(2);
    expect(result.points[0].actual).toBe(15);
    expect(result.points[1].actual).toBe(20);
  });
});

describe("parseDataView: highlights (external cross-filter)", () => {
  test("No highlights array → highlightedCatIdxs === null", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [{ name: "Sales", role: "actual", values: [10, 20] }]
    });
    const result = parse(v, dv);
    expect(result.highlightedCatIdxs).toBeNull();
  });

  test("Highlights with non-null entries → Set with matching indices", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [
        {
          name: "Sales",
          role: "actual",
          values: [10, 20, 30],
          highlights: [null, 20, null]
        }
      ]
    });
    const result = parse(v, dv);
    expect(result.highlightedCatIdxs).not.toBeNull();
    expect(result.highlightedCatIdxs!.has(1)).toBe(true);
    expect(result.highlightedCatIdxs!.has(0)).toBe(false);
  });
});

describe("buildEmptyParseResult: produces correctly shaped empty result", () => {
  test("All array fields are empty arrays, primitives have defaults", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (v as any).buildEmptyParseResult();
    expect(r.points).toEqual([]);
    expect(r.varianceMeasures).toEqual([]);
    expect(r.categoryDisplay).toEqual([]);
    expect(r.actualMeasures).toEqual([]);
    expect(r.tooltipMeasures).toEqual([]);
    expect(r.highlightedCatIdxs).toBeNull();
    expect(r.categoryDisplayName).toBe("");
    expect(r.grandTotalLabelMeasure).toBe("");
    expect(r.legendValues).toEqual([]);
    expect(r.legendDisplayName).toBe("");
    expect(r.legendIdxByRow).toEqual([]);
    expect(r.catRowIdxs).toEqual([]);
    expect(r.isNoCategoryMode).toBe(false);
  });
});

describe("parseDataView: large category counts", () => {
  test("100 categories handled correctly", () => {
    const v = makeVisual();
    const labels = Array.from({ length: 100 }, (_, i) => `C${i}`);
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const dv = dvBuild({
      cats: [{ name: "Cat", values: labels }],
      vals: [{ name: "Sales", role: "actual", values }]
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(100);
    expect(result.points[0].isPillar).toBe(true);
    expect(result.points[99].isPillar).toBe(true);
    expect(result.points[50].isPillar).toBe(false);
  });
});

describe("parseDataView: 2+ actual measures in comparison mode (synthCompBridge prep)", () => {
  test("2 measures + dim → ParseResult has 2 actualMeasures (synth happens in update())", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [
        { name: "M1", role: "actual", values: [10, 20] },
        { name: "M2", role: "actual", values: [15, 22] }
      ]
    });
    const result = parse(v, dv);
    expect(result.actualMeasures.length).toBe(2);
    expect(result.actualMeasures[0].displayName).toBe("M1");
    expect(result.actualMeasures[1].displayName).toBe("M2");
    expect(result.points.length).toBe(2);
  });

  test("3 measures + dim — primary measure drives initial cumulative path", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [
        { name: "Primary", role: "actual", values: [10, 20, 30] },
        { name: "Second", role: "actual", values: [1, 2, 3] },
        { name: "Third", role: "actual", values: [100, 200, 300] }
      ]
    });
    const result = parse(v, dv);
    expect(result.actualMeasures.length).toBe(3);
    expect(result.points[0].actual).toBe(10);
    expect(result.points[1].actual).toBe(20);
    expect(result.points[2].actual).toBe(30);
  });
});

describe("parseDataView: state machine — null vs empty distinguished cleanly", () => {
  test("dv === undefined → null (replay token)", () => {
    const v = makeVisual();
    expect(parse(v, undefined)).toBeNull();
  });

  test("dv with empty categorical → empty ParseResult (clear-cache token)", () => {
    const v = makeVisual();
    const result = parse(v, { categorical: {} });
    expect(result).not.toBeNull();
    expect(result.points).toEqual([]);
  });

  test("dv with categorical containing zero rows → empty ParseResult", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: [] }],
      vals: [{ name: "Sales", role: "actual", values: [] }]
    });
    const result = parse(v, dv);
    expect(result).not.toBeNull();
    expect(result.points).toEqual([]);
  });

  test("dv with category column but zero actual measures → empty ParseResult", () => {
    const v = makeVisual();
    const dv = dvBuild({ cats: [{ name: "Cat", values: ["A", "B"] }] });
    const result = parse(v, dv);
    expect(result).not.toBeNull();
    expect(result.points).toEqual([]);
  });
});

describe("localize(): runtime strings resolve through the locale bundle (audit F3)", () => {
  test("key-echo manager (harness stub) → English fallback shown, never the raw Visual_ key", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new Visual({ host: makeMockHost(), element: target } as any);
    expect(target.textContent).toContain(
      "Select or drag fields to populate this visual"
    );
    expect(target.textContent).not.toContain("Visual_EmptyPrompt");
  });

  test("resolved key → the localized string reaches the empty-state banner", () => {
    const host = {
      ...makeMockHost(),
      createLocalizationManager: () => ({
        getDisplayName: (k: string) =>
          k === "Visual_EmptyPrompt" ? "Sélectionnez des champs" : k
      })
    };
    const target = document.createElement("div");
    document.body.appendChild(target);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new Visual({ host, element: target } as any);
    expect(target.textContent).toContain("Sélectionnez des champs");
    expect(target.textContent).not.toContain("Select or drag fields");
  });
});

describe("parseDataView: realistic mixed scenarios", () => {
  test("Cumulative workflow: dim + 1 actual + 1 variance + 1 tooltip", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Account", values: ["Revenue", "COGS", "OpEx", "EBIT"] }],
      vals: [
        { name: "Actual", role: "actual", values: [100, -40, -20, 40] },
        { name: "vsBud", role: "variance", values: [0.05, -0.02, 0.0, 0.03] },
        { name: "Headcount", role: "tooltips", values: [10, 20, 30, 60] }
      ]
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(4);
    expect(result.varianceMeasures.length).toBe(1);
    expect(result.tooltipMeasures.length).toBe(1);
    expect(result.points[0].isPillar).toBe(true);
    expect(result.points[3].isPillar).toBe(true);
  });

  test("KPI dashboard: 4 measures, no dim", () => {
    const v = makeVisual();
    const dv = dvBuild({
      vals: [
        { name: "Q1", role: "actual", values: [100] },
        { name: "Q2", role: "actual", values: [120] },
        { name: "Q3", role: "actual", values: [115] },
        { name: "Q4", role: "actual", values: [140] }
      ]
    });
    const result = parse(v, dv);
    expect(result.isNoCategoryMode).toBe(true);
    expect(result.points.length).toBe(4);
    expect(result.points[0].label).toBe("Q1");
    expect(result.points[3].label).toBe("Q4");
  });

  test("Comparison-by-measure path: 2 measures + dim (synth synth needs dim)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings.general.mode.value = {
      value: "comparison",
      displayName: "Comparison"
    };
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [
        { name: "Budget", role: "actual", values: [10, 20, 30] },
        { name: "Actual", role: "actual", values: [12, 18, 35] }
      ]
    });
    const result = parse(v, dv);
    expect(result.isNoCategoryMode).toBe(false);
    expect(result.actualMeasures.length).toBe(2);
  });

  test("Legend + 3 cats × 2 legend values = 6 rows, 3 points, 2 segments each", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B", "C", "C"] },
        {
          name: "Legend",
          values: ["x", "y", "x", "y", "x", "y"],
          isLegend: true
        }
      ],
      vals: [
        { name: "Sales", role: "actual", values: [1, 2, 3, 4, 5, 6] }
      ]
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(3);
    expect(result.legendValues.length).toBe(2);
    expect(result.points[0].segments?.length).toBe(2);
    expect(result.points[1].segments?.length).toBe(2);
    expect(result.points[2].segments?.length).toBe(2);
  });
});

describe("parseDataView: edge cases & robustness", () => {
  test("All zero values → still produces points (waterfall flat at 0)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [{ name: "Sales", role: "actual", values: [0, 0, 0] }]
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(3);
    expect(result.points.every((p: { actual: number }) => p.actual === 0)).toBe(true);
  });

  test("Mixed positive/negative ride waterfall direction correctly", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["start", "x", "y", "z", "end"] }],
      vals: [
        { name: "Amount", role: "actual", values: [1000, 200, -150, 50, 1100] }
      ]
    });
    const result = parse(v, dv);
    expect(result.points.map((p: { actual: number }) => p.actual)).toEqual([
      1000,
      200,
      -150,
      50,
      1100
    ]);
  });

  test("Very long category labels don't crash parsing", () => {
    const v = makeVisual();
    const longLabel = "A".repeat(500);
    const dv = dvBuild({
      cats: [{ name: "Cat", values: [longLabel, "B"] }],
      vals: [{ name: "Sales", role: "actual", values: [10, 20] }]
    });
    const result = parse(v, dv);
    expect(result.points[0].label).toBe(longLabel);
  });

  test("Same column bound to both actual AND variance roles is in both lists", () => {
    const v = makeVisual();
    const dv = {
      categorical: {
        categories: [
          {
            source: {
              displayName: "Cat",
              queryName: "Cat",
              roles: { category: true }
            },
            values: ["A", "B"],
            identity: [{}, {}]
          }
        ],
        values: [
          {
            source: {
              displayName: "Shared",
              queryName: "Shared",
              roles: { actual: true, variance: true }
            },
            values: [10, 20]
          }
        ]
      },
      metadata: { columns: [], objects: {} }
    };
    const result = parse(v, dv);
    expect(result.actualMeasures.length).toBe(1);
    expect(result.varianceMeasures.length).toBe(1);
  });

  test("Floating point precision: sum of segments equals declared actual", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "A"] },
        { name: "Leg", values: ["x", "y", "z"], isLegend: true }
      ],
      vals: [
        { name: "Sales", role: "actual", values: [0.1, 0.2, 0.3] }
      ]
    });
    const result = parse(v, dv);
    expect(Math.abs(result.points[0].actual - 0.6)).toBeLessThan(1e-9);
  });

  test("Negative + zero in comparison mode + no-dim → still all pillars", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings.general.mode.value = {
      value: "comparison",
      displayName: "Comparison"
    };
    const dv = dvBuild({
      vals: [
        { name: "M1", role: "actual", values: [-10] },
        { name: "M2", role: "actual", values: [0] },
        { name: "M3", role: "actual", values: [10] }
      ]
    });
    const result = parse(v, dv);
    expect(result.points.every((p: { isPillar: boolean }) => p.isPillar)).toBe(true);
  });

  test("Calling parseDataView twice with different shapes does not leak state", () => {
    const v = makeVisual();
    const dv1 = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [{ name: "Sales", role: "actual", values: [10, 20] }]
    });
    const r1 = parse(v, dv1);
    expect(r1.points.length).toBe(2);
    expect(r1.isNoCategoryMode).toBe(false);

    const dv2 = dvBuild({
      vals: [{ name: "Alone", role: "actual", values: [5] }]
    });
    const r2 = parse(v, dv2);
    expect(r2.points.length).toBe(1);
    expect(r2.isNoCategoryMode).toBe(true);
    expect(r2.points[0].label).toBe("Alone");
  });

  test("Re-call with empty dv after a populated one produces empty (no leak)", () => {
    const v = makeVisual();
    const dvFull = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [{ name: "Sales", role: "actual", values: [10, 20] }]
    });
    parse(v, dvFull);
    const r2 = parse(v, { categorical: {} });
    expect(r2.points).toEqual([]);
    expect(r2.varianceMeasures).toEqual([]);
  });
});

describe("parseNoCategory: comparison mode with various measure counts", () => {
  test("1 measure → 1 pillar", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings.general.mode.value = {
      value: "comparison",
      displayName: "Comparison"
    };
    const dv = dvBuild({
      vals: [{ name: "M1", role: "actual", values: [10] }]
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(1);
    expect(result.points[0].isPillar).toBe(true);
  });

  test("5 measures → 5 pillars all marked", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings.general.mode.value = {
      value: "comparison",
      displayName: "Comparison"
    };
    const dv = dvBuild({
      vals: [
        { name: "M1", role: "actual", values: [10] },
        { name: "M2", role: "actual", values: [20] },
        { name: "M3", role: "actual", values: [30] },
        { name: "M4", role: "actual", values: [40] },
        { name: "M5", role: "actual", values: [50] }
      ]
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(5);
    expect(result.points.every((p: { isPillar: boolean }) => p.isPillar)).toBe(true);
  });

  test("8 measures → 8 pillars all marked", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings.general.mode.value = {
      value: "comparison",
      displayName: "Comparison"
    };
    const dv = dvBuild({
      vals: Array.from({ length: 8 }, (_, i) => ({
        name: `M${i + 1}`,
        role: "actual" as const,
        values: [(i + 1) * 10]
      }))
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(8);
    expect(result.points.every((p: { isPillar: boolean }) => p.isPillar)).toBe(true);
  });
});

describe("appendGrandTotal: legend-aware stacking", () => {
  function makeSegPoint(
    sort: number,
    label: string,
    actual: number,
    segments: Array<{ legendIdx: number; value: number; color: string; label: string }>
  ) {
    return {
      sort,
      label,
      isPillar: false,
      actual,
      varianceValues: [],
      categoryIndex: sort,
      selectionId: null,
      segments
    };
  }

  test("No segments on input points → GT has no segments (regression: legacy mono-coloured)", () => {
    const v = makeVisual();
    const points = [
      {
        sort: 0,
        label: "A",
        isPillar: false,
        actual: 10,
        varianceValues: [],
        categoryIndex: 0,
        selectionId: null
      },
      {
        sort: 1,
        label: "B",
        isPillar: false,
        actual: 20,
        varianceValues: [],
        categoryIndex: 1,
        selectionId: null
      }
    ];
    const display = points.map((p) => ({
      label: p.label,
      categoryIndex: p.categoryIndex,
      identity: undefined,
      isPillar: false,
      pillarColor: "#cccccc",
      selectionId: null,
      actualValue: p.actual,
      varianceValues: [],
      legendIdx: -1
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (v as any).appendGrandTotal(points, display, "Total", "#000000", []);
    expect(r.points.length).toBe(3);
    expect(r.points[2].label).toBe("Total");
    expect(r.points[2].actual).toBe(30);
    expect(r.points[2].segments).toBeUndefined();
  });

  test("With segments → GT inherits stacked segments summed per legend value", () => {
    const v = makeVisual();
    const points = [
      makeSegPoint(0, "A", 30, [
        { legendIdx: 0, value: 10, color: "#aa0000", label: "red" },
        { legendIdx: 1, value: 20, color: "#0000aa", label: "blue" }
      ]),
      makeSegPoint(1, "B", 50, [
        { legendIdx: 0, value: 15, color: "#aa0000", label: "red" },
        { legendIdx: 1, value: 35, color: "#0000aa", label: "blue" }
      ])
    ];
    const display = points.map((p) => ({
      label: p.label,
      categoryIndex: p.categoryIndex,
      identity: undefined,
      isPillar: false,
      pillarColor: "#cccccc",
      selectionId: null,
      actualValue: p.actual,
      varianceValues: [],
      legendIdx: -1,
      segments: p.segments
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (v as any).appendGrandTotal(points, display, "Total", "#000000", []);
    expect(r.points.length).toBe(3);
    const gt = r.points[2];
    expect(gt.actual).toBe(80);
    expect(gt.segments?.length).toBe(2);
    expect(gt.segments?.[0]).toMatchObject({
      legendIdx: 0,
      value: 25,
      color: "#aa0000",
      label: "red"
    });
    expect(gt.segments?.[1]).toMatchObject({
      legendIdx: 1,
      value: 55,
      color: "#0000aa",
      label: "blue"
    });
  });

  test("Segments preserved on GT's categoryDisplay too (for tooltip lookups)", () => {
    const v = makeVisual();
    const points = [
      makeSegPoint(0, "A", 30, [
        { legendIdx: 0, value: 10, color: "#aa0000", label: "x" },
        { legendIdx: 1, value: 20, color: "#0000aa", label: "y" }
      ])
    ];
    const display = points.map((p) => ({
      label: p.label,
      categoryIndex: p.categoryIndex,
      identity: undefined,
      isPillar: false,
      pillarColor: "#cccccc",
      selectionId: null,
      actualValue: p.actual,
      varianceValues: [],
      legendIdx: -1,
      segments: p.segments
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (v as any).appendGrandTotal(points, display, "Total", "#000000", []);
    const gtDisplay = r.categoryDisplay[1];
    expect(gtDisplay.segments?.length).toBe(2);
  });

  test("Mutating source segment after GT build does NOT poison GT (clone semantic)", () => {
    const v = makeVisual();
    const segA = { legendIdx: 0, value: 10, color: "#aa0000", label: "red" };
    const points = [
      makeSegPoint(0, "A", 30, [segA, { legendIdx: 1, value: 20, color: "#0000aa", label: "blue" }])
    ];
    const display = points.map((p) => ({
      label: p.label,
      categoryIndex: p.categoryIndex,
      identity: undefined,
      isPillar: false,
      pillarColor: "#cccccc",
      selectionId: null,
      actualValue: p.actual,
      varianceValues: [],
      legendIdx: -1,
      segments: p.segments
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (v as any).appendGrandTotal(points, display, "Total", "#000000", []);
    const beforeGtValue = r.points[1].segments?.[0].value;
    segA.value = 9999;
    expect(r.points[1].segments?.[0].value).toBe(beforeGtValue);
  });

  test("GT segments ordered by legendIdx ASC (visual stability)", () => {
    const v = makeVisual();
    const points = [
      makeSegPoint(0, "A", 30, [
        { legendIdx: 2, value: 5, color: "#c", label: "z" },
        { legendIdx: 0, value: 10, color: "#a", label: "x" },
        { legendIdx: 1, value: 15, color: "#b", label: "y" }
      ])
    ];
    const display = points.map((p) => ({
      label: p.label,
      categoryIndex: p.categoryIndex,
      identity: undefined,
      isPillar: false,
      pillarColor: "#cccccc",
      selectionId: null,
      actualValue: p.actual,
      varianceValues: [],
      legendIdx: -1,
      segments: p.segments
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (v as any).appendGrandTotal(points, display, "Total", "#000000", []);
    expect(r.points[1].segments?.map((s: { legendIdx: number }) => s.legendIdx)).toEqual([0, 1, 2]);
  });

  test("Empty points → no GT appended (returns input as-is)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (v as any).appendGrandTotal([], [], "Total", "#000000", []);
    expect(r.points).toEqual([]);
    expect(r.categoryDisplay).toEqual([]);
  });
});

describe("Selection toggle (native PBI 'click-twice-to-clear' behaviour)", () => {
  function makeStatefulSelectionManager() {
    let currentIds: { key: string }[] = [];
    return {
      select(id: { getKey?: () => string } | { getKey?: () => string }[], multi: boolean) {
        const arr = Array.isArray(id) ? id : [id];
        const newKeys = arr.map((i) => ({ key: i.getKey?.() ?? "" }));
        if (multi) {
          newKeys.forEach((nk) => {
            const existing = currentIds.findIndex((c) => c.key === nk.key);
            if (existing >= 0) currentIds.splice(existing, 1);
            else currentIds.push(nk);
          });
        } else {
          currentIds = newKeys;
        }
        return Promise.resolve([]);
      },
      clear() {
        currentIds = [];
        return Promise.resolve();
      },
      getSelectionIds() {
        return currentIds.map((c) => ({
          getKey: () => c.key,
          equals: (other: { getKey?: () => string }) => other.getKey?.() === c.key
        }));
      },
      showContextMenu() {
        return Promise.resolve();
      },
      hasSelection() {
        return currentIds.length > 0;
      },
      registerOnSelectCallback() {},
      applyJsonFilter() {}
    };
  }

  function makeVisualWithState() {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const host = makeMockHost();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (host as any).createSelectionManager = () => makeStatefulSelectionManager();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = new Visual({ host, element: target } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings = new VisualFormattingSettingsModel();
    return v;
  }

  function makeId(key: string) {
    return {
      getKey: () => key,
      equals: (other: { getKey?: () => string }) => other.getKey?.() === key,
      getSelector: () => ({})
    };
  }

  test("isAlreadySelected: empty current → false", () => {
    const v = makeVisualWithState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v as any).isAlreadySelected(makeId("k1"))).toBe(false);
  });

  test("isAlreadySelected: same single id → true", () => {
    const v = makeVisualWithState();
    const id = makeId("k1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).selectionManager.select(id, false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v as any).isAlreadySelected(id)).toBe(true);
  });

  test("isAlreadySelected: different id → false", () => {
    const v = makeVisualWithState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).selectionManager.select(makeId("k1"), false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v as any).isAlreadySelected(makeId("k2"))).toBe(false);
  });

  test("isAlreadySelected: array of 2 == 2 ids selected (same set) → true", () => {
    const v = makeVisualWithState();
    const a = makeId("a");
    const b = makeId("b");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).selectionManager.select([a, b], false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v as any).isAlreadySelected([a, b])).toBe(true);
  });

  test("isAlreadySelected: array of 2 != 1 selected → false", () => {
    const v = makeVisualWithState();
    const a = makeId("a");
    const b = makeId("b");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).selectionManager.select(a, false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v as any).isAlreadySelected([a, b])).toBe(false);
  });

  test("isAlreadySelected: same set, different order → true (order-independent)", () => {
    const v = makeVisualWithState();
    const a = makeId("a");
    const b = makeId("b");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).selectionManager.select([b, a], false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v as any).isAlreadySelected([a, b])).toBe(true);
  });

  test("selectOrToggle (single click on same selection) → clears", async () => {
    const v = makeVisualWithState();
    const a = makeId("a");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (v as any).selectionManager.select(a, false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).selectOrToggle(a, false);
    await Promise.resolve();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v as any).selectionManager.hasSelection()).toBe(false);
  });

  test("selectOrToggle (single click on different selection) → replaces", async () => {
    const v = makeVisualWithState();
    const a = makeId("a");
    const b = makeId("b");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (v as any).selectionManager.select(a, false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).selectOrToggle(b, false);
    await Promise.resolve();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const after = (v as any).selectionManager.getSelectionIds();
    expect(after.length).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(after[0].getKey()).toBe("b");
  });

  test("selectOrToggle (multi-click on same selection) → SDK toggle removes id", async () => {
    const v = makeVisualWithState();
    const a = makeId("a");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (v as any).selectionManager.select(a, false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).selectOrToggle(a, true);
    await Promise.resolve();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v as any).selectionManager.hasSelection()).toBe(false);
  });

  test("selectOrToggle (multi-click on new id) → adds to selection", async () => {
    const v = makeVisualWithState();
    const a = makeId("a");
    const b = makeId("b");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (v as any).selectionManager.select(a, false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).selectOrToggle(b, true);
    await Promise.resolve();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = (v as any).selectionManager.getSelectionIds();
    expect(ids.length).toBe(2);
    expect(ids.map((i: { getKey: () => string }) => i.getKey()).sort()).toEqual(
      ["a", "b"]
    );
  });
});

describe("Analysis dimension (footnote table) — parsing & cell math", () => {
  function makeAnalysisDv(opts: {
    cats?: { name: string; values: string[] }[];
    analysisDim: { name: string; values: string[] };
    vals: { name: string; values: number[]; role?: "actual" | "variance" }[];
  }) {
    const categories: unknown[] = [];
    if (opts.cats) {
      for (const c of opts.cats) {
        categories.push({
          source: {
            displayName: c.name,
            queryName: c.name,
            roles: { category: true }
          },
          values: c.values,
          identity: c.values.map(() => ({}))
        });
      }
    }
    categories.push({
      source: {
        displayName: opts.analysisDim.name,
        queryName: opts.analysisDim.name,
        roles: { analysisDim: true }
      },
      values: opts.analysisDim.values,
      identity: opts.analysisDim.values.map(() => ({}))
    });

    const values = opts.vals.map((v) => ({
      source: {
        displayName: v.name,
        queryName: v.name,
        roles: { [v.role || "actual"]: true }
      },
      values: v.values
    }));

    return {
      categorical: {
        categories,
        values
      },
      metadata: { columns: [], objects: {} }
    };
  }

  test("Bound analysisDim → ParseResult.analysis populated with row labels + row→adim map", () => {
    const v = makeVisual();
    const dv = makeAnalysisDv({
      cats: [{ name: "Cat", values: ["A", "A", "B", "B"] }],
      analysisDim: { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"] },
      vals: [{ name: "Sales", values: [10, 20, 30, 40] }]
    });
    const result = parse(v, dv);
    expect(result.analysis).not.toBeNull();
    expect(result.analysis.displayName).toBe("Region");
    expect(result.analysis.rowLabels).toEqual(["EMEA", "NA"]);
    expect(result.analysis.rowIdxByDataRow).toEqual([0, 1, 0, 1]);
  });

  test("Unbound analysisDim → ParseResult.analysis is null", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [{ name: "Sales", role: "actual", values: [10, 20] }]
    });
    const result = parse(v, dv);
    expect(result.analysis).toBeNull();
  });

  test("Analysis row order = first-appearance order (NOT alphabetical)", () => {
    const v = makeVisual();
    const dv = makeAnalysisDv({
      cats: [{ name: "Cat", values: ["A", "A", "A"] }],
      analysisDim: { name: "R", values: ["Z", "M", "A"] },
      vals: [{ name: "S", values: [1, 2, 3] }]
    });
    const result = parse(v, dv);
    expect(result.analysis.rowLabels).toEqual(["Z", "M", "A"]);
  });

  test("Analysis with no-category mode → row labels = unique adim values, per-row index", () => {
    const v = makeVisual();
    const dv = {
      categorical: {
        categories: [
          {
            source: {
              displayName: "Region",
              queryName: "Region",
              roles: { analysisDim: true }
            },
            values: ["EMEA", "NA", "APAC"],
            identity: [{}, {}, {}]
          }
        ],
        values: [
          {
            source: {
              displayName: "M1",
              queryName: "M1",
              roles: { actual: true }
            },
            values: [10, 20, 30]
          }
        ]
      },
      metadata: { columns: [], objects: {} }
    };
    const result = parse(v, dv);
    expect(result.isNoCategoryMode).toBe(true);
    expect(result.analysis).not.toBeNull();
    expect(result.analysis.rowLabels).toEqual(["EMEA", "NA", "APAC"]);
  });

  test("buildAnalysisCells: standard cumulative — cells[adim][col] = sum of measure_0 per (adim, cat)", () => {
    const v = makeVisual();
    const dv = makeAnalysisDv({
      cats: [{ name: "Cat", values: ["A", "A", "B", "B"] }],
      analysisDim: { name: "R", values: ["x", "y", "x", "y"] },
      vals: [{ name: "S", values: [10, 20, 30, 40] }]
    });
    const result = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cells = ((v as any).buildAnalysisCells(
      result,
      result.points,
      "cumulative"
    )).values;
    expect(cells.length).toBe(2);
    expect(cells[0].length).toBe(2);
    expect(cells[0]).toEqual([10, 30]);
    expect(cells[1]).toEqual([20, 40]);
  });

  test("buildAnalysisCells: no-category mode — each column = sum of measure_N per adim row", () => {
    const v = makeVisual();
    const dv = {
      categorical: {
        categories: [
          {
            source: {
              displayName: "R",
              queryName: "R",
              roles: { analysisDim: true }
            },
            values: ["x", "y"],
            identity: [{}, {}]
          }
        ],
        values: [
          {
            source: {
              displayName: "M1",
              queryName: "M1",
              roles: { actual: true }
            },
            values: [10, 20]
          },
          {
            source: {
              displayName: "M2",
              queryName: "M2",
              roles: { actual: true }
            },
            values: [100, 200]
          }
        ]
      },
      metadata: { columns: [], objects: {} }
    };
    const result = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cells = ((v as any).buildAnalysisCells(result, result.points, "cumulative")).values;
    expect(cells.length).toBe(2);
    expect(cells[0].length).toBe(2);
    expect(cells[0]).toEqual([10, 100]);
    expect(cells[1]).toEqual([20, 200]);
  });

  test("buildAnalysisCells: empty input → empty cells", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cells = ((v as any).buildAnalysisCells(
      (v as any).buildEmptyParseResult(),
      [],
      "cumulative"
    )).values;
    expect(cells).toEqual([]);
  });

  test("Analysis with null adim cell → label = empty string (no crash)", () => {
    const v = makeVisual();
    const dv = makeAnalysisDv({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      analysisDim: { name: "R", values: [null as any, "x"] },
      vals: [{ name: "S", values: [10, 20] }]
    });
    const result = parse(v, dv);
    expect(result.analysis.rowLabels[0]).toBe("");
    expect(result.analysis.rowLabels[1]).toBe("x");
  });

  test("Analysis dim alone (no Value) → empty ParseResult (caller shows banner)", () => {
    const v = makeVisual();
    const dv = {
      categorical: {
        categories: [
          {
            source: {
              displayName: "R",
              queryName: "R",
              roles: { analysisDim: true }
            },
            values: ["x", "y"],
            identity: [{}, {}]
          }
        ]
      },
      metadata: { columns: [], objects: {} }
    };
    const result = parse(v, dv);
    expect(result.points).toEqual([]);
  });

  test("Analysis: one selectionId built per unique row (for click toggle + tooltip)", () => {
    const v = makeVisual();
    const dv = makeAnalysisDv({
      cats: [{ name: "Cat", values: ["A", "A", "B", "B"] }],
      analysisDim: { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"] },
      vals: [{ name: "S", values: [10, 20, 30, 40] }]
    });
    const result = parse(v, dv);
    expect(result.analysis.selectionIds.length).toBe(2);
    expect(result.analysis.selectionIds[0]).not.toBeNull();
    expect(result.analysis.selectionIds[1]).not.toBeNull();
    const k0 = result.analysis.selectionIds[0].getKey();
    const k1 = result.analysis.selectionIds[1].getKey();
    expect(typeof k0).toBe("string");
    expect(typeof k1).toBe("string");
  });

  test("Analysis cell selection: per-cell composite SelectionIds built for (cat × adim) cross", () => {
    const v = makeVisual();
    const dv = makeAnalysisDv({
      cats: [{ name: "Cat", values: ["A", "A", "B", "B"] }],
      analysisDim: { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"] },
      vals: [{ name: "S", values: [10, 20, 30, 40] }]
    });
    const result = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const built = (v as any).buildAnalysisCells(result, result.points, "cumulative");
    expect(built.selectionIds.length).toBe(2);
    expect(built.selectionIds[0].length).toBe(2);
    expect(built.selectionIds[0][0]).not.toBeNull();
    expect(built.selectionIds[0][1]).not.toBeNull();
    expect(built.selectionIds[1][0]).not.toBeNull();
    expect(built.selectionIds[1][1]).not.toBeNull();
  });

  test("Analysis cell tooltip: 3-line cross payload (category, adim, value) — NOT the full row dump", () => {
    const v = makeVisual();
    const dv = makeAnalysisDv({
      cats: [{ name: "Cat", values: ["A", "A", "B", "B"] }],
      analysisDim: { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"] },
      vals: [{ name: "S", values: [10, 20, 30, 40] }]
    });
    const result = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vAny = v as any;
    vAny.cachedAnalysisDim = result.analysis;
    vAny.cachedAnalysisCells = vAny.buildAnalysisCells(result, result.points, "cumulative").values;
    vAny.cachedCategoryDisplay = result.categoryDisplay;
    vAny.cachedCategoryDisplayName = result.categoryDisplayName;
    vAny.cachedActualDisplayName = "S";
    vAny.cachedActualFormat = "";
    const items = vAny.buildAnalysisCellTooltipItems(1, 1);
    expect(items.length).toBe(3);
    expect(items[0].displayName).toBe("Cat");
    expect(items[0].value).toBe("B");
    expect(items[1].displayName).toBe("Region");
    expect(items[1].value).toBe("NA");
    expect(items[2].displayName).toBe("S");
    expect(items[2].value).toBe("40");
  });

  test("Analysis cell tooltip in no-category mode: only adim + value (no category line)", () => {
    const v = makeVisual();
    const dv = {
      categorical: {
        categories: [
          {
            source: { displayName: "R", queryName: "R", roles: { analysisDim: true } },
            values: ["x", "y"],
            identity: [{}, {}]
          }
        ],
        values: [
          {
            source: { displayName: "M1", queryName: "M1", roles: { actual: true } },
            values: [10, 20]
          }
        ]
      },
      metadata: { columns: [], objects: {} }
    };
    const result = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vAny = v as any;
    vAny.cachedAnalysisDim = result.analysis;
    vAny.cachedAnalysisCells = vAny.buildAnalysisCells(result, result.points, "cumulative").values;
    vAny.cachedCategoryDisplay = result.categoryDisplay;
    vAny.cachedCategoryDisplayName = "";
    vAny.cachedActualDisplayName = "M1";
    vAny.cachedActualFormat = "";
    const items = vAny.buildAnalysisCellTooltipItems(0, 0);
    expect(items.length).toBe(2);
    expect(items[0].displayName).toBe("R");
    expect(items[0].value).toBe("x");
    expect(items[1].displayName).toBe("M1");
    expect(items[1].value).toBe("10");
  });

  test("Analysis cell selection: synth Grand Total column → cellId null (handler falls back to row)", () => {
    const v = makeVisual();
    const dv = makeAnalysisDv({
      cats: [{ name: "Cat", values: ["A", "A", "B", "B", "C", "C"] }],
      analysisDim: { name: "R", values: ["x", "y", "x", "y", "x", "y"] },
      vals: [{ name: "S", values: [10, 20, 30, 40, 50, 60] }]
    });
    const result = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vAny = v as any;
    const gt = vAny.appendGrandTotal(result.points, result.categoryDisplay, "GT", "#000", [], []);
    const built = vAny.buildAnalysisCells(result, gt.points, "cumulative");
    const lastCol = gt.points.length - 1;
    for (let r = 0; r < built.selectionIds.length; r++) {
      expect(built.selectionIds[r][lastCol]).toBeNull();
    }
    for (let r = 0; r < built.selectionIds.length; r++) {
      for (let c = 0; c < lastCol; c++) {
        expect(built.selectionIds[r][c]).not.toBeNull();
      }
    }
  });

  test("Analysis row tooltip: header + one line per column", () => {
    const v = makeVisual();
    const dv = makeAnalysisDv({
      cats: [{ name: "Cat", values: ["A", "A", "B", "B"] }],
      analysisDim: { name: "Region", values: ["EMEA", "NA", "EMEA", "NA"] },
      vals: [{ name: "S", values: [10, 20, 30, 40] }]
    });
    const result = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).cachedAnalysisDim = result.analysis;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).cachedAnalysisCells = ((v as any).buildAnalysisCells(
      result,
      result.points,
      "cumulative"
    )).values;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).cachedCategoryDisplay = result.categoryDisplay;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (v as any).buildAnalysisRowTooltipItems(0);
    expect(items[0].displayName).toBe("Region");
    expect(items[0].value).toBe("EMEA");
    expect(items.length).toBeGreaterThanOrEqual(3);
    const bodyLabels = items.slice(1).map((i: { displayName: string }) => i.displayName);
    expect(bodyLabels).toContain("A");
    expect(bodyLabels).toContain("B");
  });

  test("INVARIANT: Σ(cells[*][col]) === bar.actual for each column (cumulative)", () => {
    const v = makeVisual();
    const dv = makeAnalysisDv({
      cats: [{ name: "Cat", values: ["A", "A", "B", "B", "C", "C"] }],
      analysisDim: { name: "R", values: ["x", "y", "x", "y", "x", "y"] },
      vals: [{ name: "S", values: [10, 15, 20, 25, 30, 35] }]
    });
    const result = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cells = ((v as any).buildAnalysisCells(result, result.points, "cumulative")).values;
    for (let col = 0; col < result.points.length; col++) {
      const colSum = cells.reduce(
        (s: number, row: number[]) => s + (row[col] ?? 0),
        0
      );
      expect(colSum).toBeCloseTo(result.points[col].actual, 6);
    }
  });

  test("INVARIANT: Σ(cells[*][col]) === bar.actual for each column (comparison synth M=2)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings.general.mode.value = {
      value: "comparison",
      displayName: "Comparison"
    };
    const dv = {
      categorical: {
        categories: [
          {
            source: { displayName: "Cat", queryName: "Cat", roles: { category: true } },
            values: ["A", "A", "B", "B"],
            identity: [{}, {}, {}, {}]
          },
          {
            source: { displayName: "R", queryName: "R", roles: { analysisDim: true } },
            values: ["x", "y", "x", "y"],
            identity: [{}, {}, {}, {}]
          }
        ],
        values: [
          {
            source: { displayName: "Budget", queryName: "Budget", roles: { actual: true } },
            values: [10, 20, 30, 40]
          },
          {
            source: { displayName: "Actual", queryName: "Actual", roles: { actual: true } },
            values: [12, 22, 35, 42]
          }
        ]
      },
      metadata: { columns: [], objects: {} }
    };
    const result = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synth = (v as any).synthesizeComparisonBridge(result, "#aaa");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cells = ((v as any).buildAnalysisCells(result, synth.points, "comparison")).values;
    expect(synth.points.length).toBe(4);
    for (let col = 0; col < synth.points.length; col++) {
      const colSum = cells.reduce(
        (s: number, row: number[]) => s + (row[col] ?? 0),
        0
      );
      expect(colSum).toBeCloseTo(synth.points[col].actual, 6);
    }
  });

  test("INVARIANT: Σ(cells[*][col]) === bar.actual (no-cat, 4 measures × 2 adim)", () => {
    const v = makeVisual();
    const dv = {
      categorical: {
        categories: [
          {
            source: { displayName: "R", queryName: "R", roles: { analysisDim: true } },
            values: ["x", "y"],
            identity: [{}, {}]
          }
        ],
        values: [
          { source: { displayName: "M1", queryName: "M1", roles: { actual: true } }, values: [100, 200] },
          { source: { displayName: "M2", queryName: "M2", roles: { actual: true } }, values: [50, 60] },
          { source: { displayName: "M3", queryName: "M3", roles: { actual: true } }, values: [10, 15] },
          { source: { displayName: "M4", queryName: "M4", roles: { actual: true } }, values: [40, 45] }
        ]
      },
      metadata: { columns: [], objects: {} }
    };
    const result = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cells = ((v as any).buildAnalysisCells(result, result.points, "cumulative")).values;
    for (let col = 0; col < result.points.length; col++) {
      const colSum = cells.reduce(
        (s: number, row: number[]) => s + (row[col] ?? 0),
        0
      );
      expect(colSum).toBeCloseTo(result.points[col].actual, 6);
    }
  });

  test("INVARIANT: Σ(cells[*][col]) === bar.actual (comparison synth M=3 measures)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings.general.mode.value = {
      value: "comparison",
      displayName: "Comparison"
    };
    const dv = {
      categorical: {
        categories: [
          {
            source: { displayName: "Cat", queryName: "Cat", roles: { category: true } },
            values: ["A", "A", "B", "B"],
            identity: [{}, {}, {}, {}]
          },
          {
            source: { displayName: "R", queryName: "R", roles: { analysisDim: true } },
            values: ["x", "y", "x", "y"],
            identity: [{}, {}, {}, {}]
          }
        ],
        values: [
          { source: { displayName: "Y1", queryName: "Y1", roles: { actual: true } }, values: [10, 20, 30, 40] },
          { source: { displayName: "Y2", queryName: "Y2", roles: { actual: true } }, values: [15, 25, 35, 45] },
          { source: { displayName: "Y3", queryName: "Y3", roles: { actual: true } }, values: [20, 30, 40, 50] }
        ]
      },
      metadata: { columns: [], objects: {} }
    };
    const result = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synth = (v as any).synthesizeComparisonBridge(result, "#aaa");
    expect(synth.points.length).toBe(7);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cells = ((v as any).buildAnalysisCells(result, synth.points, "comparison")).values;
    for (let col = 0; col < synth.points.length; col++) {
      const colSum = cells.reduce(
        (s: number, row: number[]) => s + (row[col] ?? 0),
        0
      );
      expect(colSum).toBeCloseTo(synth.points[col].actual, 6);
    }
  });

  test("INVARIANT: Σ(cells[*][col]) === bar.actual (GT auto-appended)", () => {
    const v = makeVisual();
    const dv = makeAnalysisDv({
      cats: [{ name: "Cat", values: ["A", "A", "B", "B"] }],
      analysisDim: { name: "R", values: ["x", "y", "x", "y"] },
      vals: [{ name: "S", values: [10, 20, 30, 40] }]
    });
    const result = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gt = (v as any).appendGrandTotal(
      result.points,
      result.categoryDisplay,
      "Total",
      "#aaa",
      []
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cells = ((v as any).buildAnalysisCells(result, gt.points, "cumulative")).values;
    for (let col = 0; col < gt.points.length; col++) {
      const colSum = cells.reduce(
        (s: number, row: number[]) => s + (row[col] ?? 0),
        0
      );
      expect(colSum).toBeCloseTo(gt.points[col].actual, 6);
    }
  });

  test("Analysis cell sums tolerate sparse rows (skip null measure values)", () => {
    const v = makeVisual();
    const dv = makeAnalysisDv({
      cats: [{ name: "Cat", values: ["A", "A"] }],
      analysisDim: { name: "R", values: ["x", "y"] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vals: [{ name: "S", values: [null as any, 5] }]
    });
    const result = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cells = ((v as any).buildAnalysisCells(result, result.points, "cumulative")).values;
    expect(cells[0][0]).toBe(0);
    expect(cells[1][0]).toBe(5);
  });
});

describe("Legend semantics — comprehensive coverage", () => {
  test("No-cat + legend (3 values) + 1 measure → 1 pillar with 3 segments", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Region", values: ["EMEA", "NA", "APAC"], isLegend: true }],
      vals: [{ name: "Sales", role: "actual", values: [100, 200, 50] }]
    });
    const result = parse(v, dv);
    expect(result.isNoCategoryMode).toBe(true);
    expect(result.legendValues.length).toBe(3);
    expect(result.legendDisplayName).toBe("Region");
    expect(result.points.length).toBe(1);
    expect(result.points[0].segments?.length).toBe(3);
    expect(result.points[0].actual).toBe(350);
  });

  test("No-cat + legend + 3 measures → 3 pillars, each with N segments", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Type", values: ["IN", "OUT"], isLegend: true }],
      vals: [
        { name: "Q1", role: "actual", values: [50, -20] },
        { name: "Q2", role: "actual", values: [60, -10] },
        { name: "Q3", role: "actual", values: [80, -30] }
      ]
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(3);
    expect(result.points[0].segments?.length).toBe(2);
    expect(result.points[1].segments?.length).toBe(2);
    expect(result.points[2].segments?.length).toBe(2);
    expect(result.points[0].actual).toBe(30);
    expect(result.points[1].actual).toBe(50);
    expect(result.points[2].actual).toBe(50);
  });

  test("No-cat + legend: segment values match measure.values per legend row", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Reg", values: ["A", "B"], isLegend: true }],
      vals: [{ name: "Sales", role: "actual", values: [100, 200] }]
    });
    const result = parse(v, dv);
    expect(result.points[0].segments![0].value).toBe(100);
    expect(result.points[0].segments![1].value).toBe(200);
    expect(result.points[0].segments![0].label).toBe("A");
    expect(result.points[0].segments![1].label).toBe("B");
  });

  test("No-cat + legend: segment colours are unique per legend value", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Reg", values: ["X", "Y", "Z"], isLegend: true }],
      vals: [{ name: "Sales", role: "actual", values: [1, 2, 3] }]
    });
    const result = parse(v, dv);
    const colors = result.points[0].segments!.map(
      (s: { color: string }) => s.color
    );
    expect(new Set(colors).size).toBe(3);
  });

  test("With-dim path: 2 dims (Cat + Legend) preserved (no regression)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        { name: "Reg", values: ["x", "y", "x", "y"], isLegend: true }
      ],
      vals: [{ name: "Sales", role: "actual", values: [10, 20, 30, 40] }]
    });
    const result = parse(v, dv);
    expect(result.isNoCategoryMode).toBe(false);
    expect(result.legendValues.length).toBe(2);
    expect(result.points.length).toBe(2);
    expect(result.points[0].segments?.length).toBe(2);
  });

  test("No-cat + legend in COMPARISON mode → all measures = pillars + segments", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings.general.mode.value = {
      value: "comparison",
      displayName: "Comparison"
    };
    const dv = dvBuild({
      cats: [{ name: "Reg", values: ["A", "B"], isLegend: true }],
      vals: [
        { name: "M1", role: "actual", values: [10, 20] },
        { name: "M2", role: "actual", values: [30, 40] },
        { name: "M3", role: "actual", values: [50, 60] }
      ]
    });
    const result = parse(v, dv);
    expect(result.points.length).toBe(3);
    expect(result.points.every((p: { isPillar: boolean }) => p.isPillar)).toBe(true);
    expect(result.points.every((p: { segments?: unknown[] }) => p.segments?.length === 2)).toBe(true);
  });

  test("Legend value duplicates collapse to single entry (first-row-wins ordering)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Reg", values: ["A", "B", "A"], isLegend: true }],
      vals: [{ name: "Sales", role: "actual", values: [10, 20, 30] }]
    });
    const result = parse(v, dv);
    expect(result.legendValues.length).toBe(2);
    expect(result.legendValues[0].label).toBe("A");
    expect(result.legendValues[1].label).toBe("B");
  });

  test("Legend with null label is allowed (rendered as empty string)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cats: [{ name: "Reg", values: [null as any, "B"], isLegend: true }],
      vals: [{ name: "Sales", role: "actual", values: [10, 20] }]
    });
    const result = parse(v, dv);
    expect(result.legendValues.length).toBe(2);
    expect(result.legendValues[0].label).toBe("");
    expect(result.legendValues[1].label).toBe("B");
  });

  test("Legend persisted colour (user picked) overrides the themed default", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        {
          name: "Reg",
          values: ["A", "B"],
          isLegend: true,
          objects: [
            { legend: { itemColor: { solid: { color: "#ff0000" } } } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            undefined as any
          ]
        }
      ],
      vals: [{ name: "Sales", role: "actual", values: [10, 20] }]
    });
    const result = parse(v, dv);
    expect(result.legendValues[0].color).toBe("#ff0000");
    expect(result.legendValues[1].color).not.toBe("#ff0000");
  });

  test("Legend ordering is the row-order, NOT alphabetical", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Reg", values: ["Z", "M", "A"], isLegend: true }],
      vals: [{ name: "Sales", role: "actual", values: [1, 2, 3] }]
    });
    const result = parse(v, dv);
    expect(result.legendValues.map((lv: { label: string }) => lv.label)).toEqual(["Z", "M", "A"]);
  });

  test("Legend with same dataset gives stable legendValues across re-parses (no random)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Reg", values: ["X", "Y"], isLegend: true }],
      vals: [{ name: "Sales", role: "actual", values: [10, 20] }]
    });
    const r1 = parse(v, dv);
    const r2 = parse(v, dv);
    expect(r1.legendValues.map((lv: { label: string }) => lv.label)).toEqual(
      r2.legendValues.map((lv: { label: string }) => lv.label)
    );
    expect(r1.legendValues.map((lv: { color: string }) => lv.color)).toEqual(
      r2.legendValues.map((lv: { color: string }) => lv.color)
    );
  });

  test("Legend bound but no measures → empty ParseResult (not legend ghost)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Reg", values: ["A", "B"], isLegend: true }]
    });
    const result = parse(v, dv);
    expect(result).not.toBeNull();
    expect(result.points).toEqual([]);
    expect(result.legendValues).toEqual([]);
  });

  test("No legend at all → segments undefined everywhere (clean shape)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [{ name: "Sales", role: "actual", values: [10, 20] }]
    });
    const result = parse(v, dv);
    expect(result.points[0].segments).toBeUndefined();
    expect(result.points[1].segments).toBeUndefined();
    expect(result.legendValues).toEqual([]);
  });
});

describe("parseNoCategory: cumulative mode toggle behaviour", () => {
  test("4 measures cumulative default: pillars at idx 0 and 3", () => {
    const v = makeVisual();
    const dv = dvBuild({
      vals: [
        { name: "M1", role: "actual", values: [10] },
        { name: "M2", role: "actual", values: [20] },
        { name: "M3", role: "actual", values: [30] },
        { name: "M4", role: "actual", values: [40] }
      ]
    });
    const result = parse(v, dv);
    expect(result.points.map((p: { isPillar: boolean }) => p.isPillar)).toEqual([
      true,
      false,
      false,
      true
    ]);
  });

  test("4 measures cumulative with middle override → 3 pillars", () => {
    const v = makeVisual();
    const dv = dvBuild({
      vals: [
        { name: "M1", role: "actual", values: [10] },
        {
          name: "M2",
          role: "actual",
          values: [20],
          objects: { pillars: { isPillar: true } }
        },
        { name: "M3", role: "actual", values: [30] },
        { name: "M4", role: "actual", values: [40] }
      ]
    });
    const result = parse(v, dv);
    expect(result.points.map((p: { isPillar: boolean }) => p.isPillar)).toEqual([
      true,
      true,
      false,
      true
    ]);
  });

  test("All measures explicitly turned off → no pillars (use showGrandTotal)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      vals: [
        {
          name: "M1",
          role: "actual",
          values: [10],
          objects: { pillars: { isPillar: false } }
        },
        {
          name: "M2",
          role: "actual",
          values: [20],
          objects: { pillars: { isPillar: false } }
        }
      ]
    });
    const result = parse(v, dv);
    expect(result.points.every((p: { isPillar: boolean }) => !p.isPillar)).toBe(true);
  });
});

describe("Focus-filter (table-row) — deriveFilteredParsed aggregation", () => {

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const derive = (v: any, parsed: unknown, idxs: number[]) =>
    v.deriveFilteredParsed(parsed, new Set(idxs));

  test("T1 — focused aggregation equals the selected adim value (cumulative, no legend)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        { name: "R", values: ["x", "y", "x", "y"], isAnalysisDim: true }
      ],
      vals: [{ name: "S", role: "actual", values: [10, 20, 30, 40] }]
    });
    const parsed = parse(v, dv);
    const f = derive(v, parsed, [0]);
    expect(f.points[0].actual).toBe(10);
    expect(f.points[1].actual).toBe(30);
    expect(f.catRowIdxs[0]).toEqual([0]);
    expect(f.catRowIdxs[1]).toEqual([2]);
    expect(parsed.points[0].actual).toBe(30);
    expect(parsed.points[1].actual).toBe(70);
  });

  test("T2 — multi-select union equals the full bar (focus {x, y})", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        { name: "R", values: ["x", "y", "x", "y"], isAnalysisDim: true }
      ],
      vals: [{ name: "S", role: "actual", values: [10, 20, 30, 40] }]
    });
    const parsed = parse(v, dv);
    const f = derive(v, parsed, [0, 1]);
    expect(f.points[0].actual).toBe(30);
    expect(f.points[1].actual).toBe(70);
    expect(f.points[0].actual).toBe(parsed.points[0].actual);
    expect(f.points[1].actual).toBe(parsed.points[1].actual);
  });

  test("T3 — category lacking the focused adim value → that bar is 0", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        { name: "R", values: ["x", "y", "x", "x"], isAnalysisDim: true }
      ],
      vals: [{ name: "S", role: "actual", values: [10, 20, 30, 40] }]
    });
    const parsed = parse(v, dv);
    const f = derive(v, parsed, [1]);
    expect(f.points[0].actual).toBe(20);
    expect(f.points[1].actual).toBe(0);
    expect(f.catRowIdxs[1]).toEqual([]);
  });

  test("T4 — comparison synth on filtered data: masking keeps Σbridges = end − start", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).formattingSettings.general.mode.value = {
      value: "comparison",
      displayName: "Comparison"
    };
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        { name: "R", values: ["x", "y", "x", "y"], isAnalysisDim: true }
      ],
      vals: [
        { name: "Budget", role: "actual", values: [10, 20, 30, 40] },
        { name: "Actual", role: "actual", values: [12, 22, 35, 42] }
      ]
    });
    const parsed = parse(v, dv);
    const f = derive(v, parsed, [0]);
    expect(f.actualMeasures[0].total).toBe(10 + 30);
    expect(f.actualMeasures[1].total).toBe(12 + 35);
    expect(parsed.actualMeasures[0].total).toBe(10 + 20 + 30 + 40);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synth = (v as any).synthesizeComparisonBridge(f, "#aaa");
    const pillars = synth.points.filter((p: { isPillar: boolean }) => p.isPillar);
    const bridges = synth.points.filter((p: { isPillar: boolean }) => !p.isPillar);
    const startPillar = pillars[0];
    const endPillar = pillars[pillars.length - 1];
    expect(startPillar.actual).toBe(40);
    expect(endPillar.actual).toBe(47);
    const bridgeSum = bridges.reduce(
      (s: number, p: { actual: number }) => s + p.actual,
      0
    );
    expect(bridgeSum).toBeCloseTo(endPillar.actual - startPillar.actual, 6);
  });

  test("T5 — no analysisDim bound → reconcileFocus returns empty Set (feature inert)", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [{ name: "S", role: "actual", values: [10, 20, 30] }]
    });
    const parsed = parse(v, dv);
    expect(parsed.analysis).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v as any).reconcileFocus(parsed).size).toBe(0);
  });

  test("T6 — segments filtered (legend + analysisDim): Σ segment.value === bar.actual", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        { name: "Series", values: ["P", "Q", "P", "Q"], isLegend: true },
        { name: "R", values: ["x", "y", "x", "y"], isAnalysisDim: true }
      ],
      vals: [{ name: "S", role: "actual", values: [10, 20, 30, 40] }]
    });
    const parsed = parse(v, dv);
    const f = derive(v, parsed, [0]);
    for (let c = 0; c < f.points.length; c++) {
      const segs = f.points[c].segments || [];
      const segSum = segs.reduce((s: number, sg: { value: number }) => s + sg.value, 0);
      expect(segSum).toBeCloseTo(f.points[c].actual, 6);
      expect(f.catRowIdxs[c].every((r: number) => parsed.analysis.rowIdxByDataRow[r] === 0)).toBe(
        true
      );
    }
    expect(f.points[0].actual).toBe(10);
    expect(f.points[1].actual).toBe(30);
  });

  test("T7 — buildAnalysisCells stays FULL while the chart is focused", () => {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        { name: "R", values: ["x", "y", "x", "y"], isAnalysisDim: true }
      ],
      vals: [{ name: "S", role: "actual", values: [10, 20, 30, 40] }]
    });
    const parsed = parse(v, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cellsFull = (v as any).buildAnalysisCells(parsed, parsed.points, "cumulative").values;
    derive(v, parsed, [0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cellsAfter = (v as any).buildAnalysisCells(parsed, parsed.points, "cumulative").values;
    expect(cellsAfter).toEqual(cellsFull);
    expect(cellsFull[0]).toEqual([10, 30]);
    expect(cellsFull[1]).toEqual([20, 40]);
  });
});
