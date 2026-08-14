"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

/** Build a ColorPicker pre-wired for the conditional-formatting (fx) button.
 *  Sets the full Microsoft-required triplet:
 *    - selector            : wildcard for the data-bound (rule) path
 *    - altConstantSelector : wildcard for the constant path — gives PBI a
 *      stable target to persist the chosen constant when no per-row data
 *      point exists (no-category mode). Without it, the picker silently
 *      reverts to the theme default because the shell has nowhere to write.
 *    - instanceKind        : ConstantOrRule so the fx affordance renders. */
function makeFxColorPicker(
  opts: ConstructorParameters<typeof formattingSettings.ColorPicker>[0]
): formattingSettings.ColorPicker {
  const cp = new formattingSettings.ColorPicker(opts);
  cp.selector = dataViewWildcard.createDataViewWildcardSelector(
    dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals
  );
  cp.altConstantSelector = dataViewWildcard.createDataViewWildcardSelector(
    dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals
  );
  cp.instanceKind = powerbi.VisualEnumerationInstanceKinds.ConstantOrRule;
  return cp;
}

// (Removed makeFxTextInput in 1.0.82 — fx-on-text experiment confirmed
// inert in Power BI Desktop ≤ Dec 2025: shell never renders the fx
// affordance for TextInput properties, even with the full descriptor
// triplet selector + altConstantSelector + instanceKind=ConstantOrRule.
// Reverted to plain TextInputs for arc custom text and pivoted to a
// donut-chart-style "Label contents" UX with three preset options.)

// ---- Helpers ----
/** The five canonical display-unit values — ALSO consumed by visual.ts (the
 *  per-measure validation whitelist + the dynamic per-measure dropdowns) so
 *  the list can never drift between the pane and its readers (audit
 *  settings-slice-factories). */
export const DISPLAY_UNIT_VALUES = ["auto", "none", "thousands", "millions", "billions"] as const;

/** Standard "Display units" dropdown — only the label of the "auto" entry
 *  varies per card ("Auto" vs "Auto (Y axis)" for cards that inherit the
 *  Y-axis scale). */
function makeDisplayUnitsDropdown(autoLabel: string = "Auto"): formattingSettings.ItemDropdown {
  const labels: Record<string, string> = {
    auto: autoLabel,
    none: "None",
    thousands: "Thousands",
    millions: "Millions",
    billions: "Billions"
  };
  const items = DISPLAY_UNIT_VALUES.map((v) => ({ value: v, displayName: labels[v] }));
  return new formattingSettings.ItemDropdown({
    name: "displayUnits",
    displayName: "Display units",
    items,
    value: items[0]
  });
}

/** Standard 0–6 "Decimal places" control. */
function makeDecimalPlaces(): formattingSettings.NumUpDown {
  return new formattingSettings.NumUpDown({
    name: "decimalPlaces",
    displayName: "Decimal places",
    value: 0,
    options: {
      minValue: { type: 0, value: 0 },
      maxValue: { type: 1, value: 6 }
    }
  });
}

/** Standard label-background toggle / transparency pair (the colour picker
 *  stays per-card: fx-enabled on Bridges/Pillars/Arc, plain on Rails). */
function makeLabelBgShow(): formattingSettings.ToggleSwitch {
  return new formattingSettings.ToggleSwitch({
    name: "labelBgShow",
    displayName: "Label background",
    value: true
  });
}
function makeLabelBgTransparency(displayName: string = "Transparency (%)"): formattingSettings.NumUpDown {
  return new formattingSettings.NumUpDown({
    name: "labelBgTransparency",
    displayName,
    value: 0,
    options: {
      minValue: { type: 0, value: 0 },
      maxValue: { type: 1, value: 100 }
    }
  });
}

/** Standard FontControl (capabilities props: fontFamily, fontSize, bold, italic, underline) */
function makeFontControl(defaultSize: number, defaultBold: boolean): formattingSettings.FontControl {
  return new formattingSettings.FontControl({
    name: "font",
    displayName: "Font",
    fontFamily: new formattingSettings.FontPicker({
      name: "fontFamily",
      displayName: "Font family",
      // Safety fallback only — at runtime update() overwrites this with the
      // resolved REPORT THEME font (applyThemeFont) when the user hasn't
      // picked one, so the dropdown shows the theme font (never blank) and the
      // chart matches it. A user pick still applies verbatim.
      value: "Segoe UI"
    }),
    fontSize: new formattingSettings.NumUpDown({
      name: "fontSize",
      displayName: "Text size",
      value: defaultSize,
      options: {
        minValue: { type: 0, value: 6 },
        maxValue: { type: 1, value: 60 }
      }
    }),
    bold: new formattingSettings.ToggleSwitch({
      name: "bold",
      displayName: "Bold",
      value: defaultBold
    }),
    italic: new formattingSettings.ToggleSwitch({
      name: "italic",
      displayName: "Italic",
      value: false
    }),
    underline: new formattingSettings.ToggleSwitch({
      name: "underline",
      displayName: "Underline",
      value: false
    })
  });
}

/** Title FontControl (capabilities props: titleFontFamily, titleFontSize, titleBold, titleItalic, titleUnderline) */
function makeTitleFontControl(defaultSize: number, defaultBold: boolean): formattingSettings.FontControl {
  return new formattingSettings.FontControl({
    name: "titleFont",
    displayName: "Title font",
    fontFamily: new formattingSettings.FontPicker({
      name: "titleFontFamily",
      displayName: "Title font family",
      // Safety fallback; runtime applyThemeFont sets the theme font (see makeFontControl).
      value: "Segoe UI"
    }),
    fontSize: new formattingSettings.NumUpDown({
      name: "titleFontSize",
      displayName: "Title text size",
      value: defaultSize,
      options: {
        minValue: { type: 0, value: 6 },
        maxValue: { type: 1, value: 60 }
      }
    }),
    bold: new formattingSettings.ToggleSwitch({
      name: "titleBold",
      displayName: "Title bold",
      value: defaultBold
    }),
    italic: new formattingSettings.ToggleSwitch({
      name: "titleItalic",
      displayName: "Title italic",
      value: false
    }),
    underline: new formattingSettings.ToggleSwitch({
      name: "titleUnderline",
      displayName: "Title underline",
      value: false
    })
  });
}

