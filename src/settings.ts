"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

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


export const DISPLAY_UNIT_VALUES = ["auto", "none", "thousands", "millions", "billions"] as const;

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

function makeFontControl(defaultSize: number, defaultBold: boolean): formattingSettings.FontControl {
  return new formattingSettings.FontControl({
    name: "font",
    displayName: "Font",
    fontFamily: new formattingSettings.FontPicker({
      name: "fontFamily",
      displayName: "Font family",
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

function makeTitleFontControl(defaultSize: number, defaultBold: boolean): formattingSettings.FontControl {
  return new formattingSettings.FontControl({
    name: "titleFont",
    displayName: "Title font",
    fontFamily: new formattingSettings.FontPicker({
      name: "titleFontFamily",
      displayName: "Title font family",
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
    this.showItemsWithNoData
  ];
}

class GrandTotalCardSettings extends FormattingSettingsCard {
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
  grandTotalColor = new formattingSettings.ColorPicker({
    name: "grandTotalColor",
    displayName: "Grand total color",
    value: { value: "" }
  });
  grandTotalLabelColor = new formattingSettings.ColorPicker({
    name: "grandTotalLabelColor",
    displayName: "Label color",
    value: { value: "#000000" }
  });
  labelBgShow = makeLabelBgShow();
  labelBgColor = new formattingSettings.ColorPicker({
    name: "labelBgColor",
    displayName: "Label background color",
    value: { value: "" }
  });
  labelBgTransparency = makeLabelBgTransparency();
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

class YAxisCardSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({
    name: "show",
    displayName: "Show",
    value: true
  });
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

class BridgesCardSettings extends formattingSettings.CompositeCard {
  showDataLabels = new formattingSettings.ToggleSwitch({
    name: "showDataLabels",
    displayName: "Show data labels",
    value: true
  });
  displayUnits = makeDisplayUnitsDropdown("Auto (Y axis)");
  decimalPlaces = makeDecimalPlaces();
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

class PillarsCardSettings extends formattingSettings.CompositeCard {
  showDataLabels = new formattingSettings.ToggleSwitch({
    name: "showDataLabels",
    displayName: "Show data labels",
    value: true
  });
  displayUnits = makeDisplayUnitsDropdown("Auto (Y axis)");
  decimalPlaces = makeDecimalPlaces();
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
  labelBgShow = makeLabelBgShow();
  labelBgColor = makeFxColorPicker({
    name: "labelBgColor",
    displayName: "Label background color",
    value: { value: "" }
  });
  labelBgTransparency = makeLabelBgTransparency();
  font = makeFontControl(14, true);
  name: string = "pillars";
  displayName: string = "Pillars";
  displayNameKey: string = "Visual_Pillars";

  generalGroup: formattingSettings.Group = new formattingSettings.Group({
    name: "pillarsGeneral",
    displayName: "General",
    slices: [
      this.showDataLabels,
      this.displayUnits,
      this.decimalPlaces,
      this.pillarColor,
      this.colorPillarLabel,
      this.labelBgShow,
      this.labelBgColor,
      this.labelBgTransparency,
      this.font
    ]
  });
  groups: formattingSettings.Group[] = [this.generalGroup];
}

class VarianceCardSettings extends formattingSettings.CompositeCard {
  showDataLabels = new formattingSettings.ToggleSwitch({
    name: "showDataLabels",
    displayName: "Show data labels",
    value: true
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

class VarianceMeasureCardSettings extends formattingSettings.CompositeCard {
  name: string = "varianceMeasure";
  displayName: string = "Variance — per measure";
  groups: formattingSettings.Group[] = [];
}

class ConnectorsCardSettings extends FormattingSettingsCard {
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

class AnalysisTableCardSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({
    name: "show",
    displayName: "Show",
    value: true
  });
  font = makeFontControl(11, false);
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
  rowLabelFont = new formattingSettings.FontControl({
    name: "rowLabelFont",
    displayName: "Row label font",
    fontFamily: new formattingSettings.FontPicker({
      name: "rowLabelFontFamily",
      displayName: "Row label font family",
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
  maxHeightPct = new formattingSettings.NumUpDown({
    name: "maxHeightPct",
    displayName: "Max height (% of visual)",
    value: 30,
    options: {
      minValue: { type: 0, value: 10 },
      maxValue: { type: 1, value: 60 }
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
    this.rowLabelFont,
    this.separatorStyle,
    this.separatorColor,
    this.displayUnits,
    this.decimalPlaces,
    this.maxHeightPct
  ];
}

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
  showSegmentLabels = new formattingSettings.ToggleSwitch({
    name: "showSegmentLabels",
    displayName: "Show segment labels on bars",
    value: false
  });
  segmentLabelFont = new formattingSettings.FontControl({
    name: "segmentLabelFont",
    displayName: "Font",
    fontFamily: new formattingSettings.FontPicker({
      name: "segmentLabelFontFamily",
      displayName: "Font family",
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


class VariationArcCardSettings extends formattingSettings.CompositeCard {
  show = new formattingSettings.ToggleSwitch({
    name: "show",
    displayName: "Show",
    value: false
  });
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
