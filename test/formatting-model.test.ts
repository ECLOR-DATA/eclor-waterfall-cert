// Validates the format pane structure end-to-end: instantiate the model,
// populate slice values from a fake dataView, and assert the slices we read
// in getFormattingModel actually carry the expected values. Catches the
// 1.0.46 CompositeCard regression early — before shipping to PBI.

import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel } from "../src/settings";

function makeDV(objects: Record<string, Record<string, unknown>> | undefined): unknown {
  return { metadata: { objects, columns: [] }, categorical: undefined };
}

describe("VisualFormattingSettingsModel — populate / read cycle", () => {
  const svc = new FormattingSettingsService();

  test("Bridges defaults: empty dataView ⇒ three fx-enabled colour slices at constructor defaults", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = svc.populateFormattingSettingsModel(VisualFormattingSettingsModel, makeDV(undefined) as any);
    expect(model.bridges.colorBridge.value.value).toBe("#50be87");
    expect(model.bridges.colorBridgeLabel.value.value).toBe("#50be87");
    // 1.1.15.0: empty default — see Pillars labelBgColor test below for the
    // rationale.
    expect(model.bridges.labelBgColor.value.value).toBe("");
    // Each colour slice carries the fx (ConstantOrRule) descriptor — without
    // it PBI would never expose the fx button next to the picker.
    // 3 = VisualEnumerationInstanceKinds.ConstantOrRule (Constant=1, Rule=2).
    expect(model.bridges.colorBridge.instanceKind).toBe(3);
    expect(model.bridges.colorBridgeLabel.instanceKind).toBe(3);
    expect(model.bridges.labelBgColor.instanceKind).toBe(3);
    // The wildcard selector is what attaches a conditional rule to every
    // categorical instance — required alongside instanceKind for fx UX.
    expect(model.bridges.colorBridge.selector).toBeDefined();
    expect(model.bridges.colorBridgeLabel.selector).toBeDefined();
    expect(model.bridges.labelBgColor.selector).toBeDefined();
  });

  test("Bridges populated: user picks the three colour slices ⇒ values reflected", () => {
    const dv = makeDV({
      bridges: {
        colorBridge: { solid: { color: "#001122" } },
        colorBridgeLabel: { solid: { color: "#334455" } },
        labelBgColor: { solid: { color: "#aabbcc" } }
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = svc.populateFormattingSettingsModel(VisualFormattingSettingsModel, dv as any);
    expect(model.bridges.colorBridge.value.value).toBe("#001122");
    expect(model.bridges.colorBridgeLabel.value.value).toBe("#334455");
    expect(model.bridges.labelBgColor.value.value).toBe("#aabbcc");
  });

  test("Pillars defaults: three fx-enabled colour slices at constructor defaults", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = svc.populateFormattingSettingsModel(VisualFormattingSettingsModel, makeDV(undefined) as any);
    expect(model.pillars.pillarColor.value.value).toBe("");
    expect(model.pillars.colorPillarLabel.value.value).toBe("#000000");
    // 1.1.15.0: empty default so the renderer's "no bg unless user picks a
    // colour" semantics work without a toggle ceremony. See settings.ts.
    expect(model.pillars.labelBgColor.value.value).toBe("");
    // Each colour slice carries the fx descriptor (3 = ConstantOrRule).
    expect(model.pillars.pillarColor.instanceKind).toBe(3);
    expect(model.pillars.colorPillarLabel.instanceKind).toBe(3);
    expect(model.pillars.labelBgColor.instanceKind).toBe(3);
    expect(model.pillars.pillarColor.selector).toBeDefined();
  });

  test("Pillars populated: three colour slices set ⇒ values reflected", () => {
    const dv = makeDV({
      pillars: {
        pillarColor: { solid: { color: "#abcdef" } },
        colorPillarLabel: { solid: { color: "#112233" } },
        labelBgColor: { solid: { color: "#ddeeff" } }
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = svc.populateFormattingSettingsModel(VisualFormattingSettingsModel, dv as any);
    expect(model.pillars.pillarColor.value.value).toBe("#abcdef");
    expect(model.pillars.colorPillarLabel.value.value).toBe("#112233");
    expect(model.pillars.labelBgColor.value.value).toBe("#ddeeff");
  });

  test("Grand total: grandTotalColor default empty, populated correctly", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const empty = svc.populateFormattingSettingsModel(VisualFormattingSettingsModel, makeDV(undefined) as any);
    expect(empty.grandTotal.grandTotalColor.value.value).toBe("");

    const dv = makeDV({
      grandTotal: { grandTotalColor: { solid: { color: "#ff00ff" } } }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = svc.populateFormattingSettingsModel(VisualFormattingSettingsModel, dv as any);
    expect(model.grandTotal.grandTotalColor.value.value).toBe("#ff00ff");
  });

  test("populate creates a fresh model — no mutation leakage between calls", () => {
    const dv1 = makeDV({
      bridges: { colorBridge: { solid: { color: "#abc123" } } }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m1 = svc.populateFormattingSettingsModel(VisualFormattingSettingsModel, dv1 as any);
    expect(m1.bridges.colorBridge.value.value).toBe("#abc123");

    const dv2 = makeDV({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m2 = svc.populateFormattingSettingsModel(VisualFormattingSettingsModel, dv2 as any);
    // m2 is a fresh instance; slice should be at its constructor default
    expect(m2.bridges.colorBridge.value.value).toBe("#50be87");
    // m1 still holds its populated value (separate instance)
    expect(m1.bridges.colorBridge.value.value).toBe("#abc123");
  });

  test("buildFormattingModel emits all defined cards", () => {
    const dv = makeDV({
      bridges: {
        colorBridge: { solid: { color: "#abcabc" } }
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = svc.populateFormattingSettingsModel(VisualFormattingSettingsModel, dv as any);
    const fm = svc.buildFormattingModel(model);
    // 12 static cards (general, grandTotal, xAxis, yAxis, bridges, pillars,
    // rails, connectors, layout, analysisTable, legend, variationArc).
    // buildFormattingModel walks model.cards.
    expect(fm.cards.length).toBe(12);
    // Each card carries a uid suffixed with "-card" — find via type guard.
    const uids = fm.cards.map((c) => (c as unknown as { uid?: string }).uid).filter(Boolean);
    expect(uids).toContain("bridges-card");
    expect(uids).toContain("pillars-card");
    expect(uids).toContain("analysisTable-card");
  });

  test("Bridges CompositeCard exposes the three fx-enabled colour slices in its General sub-block", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = svc.populateFormattingSettingsModel(VisualFormattingSettingsModel, makeDV(undefined) as any);
    const fm = svc.buildFormattingModel(model);
    const bridgesCard = fm.cards.find(
      (c) => (c as unknown as { uid?: string }).uid === "bridges-card"
    ) as unknown as { groups: Array<{ uid?: string; slices?: Array<{ uid?: string }> }> };
    expect(bridgesCard).toBeDefined();
    const generalGroup = bridgesCard.groups.find((g) => g.uid === "bridgesGeneral-group");
    expect(generalGroup).toBeDefined();
    const sliceUids = (generalGroup?.slices || []).map((s) =>
      (s as unknown as { uid?: string }).uid
    );
    expect(sliceUids.some((u) => u && u.includes("colorBridge") && !u.includes("colorBridgeLabel"))).toBe(true);
    expect(sliceUids.some((u) => u && u.includes("colorBridgeLabel"))).toBe(true);
    expect(sliceUids.some((u) => u && u.includes("labelBgColor"))).toBe(true);
    // Sign-aware / individual-toggle slices removed in 1.0.53.
    expect(sliceUids.some((u) => u && u.includes("colorFav"))).toBe(false);
    expect(sliceUids.some((u) => u && u.includes("colorDefav"))).toBe(false);
    expect(sliceUids.some((u) => u && u.includes("showIndividualBars"))).toBe(false);
    expect(sliceUids.some((u) => u && u.includes("showIndividualLabels"))).toBe(false);
  });

  test("Bridges General sub-block has NO pillar-specific slices leaking in", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = svc.populateFormattingSettingsModel(VisualFormattingSettingsModel, makeDV(undefined) as any);
    const fm = svc.buildFormattingModel(model);
    const bridgesCard = fm.cards.find(
      (c) => (c as unknown as { uid?: string }).uid === "bridges-card"
    ) as unknown as { groups: Array<{ uid?: string; slices?: Array<{ uid?: string; displayName?: string }> }> };
    const generalGroup = bridgesCard.groups.find((g) => g.uid === "bridgesGeneral-group");
    const slices = generalGroup?.slices || [];
    const sliceUids = slices.map((s) => (s as unknown as { uid?: string }).uid || "");
    const sliceDisplayNames = slices.map((s) => (s as unknown as { displayName?: string }).displayName || "");
    // Pillar-specific slices must NOT appear here.
    expect(sliceUids.some((u) => u.includes("pillarColor"))).toBe(false);
    expect(sliceUids.some((u) => u.includes("colorPillarLabel"))).toBe(false);
    expect(sliceUids.some((u) => u.includes("showIndividual"))).toBe(false);
    // Pillar-specific displayNames must NOT appear either.
    expect(sliceDisplayNames.includes("Pillar color")).toBe(false);
    expect(sliceDisplayNames.includes("Pillar label color")).toBe(false);
    expect(sliceDisplayNames.includes("Individual pillar color")).toBe(false);
  });

  test("Pillars General sub-block has NO bridge-specific slices leaking in", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = svc.populateFormattingSettingsModel(VisualFormattingSettingsModel, makeDV(undefined) as any);
    const fm = svc.buildFormattingModel(model);
    const pillarsCard = fm.cards.find(
      (c) => (c as unknown as { uid?: string }).uid === "pillars-card"
    ) as unknown as { groups: Array<{ uid?: string; slices?: Array<{ uid?: string; displayName?: string }> }> };
    const generalGroup = pillarsCard.groups.find((g) => g.uid === "pillarsGeneral-group");
    const slices = generalGroup?.slices || [];
    const sliceUids = slices.map((s) => (s as unknown as { uid?: string }).uid || "");
    expect(sliceUids.some((u) => u.includes("colorBridge"))).toBe(false);
    expect(sliceUids.some((u) => u.includes("colorBridgeLabel"))).toBe(false);
  });

  test("Pillars CompositeCard exposes the three fx-enabled colour slices in General", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = svc.populateFormattingSettingsModel(VisualFormattingSettingsModel, makeDV(undefined) as any);
    const fm = svc.buildFormattingModel(model);
    const pillarsCard = fm.cards.find(
      (c) => (c as unknown as { uid?: string }).uid === "pillars-card"
    ) as unknown as { groups: Array<{ uid?: string; slices?: Array<{ uid?: string }> }> };
    expect(pillarsCard).toBeDefined();
    const generalGroup = pillarsCard.groups.find((g) => g.uid === "pillarsGeneral-group");
    expect(generalGroup).toBeDefined();
    const sliceUids = (generalGroup?.slices || []).map((s) =>
      (s as unknown as { uid?: string }).uid
    );
    expect(sliceUids.some((u) => u && u.includes("pillarColor"))).toBe(true);
    expect(sliceUids.some((u) => u && u.includes("colorPillarLabel"))).toBe(true);
    expect(sliceUids.some((u) => u && u.includes("labelBgColor"))).toBe(true);
    // showIndividual toggle removed in 1.0.54.
    expect(sliceUids.some((u) => u && u.includes("showIndividual"))).toBe(false);
  });
});