// ============ GENERAL ============
// General — keeps only the Waterfall-specific mode toggle. Title /
// background / border / alt-text are all already provided by Power BI's
// native "General" tab, so we don't duplicate them inside our Format pane.
class GeneralCardSettings extends FormattingSettingsCard {
  mode = new formattingSettings.ItemDropdown({
    name: "mode",
    displayName: "Waterfall mode",
    items: [
      { value: "cumulative", displayName: "Cumulative" },
      { value: "comparison", displayName: "Comparison" }
    ],
    value: { value: "cumulative", displayName: "Cumulative" }
  });
  // Orientation (feat/vertical-waterfall): "horizontal" = the historical
  // certified rendering (vertical bars, categories on the X axis);
  // "vertical" = IBCS "structure" style (horizontal bars, categories on the
  // vertical axis, first pillar on top, values growing rightward). The
  // persisted values are stable API — renderer branches on them.
  orientation = new formattingSettings.ItemDropdown({
    name: "orientation",
    displayName: "Orientation",
    items: [
      { value: "horizontal", displayName: "Horizontal" },
      { value: "vertical", displayName: "Vertical" }
    ],
    value: { value: "horizontal", displayName: "Horizontal" }
  });
  // 1.1.13.0: in-visual "Show items with no data" toggle. PBI's native
  // field-level toggle (right-click on the dim) only filters fully-empty
  // expansion tuples and ships rows whose primary measure returned BLANK
  // through the categorical mapping anyway — so a category with every
  // contributing row null still appeared on the X axis as an empty slot.
  // OFF (default) ⇒ parseDataView drops those rows, matching native bar /
  // column visuals. ON ⇒ they stay (matches the PBI toggle ON semantics).
  showItemsWithNoData = new formattingSettings.ToggleSwitch({
    name: "showItemsWithNoData",
    displayName: "Show items with no data",
    value: false
  });
  name: string = "general";
  displayName: string = "General";
  displayNameKey: string = "Visual_General";
  slices: FormattingSettingsSlice[] = [
    this.mode,
    this.orientation,
    this.showItemsWithNoData
  ];
}

// ============ GRAND TOTAL ============
// Dedicated card (1.1.75) for the synthetic "Grand total" pillar appended in
// cumulative mode. Owns the bar (show toggle / label text / bar colour) AND a
// full label-style set independent of the Pillars card — so the total can be
// styled (font, colour, background) differently from the regular pillars. The
// renderer special-cases `isGrandTotal` to read these instead of pillar style.
class GrandTotalCardSettings extends FormattingSettingsCard {
  // Cumulative mode: append a synthetic "Grand total" pillar at the right
  // carrying the final running total (all-bridge charts: the plain sum —
  // PBI's classic waterfall). Works with or without pillars since 1.1.62.
  showGrandTotal = new formattingSettings.ToggleSwitch({
    name: "showGrandTotal",
    displayName: "Show grand total (cumulative)",
    value: true
  });
  grandTotalLabel = new formattingSettings.TextInput({
    name: "grandTotalLabel",
    displayName: "Grand total label",
    placeholder: "Grand total",
    value: ""
  });
  // Empty default ⇒ the synth Grand Total pillar uses the regular pillar
  // colour (theme palette or the user-set global pillar color). When set,
  // overrides only the Grand Total bar.
  grandTotalColor = new formattingSettings.ColorPicker({
    name: "grandTotalColor",
    displayName: "Grand total color",
    value: { value: "" }
  });
  // Label text colour — mirrors pillars.colorPillarLabel default (#000000) so
  // the GT label looks identical to today until the user overrides it.
  grandTotalLabelColor = new formattingSettings.ColorPicker({
    name: "grandTotalLabelColor",
    displayName: "Label color",
    value: { value: "#000000" }
  });
  // Optional background pill behind the GT value label — same defaults as the
  // Pillars card (show=true + empty colour ⇒ renderer short-circuits, no bg
  // until the user picks a colour).
  labelBgShow = makeLabelBgShow();
  labelBgColor = new formattingSettings.ColorPicker({
    name: "labelBgColor",
    displayName: "Label background color",
    value: { value: "" }
  });
  labelBgTransparency = makeLabelBgTransparency();
  // Bold default matches the Pillars label font so the GT label starts out
  // looking like the other pillar labels.
  font = makeFontControl(14, true);
  name: string = "grandTotal";
  displayName: string = "Grand total";
  displayNameKey: string = "Visual_GrandTotal";
  slices: FormattingSettingsSlice[] = [
    this.showGrandTotal,
    this.grandTotalLabel,
    this.grandTotalColor,
    this.grandTotalLabelColor,
    this.labelBgShow,
    this.labelBgColor,
    this.labelBgTransparency,
    this.font
  ];
}

// ============ X AXIS ============
class XAxisCardSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({
    name: "show",
    displayName: "Show",
    value: true
  });
  labelOrientation = new formattingSettings.ItemDropdown({
    name: "labelOrientation",
    displayName: "Label orientation",
    items: [
      { value: "horizontal", displayName: "Horizontal" },
      { value: "diagonal", displayName: "Diagonal" },
      { value: "vertical", displayName: "Vertical" }
    ],
    value: { value: "horizontal", displayName: "Horizontal" }
  });
  font = makeFontControl(14, false);
  color = new formattingSettings.ColorPicker({
    name: "color",
    displayName: "Color",
    value: { value: "#000000" }
  });
  showTitle = new formattingSettings.ToggleSwitch({
    name: "showTitle",
    displayName: "Show title",
    value: false
  });
  titleText = new formattingSettings.TextInput({
    name: "titleText",
    displayName: "Title text",
    placeholder: "(uses category name by default)",
    value: ""
  });
  titleColor = new formattingSettings.ColorPicker({
    name: "titleColor",
    displayName: "Title color",
    value: { value: "#000000" }
  });
  titleFont = makeTitleFontControl(14, true);
  name: string = "xAxis";
  displayName: string = "X axis";
  displayNameKey: string = "Visual_XAxis";
  slices: FormattingSettingsSlice[] = [
    this.show,
    this.labelOrientation,
    this.font,
    this.color,
    this.showTitle,
    this.titleText,
    this.titleFont,
    this.titleColor
  ];
}

