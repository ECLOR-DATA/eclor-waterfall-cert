// Audit TG-10 — format.ts multi-pattern format × explicit display units.
// The branch at src/format.ts (hasMultiPattern + explicit cardUnits) scales
// then appends the unit suffix — UNLESS the format carries its own literal
// suffix or percent, in which case the format wins verbatim (no scale, no
// suffix; decision 1.1.59.0, multiPatternCarriesAffix). format.test.ts covers
// multi-pattern only under auto units and explicit units only with
// single-pattern formats; this suite pins the intersection.

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
    // Millions variant — same pipeline, M suffix.
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
    // pins current behavior — see audit TG-10. Zero gets the bare "0" section
    // of the format, then the explicit-unit "K" is concatenated → "0K".
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
    // Audit TG-10 resolution: when the multi-pattern format carries its own
    // literal suffix, the explicit display-unit pick is ignored entirely
    // (neither scaled nor suffixed) — mirror of the auto-units verbatim
    // policy. The old behaviour emitted the '+2 m€K' collision.
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
    // Negative section keeps its own literal suffix, still unscaled.
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
    // Detection is format-wide (any section) so a suffix-less negative
    // section doesn't reintroduce mixed scaled/unscaled labels per sign —
    // and inheritSuffix gives it the positive's " m€" anyway.
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
    // Audit TG-10 resolution: a % pattern makes the explicit unit pick inert.
    // The old behaviour divided by 1000 THEN multiplied by 100 (0.05 →
    // 0.00005 → 0.005 → "+0.0%K") — mathematically meaningless output.
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
    // decOverride is only passed when cardDecimals > 0 — ".00" in the format
    // survives the explicit-unit scaling.
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
    // Positive section without explicit "+" → withSign adds it around the
    // suffixed body ("1.5K" → "+1.5K"), not inside the number.
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
