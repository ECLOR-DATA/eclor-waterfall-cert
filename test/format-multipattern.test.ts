
import { formatActualLabel } from "../src/format";

describe("formatActualLabel — multi-pattern format + explicit display units (audit TG-10)", () => {
  const baseOpts = {
    autoDecimals: 0,
    locale: "en-US",
    dataMaxAbs: 1000
  };

  test("explicit thousands + sign-aware multi-pattern → scale, then format, then append K", () => {
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 1500,
        modelFormat: "+#,0;-#,0",
        cardUnits: "thousands",
        cardDecimals: 1,
        dataMaxAbs: 1500
      })
    ).toBe("+1.5K");
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 2_500_000,
        modelFormat: "+#,0;-#,0",
        cardUnits: "millions",
        cardDecimals: 1,
        dataMaxAbs: 2_500_000
      })
    ).toBe("+2.5M");
  });

  test("negative value selects the negative section AFTER scaling", () => {
    expect(
      formatActualLabel({
        ...baseOpts,
        value: -1500,
        modelFormat: "+#,0;-#,0",
        cardUnits: "thousands",
        cardDecimals: 1,
        dataMaxAbs: 1500
      })
    ).toBe("-1.5K");
  });

  test("zero value selects the zero section; unit suffix still appended (0K)", () => {
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 0,
        modelFormat: "+#,0;-#,0;0",
        cardUnits: "thousands",
        cardDecimals: 0
      })
    ).toBe("0K");
  });

  test("format-embedded unit text beats the explicit unit pick — no scaling, no K (decision 1.1.59.0)", () => {
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 1500,
        modelFormat: "+#,0 m€;-#,0 m€",
        cardUnits: "thousands",
        cardDecimals: 0,
        dataMaxAbs: 1500
      })
    ).toBe("+1,500 m€");
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 1500,
        modelFormat: "+#,0 m€;-#,0 m€",
        cardUnits: "thousands",
        cardDecimals: 1,
        dataMaxAbs: 1500
      })
    ).toBe("+1,500.0 m€");
    expect(
      formatActualLabel({
        ...baseOpts,
        value: -1500,
        modelFormat: "+#,0 m€;-#,0 m€",
        cardUnits: "thousands",
        cardDecimals: 1,
        dataMaxAbs: 1500
      })
    ).toBe("-1,500.0 m€");
    expect(
      formatActualLabel({
        ...baseOpts,
        value: -1500,
        modelFormat: "+#,0 m€;-#,0",
        cardUnits: "thousands",
        cardDecimals: 1,
        dataMaxAbs: 1500
      })
    ).toBe("-1,500.0 m€");
  });

  test("auto units + multi-pattern percent → no unit scaling, ×100 applied exactly once", () => {
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 0.05,
        modelFormat: "+0.0%;-0.0%",
        cardUnits: "auto",
        cardDecimals: 0
      })
    ).toBe("+5.0%");
    expect(
      formatActualLabel({
        ...baseOpts,
        value: -0.05,
        modelFormat: "+0.0%;-0.0%",
        cardUnits: "auto",
        cardDecimals: 0
      })
    ).toBe("-5.0%");
  });

  test("explicit thousands + multi-pattern percent → percent wins, no double-transform (decision 1.1.59.0)", () => {
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 0.05,
        modelFormat: "+0.0%;-0.0%",
        cardUnits: "thousands",
        cardDecimals: 0
      })
    ).toBe("+5.0%");
  });

  test("cardDecimals=0 lets the format's own decimal portion drive precision", () => {
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 1500,
        modelFormat: "+#,0.00;-#,0.00",
        cardUnits: "thousands",
        cardDecimals: 0,
        dataMaxAbs: 1500
      })
    ).toBe("+1.50K");
  });

  test("withSign does not double-prefix a multi-pattern body that already starts with '+'", () => {
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 1500,
        modelFormat: "+#,0;-#,0",
        cardUnits: "thousands",
        cardDecimals: 1,
        withSign: true
      })
    ).toBe("+1.5K");
    expect(
      formatActualLabel({
        ...baseOpts,
        value: 1500,
        modelFormat: "#,0;-#,0",
        cardUnits: "thousands",
        cardDecimals: 1,
        withSign: true
      })
    ).toBe("+1.5K");
  });
});