// ============ Y AXIS ============
class YAxisCardSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({
    name: "show",
    displayName: "Show",
    value: true
  });
  // Comparison-only zoom: lifts yMin (all-positive) or lowers yMax
  // (all-negative) to a fraction of maxVisual / |minVisual|, so near-equal
  // pillars + small bridges stretch across the chart. Pillars stay anchored
  // (yScaleClamped) and broken-axis stripes signal the rupture.
  //
  // 1.0.93 — removed yAxisMargin (hardcoded 5% internally — see visual.ts)
  // plus yAxisMin / yAxisMinAuto / yAxisMax / yAxisMaxAuto. None of those
  // five controls were used in practice: the auto-fit + yMinOffset slider
  // already cover ~all real-world scenarios, and exposing 5 fine-grained
  // knobs polluted the format pane without measurable benefit.
  yMinOffset = new formattingSettings.NumUpDown({
    name: "yMinOffset",
    displayName: "Y axis floor offset (%) — Comparison only",
    value: 0,
    options: {
      minValue: { type: 0, value: 0 },
      maxValue: { type: 1, value: 95 }
    }
  });
  showBrokenAxis = new formattingSettings.ToggleSwitch({
    name: "showBrokenAxis",
    displayName: "Show broken axis indicator",
    value: true
  });
  showGridlines = new formattingSettings.ToggleSwitch({
    name: "showGridlines",
    displayName: "Show gridlines",
    value: true
  });
  gridlineStyle = new formattingSettings.ItemDropdown({
    name: "gridlineStyle",
    displayName: "Gridline style",
    items: [
      { value: "solid", displayName: "Solid" },
      { value: "dashed", displayName: "Dashed" },
      { value: "dotted", displayName: "Dotted" }
    ],
    value: { value: "dotted", displayName: "Dotted" }
  });
  displayUnits = makeDisplayUnitsDropdown();
  decimalPlaces = makeDecimalPlaces();
  font = makeFontControl(14, false);
  color = new formattingSettings.ColorPicker({
    name: "color",
    displayName: "Color",
    value: { value: "#595959" }
  });
  showTitle = new formattingSettings.ToggleSwitch({
    name: "showTitle",
    displayName: "Show title",
    value: false
  });
  titleText = new formattingSettings.TextInput({
    name: "titleText",
    displayName: "Title text",
    placeholder: "(uses measure name by default)",
    value: ""
  });
  titleColor = new formattingSettings.ColorPicker({
    name: "titleColor",
    displayName: "Title color",
    value: { value: "#000000" }
  });
  titleFont = makeTitleFontControl(14, true);
  name: string = "yAxis";
  displayName: string = "Y axis";
  displayNameKey: string = "Visual_YAxis";
  slices: FormattingSettingsSlice[] = [
    this.show,
    this.yMinOffset,
    this.showBrokenAxis,
    this.showGridlines,
    this.gridlineStyle,
    this.displayUnits,
    this.decimalPlaces,
    this.font,
    this.color,
    this.showTitle,
    this.titleText,
    this.titleFont,
    this.titleColor
  ];
}

// ============ BRIDGES ============
class BridgesCardSettings extends formattingSettings.CompositeCard {
  showDataLabels = new formattingSettings.ToggleSwitch({
    name: "showDataLabels",
    displayName: "Show data labels",
    value: true
  });
  // "auto" = inherit the Y axis displayUnits choice.
  displayUnits = makeDisplayUnitsDropdown("Auto (Y axis)");
  decimalPlaces = makeDecimalPlaces();
  // Three global colour slices — each carries the fx (conditional formatting)
  // affordance via makeFxColorPicker. Default constants: theme positive for
  // bar + label, white for label background. To drive per-row colours, the
  // user clicks fx on any of these and binds to a DAX measure (Field value),
  // a numeric range (Rules), or a Gradient — PBI deposits the resolved Fill
  // in `categories[0].objects[i].bridges.<name>` which parseDataView reads.
  colorBridge = makeFxColorPicker({
    name: "colorBridge",
    displayName: "Bridge color",
    value: { value: "#50be87" }
  });
  colorBridgeLabel = makeFxColorPicker({
    name: "colorBridgeLabel",
    displayName: "Bridge label color",
    value: { value: "#50be87" }
  });
  // Optional background pill behind the value labels — same pattern as the
  // native PBI bar / column visuals' "Data labels > Background".
  // 1.1.15.0: toggle defaults to TRUE + colour defaults to "" (empty).
  // The renderer short-circuits when the colour is empty, so the user sees
  // no background by default — but picking ANY colour shows it immediately,
  // no toggle ceremony required. The toggle stays for the rare "explicitly
  // disable even though I picked a colour" case.
  labelBgShow = makeLabelBgShow();
  labelBgColor = makeFxColorPicker({
    name: "labelBgColor",
    displayName: "Label background color",
    value: { value: "" }
  });
  labelBgTransparency = makeLabelBgTransparency();
  font = makeFontControl(14, false);
  name: string = "bridges";
  displayName: string = "Bridges";
  displayNameKey: string = "Visual_Bridges";

  // Single "General" group — every bridge colour customisation now happens
  // through the three fx-enabled colour slices above. No more per-category
  // sub-blocks: Field-value fx with a SWITCH measure replaces the manual
  // per-category override UX of versions ≤ 1.0.52.
  generalGroup: formattingSettings.Group = new formattingSettings.Group({
    name: "bridgesGeneral",
    displayName: "General",
    slices: [
      this.showDataLabels,
      this.displayUnits,
      this.decimalPlaces,
      this.colorBridge,
      this.colorBridgeLabel,
      this.labelBgShow,
      this.labelBgColor,
      this.labelBgTransparency,
      this.font
    ]
  });
  groups: formattingSettings.Group[] = [this.generalGroup];
}

