import { formatActualLabel, formatVarianceValue, getDisplayScale } from "../src/format";

describe("formatVarianceValue — Excel-style format parser", () => {
  test("strips Excel colour codes ([Red], [Green], [$-409])", () => {
    expect(formatVarianceValue(0.05, "[Green]+0.0%;[Red]-0.0%", "en-US")).toBe("+5.0%");
    expect(formatVarianceValue(-0.05, "[Green]+0.0%;[Red]-0.0%", "en-US")).toBe("-5.0%");
    expect(formatVarianceValue(1234, "[Black]#,##0", "en-US")).toBe("1,234");
  });

  test("percentage format multiplies by 100 and adds % suffix", () => {
    expect(formatVarianceValue(0.05, "0.00%", "en-US")).toBe("5.00%");
    expect(formatVarianceValue(0.123, "0.0%", "en-US")).toBe("12.3%");
    expect(formatVarianceValue(-0.05, "0.00%", "en-US")).toBe("-5.00%");
  });

  test("parenthesised-negative format does NOT double-prefix with extra '-'", () => {
    expect(formatVarianceValue(-1234, "+#,##0;(#,##0);0", "en-US")).toBe("(1,234)");
    expect(formatVarianceValue(1234, "+#,##0;(#,##0);0", "en-US")).toBe("+1,234");
  });

  test("explicit + sign in format honoured for positive values", () => {
    expect(formatVarianceValue(1234, "+#,##0", "en-US")).toBe("+1,234");
    expect(formatVarianceValue(-1234, "+#,##0", "en-US")).toBe("-1,234");
  });

  test("currency prefix and suffix preserved", () => {
    expect(formatVarianceValue(1234.5, "$#,##0.00", "en-US")).toBe("$1,234.50");
    expect(formatVarianceValue(1234.5, "#,##0.00 €", "en-US")).toBe("1,234.50 €");
  });

  test("decimalsOverride wins over the format's own decimal portion", () => {
    expect(formatVarianceValue(1234.5, "0.00", "en-US", 0)).toBe("1235");
    expect(formatVarianceValue(0.05, "0%", "en-US", 2)).toBe("5.00%");
  });

  test("empty format string → no Excel pattern applied, plain locale number with no forced sign", () => {
    expect(formatVarianceValue(1234, "", "en-US")).toBe("1234");
    expect(formatVarianceValue(-1234, "", "en-US")).toBe("-1234");
    expect(formatVarianceValue(0, "", "en-US")).toBe("0");
  });

  test("returns empty string for null / undefined / NaN", () => {
    expect(formatVarianceValue(null, "0.00%", "en-US")).toBe("");
    expect(formatVarianceValue(NaN, "0.00%", "en-US")).toBe("");
  });

  test("user repro: +#,0 m€;-#,0;0 m€ — suffix inherits from positive when negative is sign+digits only", () => {
    expect(formatVarianceValue(8, "+#,0 m€;-#,0;0 m€", "en-US")).toBe("+8 m€");
    expect(formatVarianceValue(-8, "+#,0 m€;-#,0;0 m€", "en-US")).toBe("-8 m€");
    expect(formatVarianceValue(0, "+#,0 m€;-#,0;0 m€", "en-US")).toBe("0 m€");
    expect(formatVarianceValue(1234, "+#,0 m€;-#,0;0 m€", "en-US")).toBe("+1,234 m€");
    expect(formatVarianceValue(-1234, "+#,0 m€;-#,0;0 m€", "en-US")).toBe("-1,234 m€");
  });

  test("explicit non-numeric negative pattern is NOT modified by inheritance", () => {
    expect(formatVarianceValue(-1234, "+#,##0 €;(#,##0 €);0 €", "en-US")).toBe("(1,234 €)");
    expect(formatVarianceValue(-8, "+#,0 €;-#,0 $;0 €", "en-US")).toBe("-8 $");
    expect(formatVarianceValue(-8, "+0;-0;0", "en-US")).toBe("-8");
  });

  test("leading whitespace before sign in pattern does NOT duplicate the sign", () => {
    expect(formatVarianceValue(8, " +#,0 m€;-#,0;0 m€", "en-US")).toBe("+8 m€");
    expect(formatVarianceValue(-8, "+#,0 m€; -#,0;0 m€", "en-US")).toBe("-8 m€");
    expect(formatVarianceValue(8, "  +#,##0", "en-US")).toBe("+8");
  });

  test("DAX format literals — `\\X` escape and `\"X\"` quoted text are honoured", () => {
    expect(formatVarianceValue(73704, '# ##0\\ "€";-# ##0\\ "€"', "fr-FR")).toBe("73 704 €");
    expect(formatVarianceValue(6656500, '# ##0\\ "€";-# ##0\\ "€"', "fr-FR")).toBe("6 656 500 €");
    expect(formatVarianceValue(-1234, '# ##0\\ "€";-# ##0\\ "€"', "fr-FR")).toBe("-1 234 €");
    expect(formatVarianceValue(1234, '#,##0\\ "EUR"', "en-US")).toBe("1,234 EUR");
    expect(formatVarianceValue(1234.5, '# ##0.00\\ "€"', "fr-FR")).toBe("1 234,50 €");
  });

  test("parenthesised-negative with trailing currency suffix → no extra '-'", () => {
    expect(formatVarianceValue(-8, "+#,0 m€;(#,0 m€);0 m€", "en-US")).toBe("(8 m€)");
    expect(formatVarianceValue(-1234, "+#,0 m€;(#,0 m€);0 m€", "en-US")).toBe("(1,234 m€)");
    expect(formatVarianceValue(8, "+#,0 m€;(#,0 m€);0 m€", "en-US")).toBe("+8 m€");
  });
});

