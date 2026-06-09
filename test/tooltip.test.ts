import {
  buildTooltipItems,
  getBarColor,
  TooltipBuildContext,
  TooltipCategory
} from "../src/tooltip";

const baseContext: TooltipBuildContext = {
  categoryDisplayName: "Country",
  defaultActualDisplayName: "Sales",
  cachedActualFormat: "0",
  varianceMeasures: [],
  tooltipMeasures: [],
  palette: {
    isHighContrast: false,
    hcForeground: "#000000",
    hcHyperlink: "#0078d4",
    themePositive: "#0F9D58",
    themeNegative: "#DB4437"
  },
  bridges: {
    colorBridge: "#50be87",
    displayUnits: "auto",
    decimalPlaces: 0
  },
  pillars: {
    pillarColor: "",
    displayUnits: "auto",
    decimalPlaces: 0
  },
  locale: "en-US",
  yAxisDisplayUnits: "auto",
  yAxisDecimalPlaces: 0,
  dataMaxAbs: 1
};

const pillarCdp: TooltipCategory = {
  label: "France",
  isPillar: true,
  pillarColor: "#FFAA00",
  actualValue: 1250,
  varianceValues: [],
  identity: { __identity: true }
};

const bridgePosCdp: TooltipCategory = {
  label: "Marketing",
  isPillar: false,
  pillarColor: "#FFAA00",
  actualValue: 250,
  varianceValues: [],
  identity: { __identity: true }
};

const bridgeNegCdp: TooltipCategory = {
  label: "Refunds",
  isPillar: false,
  pillarColor: "#FFAA00",
  actualValue: -150,
  varianceValues: [],
  identity: { __identity: true }
};

describe("buildTooltipItems — native PBI tooltip parity", () => {
  test("first item shows the CATEGORY column name as displayName, never empty", () => {
    const items = buildTooltipItems(pillarCdp, 0, baseContext);
    expect(items[0].displayName).toBe("Country");
    expect(items[0].value).toBe("France");
    expect(items[0].displayName.length).toBeGreaterThan(0);
  });

  test("first item falls back to 'Category' when categoryDisplayName is empty", () => {
    const items = buildTooltipItems(pillarCdp, 0, {
      ...baseContext,
      categoryDisplayName: ""
    });
    expect(items[0].displayName).toBe("Category");
    expect(items[0].value).toBe("France");
  });

  test("NO `header` is set on any item — native PBI visuals show no title by default", () => {
    const items = buildTooltipItems(pillarCdp, 0, baseContext);
    items.forEach((it) => {
      expect(it.header).toBeUndefined();
    });
  });

  test("each item carries `color` (the bar fill colour) so PBI draws a coloured pastille", () => {
    const items = buildTooltipItems(pillarCdp, 0, baseContext);
    items.forEach((it) => {
      expect(it.color).toBeDefined();
      expect(it.color).toMatch(/^#[0-9a-fA-F]{3,6}$/);
    });
  });

  test("text colour is NEVER set on an item — PBI handles contrast itself", () => {
    const items = buildTooltipItems(pillarCdp, 0, baseContext);
    items.forEach((it) => {
      expect((it as unknown as { textColor?: string }).textColor).toBeUndefined();
    });
  });

  test("variance measures appear with their format + sign", () => {
    const items = buildTooltipItems(
      { ...pillarCdp, varianceValues: [-150, 250] },
      0,
      {
        ...baseContext,
        varianceMeasures: [
          {
            name: "Δ N-1",
            format: "+#,0;-#,0;0",
            displayUnits: "auto",
            decimalPlaces: 0,
            maxAbs: 250
          },
          {
            name: "Δ Budget",
            format: "+#,0;-#,0;0",
            displayUnits: "auto",
            decimalPlaces: 0,
            maxAbs: 250
          }
        ]
      }
    );
    expect(items.length).toBe(4);
    expect(items[2].displayName).toBe("Δ N-1");
    expect(items[2].value).toBe("-150");
    expect(items[3].value).toBe("+250");
  });

  test("returns [] when category display point is undefined", () => {
    expect(buildTooltipItems(undefined, -1, baseContext)).toEqual([]);
  });
});

describe("getBarColor — matches the renderer's resolution chain", () => {
  test("pillar always uses cdp.pillarColor (already pre-resolved in parseDataView)", () => {
    expect(getBarColor(pillarCdp, baseContext)).toBe(pillarCdp.pillarColor);
    const ctx: TooltipBuildContext = {
      ...baseContext,
      pillars: { pillarColor: "#123456", displayUnits: "auto", decimalPlaces: 0 }
    };
    expect(getBarColor(pillarCdp, ctx)).toBe(pillarCdp.pillarColor);
  });

  test("synth pillar (identity undefined) — uses cdp.pillarColor", () => {
    const synth: TooltipCategory = { ...pillarCdp, identity: undefined };
    expect(getBarColor(synth, baseContext)).toBe(synth.pillarColor);
  });

  test("bridge with no per-row override → uses global colorBridge (sign-agnostic)", () => {
    expect(getBarColor(bridgePosCdp, baseContext)).toBe("#50be87");
    expect(getBarColor(bridgeNegCdp, baseContext)).toBe("#50be87");
  });

  test("bridge with cdp.bridgeColor set (per-row fx) → uses override regardless of sign", () => {
    const cdpPos: TooltipCategory = { ...bridgePosCdp, bridgeColor: "#abcdef" };
    const cdpNeg: TooltipCategory = { ...bridgeNegCdp, bridgeColor: "#fedcba" };
    expect(getBarColor(cdpPos, baseContext)).toBe("#abcdef");
    expect(getBarColor(cdpNeg, baseContext)).toBe("#fedcba");
  });

  test("HC mode forces foreground for everything — pillar and bridge", () => {
    const ctx: TooltipBuildContext = {
      ...baseContext,
      palette: { ...baseContext.palette, isHighContrast: true }
    };
    expect(getBarColor(bridgeNegCdp, ctx)).toBe(ctx.palette.hcForeground);
    expect(getBarColor(bridgePosCdp, ctx)).toBe(ctx.palette.hcForeground);
    expect(getBarColor(pillarCdp, ctx)).toBe(ctx.palette.hcForeground);
  });
});