// ============ PILLARS ============
class PillarsCardSettings extends formattingSettings.CompositeCard {
  showDataLabels = new formattingSettings.ToggleSwitch({
    name: "showDataLabels",
    displayName: "Show data labels",
    value: true
  });
  // "auto" = inherit the Y axis displayUnits choice (so the labels stay in
  // sync with the axis labels by default). Any other value overrides locally.
  displayUnits = makeDisplayUnitsDropdown("Auto (Y axis)");
  decimalPlaces = makeDecimalPlaces();
  // Three fx-enabled global colour slices — same pattern as Bridges.
  // Empty default for pillarColor ⇒ renderer falls back to the theme
  // palette's primary data colour. For per-row variation, the user clicks
  // fx and binds to a DAX measure (Field value) or a numeric range (Rules).
  pillarColor = makeFxColorPicker({
    name: "pillarColor",
    displayName: "Pillar color",
    value: { value: "" }
  });
  colorPillarLabel = makeFxColorPicker({
    name: "colorPillarLabel",
    displayName: "Pillar label color",
    value: { value: "#000000" }
  });
  // 1.1.15.0: toggle defaults to TRUE + colour defaults to "" (empty).
  // The renderer short-circuits when the colour is empty, so the user sees
  // no background by default — but picking ANY colour shows it immediately,
  // no toggle ceremony required. The toggle stays for the rare "explicitly
  // disable even though I picked a colour" case.
  labelBgShow = makeLabelBgShow();
  labelBgColor = makeFxColorPicker({
    name: "labelBgColor",
    displayName: "Label background color",
    value: { value: "" }
  });
  labelBgTransparency = makeLabelBgTransparency();
  font = makeFontControl(14, true);
  // IBCS scenario fill (AC solid, BU/PL outlined, FC hatched) — global
  // default "solid" keeps the historical rendering; per-pillar overrides
  // live in the dynamic cat_N / measure_N groups (slice name "fillStyle").
  pillarFillStyle = new formattingSettings.ItemDropdown({
    name: "pillarFillStyle",
    displayName: "Fill style",
    items: [
      { value: "solid", displayName: "Solid" },
      { value: "outlined", displayName: "Outlined" },
      { value: "hatched", displayName: "Hatched" }
    ],
    value: { value: "solid", displayName: "Solid" }
  });
  // Configurable outline (pane sub-group "Outline" — split in paneLayout).
  // outlineShow forces a contour on solid / hatched pillars; the colour /
  // width / dash knobs ALSO drive the "outlined" fill style's stroke (so
  // they stay editable when the toggle is off — inheritDisabled: false in
  // the pane spec). Empty colour = the pillar's own colour.
  outlineShow = new formattingSettings.ToggleSwitch({
    name: "outlineShow",
    displayName: "Show outline",
    value: false
  });
  outlineColor = new formattingSettings.ColorPicker({
    name: "outlineColor",
    displayName: "Outline color",
    value: { value: "" }
  });
  outlineWidth = new formattingSettings.NumUpDown({
    name: "outlineWidth",
    displayName: "Outline width (px)",
    value: 1,
    options: {
      minValue: { type: 0, value: 0.5 },
      maxValue: { type: 1, value: 4 }
    }
  });
  outlineStyle = new formattingSettings.ItemDropdown({
    name: "outlineStyle",
    displayName: "Outline style",
    items: [
      { value: "solid", displayName: "Solid" },
      { value: "dashed", displayName: "Dashed" }
    ],
    value: { value: "solid", displayName: "Solid" }
  });
  name: string = "pillars";
  displayName: string = "Pillars";
  displayNameKey: string = "Visual_Pillars";

  // Same CompositeCard pattern as Bridges. Per-category sub-blocks are
  // still appended dynamically in getFormattingModel — but now ONLY for
  // the structural `isPillar` toggle (marking a category as pillar vs
  // bridge). Per-category colour overrides are gone; all pillar colour
  // variation flows through the three fx-enabled global slices above.
  generalGroup: formattingSettings.Group = new formattingSettings.Group({
    name: "pillarsGeneral",
    displayName: "General",
    slices: [
      this.showDataLabels,
      this.displayUnits,
      this.decimalPlaces,
      this.pillarColor,
      this.pillarFillStyle,
      this.outlineShow,
      this.outlineColor,
      this.outlineWidth,
      this.outlineStyle,
      this.colorPillarLabel,
      this.labelBgShow,
      this.labelBgColor,
      this.labelBgTransparency,
      this.font
    ]
  });
  groups: formattingSettings.Group[] = [this.generalGroup];
}