describe("formatActualLabel — display-unit policy", () => {
  const baseOpts = {
    autoDecimals: 0,
    locale: "en-US",
    dataMaxAbs: 1000
  };

  test("auto units + custom format → respect format, NO auto-scaling suffix", () => {
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 1500000,
        modelFormat: "$#,##0",
        cardUnits: "auto",
        cardDecimals: 0,
        dataMaxAbs: 1500000
      })
    ).toBe("$1,500,000");
  });

  test("auto units + percent format does NOT collide with K/M/bn suffix", () => {
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 0.05,
        modelFormat: "0.00%",
        cardUnits: "auto",
        cardDecimals: 0
      })
    ).toBe("5.00%");
  });

  test("auto units + no format → auto-scale K/M/bn for readability", () => {
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 1500000,
        modelFormat: "",
        cardUnits: "auto",
        cardDecimals: 1,
        autoDecimals: 1,
        dataMaxAbs: 1500000
      })
    ).toBe("1.5M");
  });

  test("explicit thousands unit always scales, even with model format", () => {
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 1500,
        modelFormat: "0",
        cardUnits: "thousands",
        cardDecimals: 1,
        dataMaxAbs: 1500
      })
    ).toBe("1.5K");
  });

  test("withSign prefixes a + for positive deltas (variance labels)", () => {
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 1234,
        modelFormat: "0",
        cardUnits: "auto",
        cardDecimals: 0,
        withSign: true
      })
    ).toBe("+1234");
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 1234,
        modelFormat: "+0;-0;0",
        cardUnits: "auto",
        cardDecimals: 0,
        withSign: true
      })
    ).toBe("+1234");
  });
});

describe("getDisplayScale", () => {
  test("named units return fixed scales", () => {
    expect(getDisplayScale("thousands", 0)).toEqual({ scale: 1e3, suffix: "K" });
    expect(getDisplayScale("millions", 0)).toEqual({ scale: 1e6, suffix: "M" });
    expect(getDisplayScale("billions", 0)).toEqual({ scale: 1e9, suffix: "bn" });
    expect(getDisplayScale("none", 0)).toEqual({ scale: 1, suffix: "" });
  });

  test("auto picks K/M/bn based on value size", () => {
    expect(getDisplayScale("auto", 500)).toEqual({ scale: 1, suffix: "" });
    expect(getDisplayScale("auto", 1500)).toEqual({ scale: 1e3, suffix: "K" });
    expect(getDisplayScale("auto", 2_500_000)).toEqual({ scale: 1e6, suffix: "M" });
    expect(getDisplayScale("auto", 5e9)).toEqual({ scale: 1e9, suffix: "bn" });
    expect(getDisplayScale("auto", 5e12)).toEqual({ scale: 1e12, suffix: "T" });
  });
});