// ============ RAILS (variance, global) ============
// Variance card — composite container. The "General" group holds the rail
// layout / label / font slices (object name: "rails"); per-measure sub-groups
// holding `colorPos`, `colorNeg`, `colorTextPos/Neg`, `colorName`, `name`,
// `displayUnits`, `decimalPlaces` (object name: "varianceMeasure") are appended
// dynamically in getFormattingModel() — one per active variance measure.
// Field stays `rails` on VisualFormattingSettingsModel to preserve the existing
// `metadata.objects.rails.*` persistence path; only the displayed card name
// changed from "Variance rails" to "Variance" in 1.1.8.0.
class VarianceCardSettings extends formattingSettings.CompositeCard {
  showDataLabels = new formattingSettings.ToggleSwitch({
    name: "showDataLabels",
    displayName: "Show data labels",
    value: true
  });
  // Rails block placement relative to the chart. "top" is the historical
  // behaviour (rails above the chart) and MUST stay the default so saved
  // reports are unchanged. "bottom" stacks chart → rails → analysis table.
  position = new formattingSettings.ItemDropdown({
    name: "position",
    displayName: "Position",
    items: [
      { value: "top", displayName: "Top" },
      { value: "bottom", displayName: "Bottom" }
    ],
    value: { value: "top", displayName: "Top" }
  });
  // Rail visualization style (IBCS-inspired). "bars" is the historical
  // histogram and MUST stay the default. "pin" = IBCS pin/lollipop (thin
  // stem + round head, same baseline/normalization as bars). "labels" =
  // signed value only with a ▲/▼ marker, no geometry. "chips" = value on a
  // rounded sign-coloured pill. "auto" routes per rail by the measure's
  // model format (% → pin, absolute → bars — the IBCS pairing).
  // "outlined" / "hatched" = bar geometry with a scenario fill (contour
  // only / 45° hatch). Global dropdown; per-measure overrides live in the
  // dynamic varianceMeasure groups.
  railStyle = new formattingSettings.ItemDropdown({
    name: "railStyle",
    displayName: "Style",
    items: [
      { value: "bars", displayName: "Bars (classic)" },
      { value: "pin", displayName: "Pin (IBCS)" },
      { value: "labels", displayName: "Labels only" },
      { value: "chips", displayName: "Chips" },
      { value: "outlined", displayName: "Outlined bars" },
      { value: "hatched", displayName: "Hatched bars" },
      { value: "auto", displayName: "Auto (by format)" }
    ],
    value: { value: "bars", displayName: "Bars (classic)" }
  });
  // Neutrality threshold (transverse — applies to every style): |value|
  // under this % of the rail's max |value| renders in neutral grey instead
  // of the pos/neg sentiment colours. 0 = off (default, zero regression).
  neutralThresholdPct = new formattingSettings.NumUpDown({
    name: "neutralThresholdPct",
    displayName: "Neutral threshold (% of max)",
    value: 0,
    options: {
      minValue: { type: 0, value: 0 },
      maxValue: { type: 1, value: 20 }
    }
  });
  railHeight = new formattingSettings.NumUpDown({
    name: "railHeight",
    displayName: "Rail height (px)",
    value: 70,
    options: {
      minValue: { type: 0, value: 40 },
      maxValue: { type: 1, value: 140 }
    }
  });
  gapRails = new formattingSettings.NumUpDown({
    name: "gapRails",
    displayName: "Gap between rails (px)",
    value: 12,
    options: {
      minValue: { type: 0, value: 0 },
      maxValue: { type: 1, value: 50 }
    }
  });
  gapGauge = new formattingSettings.NumUpDown({
    name: "gapGauge",
    displayName: "Gap rails ↔ chart (px)",
    value: 20,
    options: {
      minValue: { type: 0, value: 0 },
      maxValue: { type: 1, value: 100 }
    }
  });
  // 1.1.15.0: see Bridges card for default rationale (toggle TRUE + empty
  // colour, renderer short-circuits on empty).
  labelBgShow = makeLabelBgShow();
  labelBgColor = new formattingSettings.ColorPicker({
    name: "labelBgColor",
    displayName: "Background color",
    value: { value: "" }
  });
  labelBgTransparency = makeLabelBgTransparency();
  font = makeFontControl(12, false);
  name: string = "rails";
  displayName: string = "Variance";
  displayNameKey: string = "Visual_Rails";
  generalGroup: formattingSettings.Group = new formattingSettings.Group({
    name: "railsGeneral",
    displayName: "General",
    slices: [
      this.showDataLabels,
      this.position,
      this.railStyle,
      this.neutralThresholdPct,
      this.railHeight,
      this.gapRails,
      this.gapGauge,
      this.labelBgShow,
      this.labelBgColor,
      this.labelBgTransparency,
      this.font
    ]
  });
  groups: formattingSettings.Group[] = [this.generalGroup];
}

// ============ VARIANCE — PER MEASURE ============
// Host card for the dynamically-built per-measure colour groups. Its `name`
// MUST be "varianceMeasure" (matching the capabilities object the renderer
// reads from: `values[i].source.objects.varianceMeasure.*`). Pushing these
// groups into the "rails" card instead (card.name="rails") made PBI try to
// persist colorPos/etc. under the "rails" object — which has no such property —
// so the picks were silently dropped and the rails stayed on the theme
// defaults. getFormattingModel fills `groups` per render.
class VarianceMeasureCardSettings extends formattingSettings.CompositeCard {
  name: string = "varianceMeasure";
  displayName: string = "Variance — per measure";
  groups: formattingSettings.Group[] = [];
}

// ============ CONNECTORS ============
class ConnectorsCardSettings extends FormattingSettingsCard {
  // Off by default — Bloomberg-style connectors are a power-user
  // accent that often adds visual noise on dashboards with many bars.
  // Toggle ON when needed.
  showConnectors = new formattingSettings.ToggleSwitch({
    name: "showConnectors",
    displayName: "Show connectors",
    value: false
  });
  connectorColor = new formattingSettings.ColorPicker({
    name: "connectorColor",
    displayName: "Color",
    value: { value: "#666666" }
  });
  connectorWidth = new formattingSettings.NumUpDown({
    name: "connectorWidth",
    displayName: "Width (px)",
    value: 1,
    options: {
      minValue: { type: 0, value: 1 },
      maxValue: { type: 1, value: 10 }
    }
  });
  connectorDash = new formattingSettings.ItemDropdown({
    name: "connectorDash",
    displayName: "Style",
    items: [
      { value: "3 3", displayName: "Fine dotted" },
      { value: "5 4", displayName: "Medium dashed" },
      { value: "8 4", displayName: "Long dashed" },
      { value: "1 2", displayName: "Ghost line" },
      { value: "none", displayName: "Solid" }
    ],
    value: { value: "5 4", displayName: "Medium dashed" }
  });
  name: string = "connectors";
  displayName: string = "Connectors";
  displayNameKey: string = "Visual_Connectors";
  slices: FormattingSettingsSlice[] = [
    this.showConnectors,
    this.connectorColor,
    this.connectorWidth,
    this.connectorDash
  ];
}

// ============ LAYOUT ============
class LayoutCardSettings extends FormattingSettingsCard {
  barWidth = new formattingSettings.NumUpDown({
    name: "barWidth",
    displayName: "Bar width (px)",
    value: 55,
    options: {
      minValue: { type: 0, value: 5 },
      maxValue: { type: 1, value: 300 }
    }
  });
  name: string = "layout";
  displayName: string = "Layout";
  displayNameKey: string = "Visual_Layout";
  slices: FormattingSettingsSlice[] = [this.barWidth];
}

// ============ TABLE ============
// Renders an Excel-like footnote table below the waterfall when the
// optional "Table" data role (analysisDim) is bound. Each row is one
// unique value of the dim; cells are aligned with the bar centres
// above; there are no column headers (the X-axis labels act as them).
// Compatible with Power BI field parameters.
class AnalysisTableCardSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({
    name: "show",
    displayName: "Show",
    value: true
  });
  font = makeFontControl(11, false);
  // Two value-colour categories (1.1.73): pillar-column cells wear a single
  // colour; bridge-column cells are sign-aware — positive deltas use one
  // colour, negative deltas another (mirrors the Variance rails colorPos /
  // colorNeg). Empty bridge pickers fall back to the theme positive / negative
  // at render. Pillar columns = layout type "pillar" (incl. the synth Grand
  // Total); bridge columns = the intermediates. HC overrides all three.
  pillarValuesColor = new formattingSettings.ColorPicker({
    name: "pillarValuesColor",
    displayName: "Pillar values color",
    value: { value: "#333333" }
  });
  bridgeValuesPositiveColor = new formattingSettings.ColorPicker({
    name: "bridgeValuesPositiveColor",
    displayName: "Bridge positive color",
    value: { value: "" }
  });
  bridgeValuesNegativeColor = new formattingSettings.ColorPicker({
    name: "bridgeValuesNegativeColor",
    displayName: "Bridge negative color",
    value: { value: "" }
  });
  rowLabelColor = new formattingSettings.ColorPicker({
    name: "rowLabelColor",
    displayName: "Row label color",
    value: { value: "#666666" }
  });
  rowLabelBold = new formattingSettings.ToggleSwitch({
    name: "rowLabelBold",
    displayName: "Row label bold",
    value: false
  });
  // Full font control for row labels (1.1.64) — same UX as every other text
  // area. `bold` REUSES the legacy `rowLabelBold` slice (and property name)
  // so bolds persisted before this control existed keep applying; the slice
  // therefore lives INSIDE the control, not in the card's slices list.
  rowLabelFont = new formattingSettings.FontControl({
    name: "rowLabelFont",
    displayName: "Row label font",
    fontFamily: new formattingSettings.FontPicker({
      name: "rowLabelFontFamily",
      displayName: "Row label font family",
      // Safety fallback; runtime applyThemeFont sets the theme font (see makeFontControl).
      value: "Segoe UI"
    }),
    fontSize: new formattingSettings.NumUpDown({
      name: "rowLabelFontSize",
      displayName: "Row label text size",
      value: 11,
      options: {
        minValue: { type: 0, value: 6 },
        maxValue: { type: 1, value: 60 }
      }
    }),
    bold: this.rowLabelBold,
    italic: new formattingSettings.ToggleSwitch({
      name: "rowLabelItalic",
      displayName: "Row label italic",
      value: false
    }),
    underline: new formattingSettings.ToggleSwitch({
      name: "rowLabelUnderline",
      displayName: "Row label underline",
      value: false
    })
  });
  separatorStyle = new formattingSettings.ItemDropdown({
    name: "separatorStyle",
    displayName: "Row separator",
    items: [
      { value: "none", displayName: "None" },
      { value: "solid", displayName: "Solid" },
      { value: "dashed", displayName: "Dashed" },
      { value: "dotted", displayName: "Dotted" }
    ],
    value: { value: "solid", displayName: "Solid" }
  });
  separatorColor = new formattingSettings.ColorPicker({
    name: "separatorColor",
    displayName: "Separator color",
    value: { value: "#e6e6e6" }
  });
  displayUnits = makeDisplayUnitsDropdown("Auto (Y axis)");
  decimalPlaces = makeDecimalPlaces();
  // Hard cap on how much of the visual the table can take. Beyond this,
  // we either compress row height or truncate (handled by renderer).
  maxHeightPct = new formattingSettings.NumUpDown({
    name: "maxHeightPct",
    displayName: "Max height (% of visual)",
    value: 30,
    options: {
      minValue: { type: 0, value: 10 },
      maxValue: { type: 1, value: 60 }
    }
  });
  // Explicit table sizing (0 = Auto = the historical automatic width, to the
  // pixel). Two slices rather than one re-interpreted per orientation: they
  // are NOT the same quantity. `columnWidth` is multiplied by the number of
  // analysisDim members (N columns side by side), `rowHeaderWidth` is a
  // single left margin — one value would give wildly different footprints in
  // the two orientations, unlike the `railHeight` precedent where one rail
  // stays one rail. Each is only shown in the orientation it governs.
  //
  // An explicit value BEATS the automatic caps (34 % of the width /
  // `maxHeightPct` share): those caps are exactly what makes the columns too
  // narrow, so re-applying them would leave the slice inert. The renderer
  // still refuses to starve the plot area (see src/tableGeometry.ts).
  columnWidth = new formattingSettings.NumUpDown({
    name: "columnWidth",
    displayName: "Column width (px, 0 = auto)",
    value: 0,
    options: {
      minValue: { type: 0, value: 0 },
      maxValue: { type: 1, value: 400 }
    }
  });
  rowHeaderWidth = new formattingSettings.NumUpDown({
    name: "rowHeaderWidth",
    displayName: "Row header width (px, 0 = auto)",
    value: 0,
    options: {
      minValue: { type: 0, value: 0 },
      maxValue: { type: 1, value: 600 }
    }
  });
  // Header wrapping. A COUNT rather than a toggle: 1 is the historical single
  // ellipsised line to the pixel, and the number doubles as the bound on the
  // vertical header reservation — without it a pathological label could eat
  // an unbounded share of the plot area. Applies to both orientations (the
  // column headers in vertical, the row headers in horizontal); horizontal
  // additionally caps itself at what the row height can physically hold.
  headerLines = new formattingSettings.NumUpDown({
    name: "headerLines",
    displayName: "Header lines (1 = no wrap)",
    value: 1,
    options: {
      minValue: { type: 0, value: 1 },
      maxValue: { type: 1, value: 4 }
    }
  });
  name: string = "analysisTable";
  displayName: string = "Table";
  displayNameKey: string = "Visual_AnalysisTable";
  slices: FormattingSettingsSlice[] = [
    this.show,
    this.font,
    this.pillarValuesColor,
    this.bridgeValuesPositiveColor,
    this.bridgeValuesNegativeColor,
    this.rowLabelColor,
    // rowLabelBold rides inside rowLabelFont (legacy property name kept).
    this.rowLabelFont,
    this.separatorStyle,
    this.separatorColor,
    this.displayUnits,
    this.decimalPlaces,
    this.maxHeightPct,
    this.columnWidth,
    this.rowHeaderWidth,
    this.headerLines
  ];
}

// ============ LEGEND ============
// Legend card — a CompositeCard with a static "Options" group (show /
// position / title / font / label colour) and dynamic per-legend-value
// sub-blocks appended in getFormattingModel (one ColorPicker each, with
// the same fx descriptors as bridges/pillars). Active iff the user has
// dropped a column into the "Legend" data role bucket; otherwise the
// card stays open with only the global options.
class LegendCardSettings extends formattingSettings.CompositeCard {
  show = new formattingSettings.ToggleSwitch({
    name: "show",
    displayName: "Show",
    value: true
  });
  position = new formattingSettings.ItemDropdown({
    name: "position",
    displayName: "Position",
    items: [
      { value: "Top", displayName: "Top" },
      { value: "Bottom", displayName: "Bottom" },
      { value: "Left", displayName: "Left" },
      { value: "Right", displayName: "Right" },
      { value: "TopCenter", displayName: "Top centered" },
      { value: "BottomCenter", displayName: "Bottom centered" }
    ],
    value: { value: "Top", displayName: "Top" }
  });
  // Legend scope (1.1.65): which bar types the legend's stacked colouring
  // applies to. Excluded bars fall back to their Pillars/Bridges card
  // colour (that picker stays visible in the pane).
  applyTo = new formattingSettings.ItemDropdown({
    name: "applyTo",
    displayName: "Apply to",
    items: [
      { value: "both", displayName: "Pillars and bridges" },
      { value: "pillars", displayName: "Pillars only" },
      { value: "bridges", displayName: "Bridges only" }
    ],
    value: { value: "both", displayName: "Pillars and bridges" }
  });
  // Grand Total legend stacking (1.1.69) — INDEPENDENT of `applyTo` so the
  // synthetic total can be coloured by legend (or kept flat) regardless of
  // how the real pillars/bridges are scoped. Default ON.
  applyToGrandTotal = new formattingSettings.ToggleSwitch({
    name: "applyToGrandTotal",
    displayName: "Apply to grand total",
    value: true
  });
  showTitle = new formattingSettings.ToggleSwitch({
    name: "showTitle",
    displayName: "Show title",
    value: true
  });
  titleText = new formattingSettings.TextInput({
    name: "titleText",
    displayName: "Title text",
    placeholder: "(uses legend column name by default)",
    value: ""
  });
  titleColor = new formattingSettings.ColorPicker({
    name: "titleColor",
    displayName: "Title color",
    value: { value: "#000000" }
  });
  titleFont = makeTitleFontControl(12, true);
  labelColor = new formattingSettings.ColorPicker({
    name: "labelColor",
    displayName: "Label color",
    value: { value: "#666666" }
  });
  font = makeFontControl(11, false);
  // When ON, each stacked segment inside a pillar/bridge gets its own
  // value label — drawn centred inside the segment, formatted with the
  // matching card's display-units / decimals. Off by default to avoid
  // clutter on heavily-stacked bars. Per-value overrides live in each
  // legend value's sub-block; this is the master kill switch + global
  // defaults.
  showSegmentLabels = new formattingSettings.ToggleSwitch({
    name: "showSegmentLabels",
    displayName: "Show segment labels on bars",
    value: false
  });
  // Full font control for the legend labels (1.1.72) — typo / size / bold /
  // italic / underline, same UX as every other text area. Distinct property
  // names so it doesn't collide with the strip `font` / `titleFont`.
  segmentLabelFont = new formattingSettings.FontControl({
    name: "segmentLabelFont",
    displayName: "Font",
    fontFamily: new formattingSettings.FontPicker({
      name: "segmentLabelFontFamily",
      displayName: "Font family",
      // Safety fallback; runtime applyThemeFont sets the theme font.
      value: "Segoe UI"
    }),
    fontSize: new formattingSettings.NumUpDown({
      name: "segmentLabelFontSize",
      displayName: "Text size",
      value: 10,
      options: {
        minValue: { type: 0, value: 6 },
        maxValue: { type: 1, value: 60 }
      }
    }),
    bold: new formattingSettings.ToggleSwitch({
      name: "segmentLabelBold",
      displayName: "Bold",
      value: false
    }),
    italic: new formattingSettings.ToggleSwitch({
      name: "segmentLabelItalic",
      displayName: "Italic",
      value: false
    }),
    underline: new formattingSettings.ToggleSwitch({
      name: "segmentLabelUnderline",
      displayName: "Underline",
      value: false
    })
  });
  segmentLabelColor = makeFxColorPicker({
    name: "segmentLabelColor",
    displayName: "Label color",
    value: { value: "#ffffff" }
  });
  // 1.1.15.0: see Bridges card — toggle TRUE + empty colour default; the
  // renderer short-circuits when the colour is empty.
  segmentLabelBgShow = new formattingSettings.ToggleSwitch({
    name: "segmentLabelBgShow",
    displayName: "Label background",
    value: true
  });
  segmentLabelBgColor = makeFxColorPicker({
    name: "segmentLabelBgColor",
    displayName: "Segment label background color",
    value: { value: "" }
  });
  // 1.1.14.0: matches the transparency slider on every other label-background
  // option (pillars / bridges / variance / arc). Replaces the previously
  // hardcoded `bgTransparency: 0` in svgLabelBg() calls for segment labels.
  segmentLabelBgTransparency = new formattingSettings.NumUpDown({
    name: "segmentLabelBgTransparency",
    displayName: "Segment label background transparency (%)",
    value: 0,
    options: {
      minValue: { type: 0, value: 0 },
      maxValue: { type: 1, value: 100 }
    }
  });
  name: string = "legend";
  displayName: string = "Legend";
  displayNameKey: string = "Visual_Legend";

  generalGroup: formattingSettings.Group = new formattingSettings.Group({
    name: "legendGeneral",
    displayName: "Options",
    slices: [
      this.show,
      this.position,
      this.applyTo,
      this.applyToGrandTotal,
      this.showTitle,
      this.titleText,
      this.titleColor,
      this.titleFont,
      this.labelColor,
      this.font,
      this.showSegmentLabels,
      this.segmentLabelFont,
      this.segmentLabelColor,
      this.segmentLabelBgShow,
      this.segmentLabelBgColor,
      this.segmentLabelBgTransparency
    ]
  });
  groups: formattingSettings.Group[] = [this.generalGroup];
}

// ============ VARIATION ARCS ============
// Brackets drawn between consecutive pillars showing the variation
// between them. A single GLOBAL "Label contents" dropdown drives every
// arc's label (donut-style):
//   - Auto Δ percentage  : (pillar[k+1] − pillar[k]) / pillar[k]
//   - Auto Δ absolute    : pillar[k+1] − pillar[k]
//   - Both, separated by " | "
// Line + label styles mirror the Connectors card: dash, opacity,
// width, plus fx-enabled colours and an optional label background.

class VariationArcCardSettings extends formattingSettings.CompositeCard {
  show = new formattingSettings.ToggleSwitch({
    name: "show",
    displayName: "Show",
    value: false
  });
  // Master "Label contents" dropdown — sets the default for every arc.
  // Modeled after the native Donut chart's "Detail labels > Label
  // contents" dropdown. Default = "Data value, percentage" so the
  // out-of-box label shows both pieces of information separated by " | "
  // (mirroring Donut's "All detail labels" choice).
  defaultSource = new formattingSettings.ItemDropdown({
    name: "defaultSource",
    displayName: "Label contents",
    items: [
      { value: "auto-abs", displayName: "Data value" },
      { value: "auto-pct", displayName: "Percentage" },
      { value: "auto-both", displayName: "Data value, percentage" }
    ],
    value: { value: "auto-both", displayName: "Data value, percentage" }
  });
  displayUnits = makeDisplayUnitsDropdown();
  decimalPlaces = makeDecimalPlaces();
  lineColor = new formattingSettings.ColorPicker({
    name: "lineColor",
    displayName: "Line color",
    value: { value: "#000000" }
  });
  lineWidth = new formattingSettings.NumUpDown({
    name: "lineWidth",
    displayName: "Line width (px)",
    value: 1,
    options: {
      minValue: { type: 0, value: 1 },
      maxValue: { type: 1, value: 6 }
    }
  });
  lineDash = new formattingSettings.ItemDropdown({
    name: "lineDash",
    displayName: "Line style",
    items: [
      { value: "solid", displayName: "Solid" },
      { value: "3 3", displayName: "Fine dotted" },
      { value: "5 4", displayName: "Medium dashed" },
      { value: "8 4", displayName: "Long dashed" },
      { value: "1 2", displayName: "Ghost line" }
    ],
    value: { value: "solid", displayName: "Solid" }
  });
  lineOpacity = new formattingSettings.NumUpDown({
    name: "lineOpacity",
    displayName: "Line opacity (%)",
    value: 100,
    options: {
      minValue: { type: 0, value: 0 },
      maxValue: { type: 1, value: 100 }
    }
  });
  arrowSize = new formattingSettings.NumUpDown({
    name: "arrowSize",
    displayName: "Arrow size (px)",
    value: 6,
    options: {
      minValue: { type: 0, value: 0 },
      maxValue: { type: 1, value: 14 }
    }
  });
  // Which bracket end(s) carry the downward arrow head. "both" (default)
  // keeps the historical symmetric look; "start"/"end" turn the bracket
  // into a directional pointer onto the departure / arrival pillar only
  // (the arrow-less drop line then runs all the way to its anchor).
  arrowEnds = new formattingSettings.ItemDropdown({
    name: "arrowEnds",
    displayName: "Arrow ends",
    items: [
      { value: "both", displayName: "Both pillars" },
      { value: "start", displayName: "Start pillar only" },
      { value: "end", displayName: "End pillar only" }
    ],
    value: { value: "both", displayName: "Both pillars" }
  });
  labelColor = makeFxColorPicker({
    name: "labelColor",
    displayName: "Label color",
    value: { value: "#000000" }
  });
  // 1.1.15.0: toggle defaults to TRUE + colour defaults to "" (empty).
  // The renderer short-circuits when the colour is empty, so the user sees
  // no background by default — but picking ANY colour shows it immediately,
  // no toggle ceremony required. The toggle stays for the rare "explicitly
  // disable even though I picked a colour" case.
  labelBgShow = makeLabelBgShow();
  labelBgColor = makeFxColorPicker({
    name: "labelBgColor",
    displayName: "Label background color",
    value: { value: "" }
  });
  labelBgTransparency = makeLabelBgTransparency("Background transparency (%)");
  font = makeFontControl(12, false);
  name: string = "variationArc";
  displayName: string = "Variation arc";
  displayNameKey: string = "Visual_VariationArc";
  description: string =
    "Brackets between consecutive pillars showing variation. Mirrors the native Donut chart's 'Detail labels' UX. 'Label' sets the Label contents (Data value, Percentage, or both separated by ' | ') and its styling; 'Line' styles the bracket itself. The same Label contents choice drives every arc.";

  // Static group carrying every global styling slice (paneLayout.ts
  // re-splits it into the 'Label' / 'Line' display groups); every arc's
  // label is driven by the global Label contents dropdown.
  generalGroup: formattingSettings.Group = new formattingSettings.Group({
    name: "variationArcGeneral",
    displayName: "Options",
    slices: [
      this.show,
      this.defaultSource,
      this.displayUnits,
      this.decimalPlaces,
      this.lineColor,
      this.lineWidth,
      this.lineDash,
      this.lineOpacity,
      this.arrowSize,
      this.arrowEnds,
      this.labelColor,
      this.labelBgShow,
      this.labelBgColor,
      this.labelBgTransparency,
      this.font
    ]
  });
  groups: formattingSettings.Group[] = [this.generalGroup];
}

// ============ ROOT MODEL ============
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
  general = new GeneralCardSettings();
  grandTotal = new GrandTotalCardSettings();
  xAxis = new XAxisCardSettings();
  yAxis = new YAxisCardSettings();
  bridges = new BridgesCardSettings();
  pillars = new PillarsCardSettings();
  rails = new VarianceCardSettings();
  connectors = new ConnectorsCardSettings();
  layout = new LayoutCardSettings();
  analysisTable = new AnalysisTableCardSettings();
  legend = new LegendCardSettings();
  variationArc = new VariationArcCardSettings();
  // Per-measure variance card — NOT in the static `cards` list; getFormattingModel
  // injects it (with fresh per-measure groups) after stripping any stale copy.
  varianceMeasure = new VarianceMeasureCardSettings();
  cards: formattingSettings.Cards[] = [
    this.general,
    this.grandTotal,
    this.xAxis,
    this.yAxis,
    this.bridges,
    this.pillars,
    this.rails,
    this.connectors,
    this.layout,
    this.analysisTable,
    this.legend,
    this.variationArc
  ];
}
