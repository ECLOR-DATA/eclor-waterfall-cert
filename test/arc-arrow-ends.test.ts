
import { makeVisual, dvBuild } from "./_harness";

const ARC_COLOR = "#123456";

function arrowTipXs(target: HTMLElement): number[] {
  return Array.from(target.querySelectorAll(`path[fill="${ARC_COLOR}"]`)).map((p) => {
    const d = p.getAttribute("d") || "";
    const m = d.match(/L\s+([\d.]+)\s+[\d.]+\s+z\s*$/i);
    expect(m).toBeTruthy();
    return Number(m![1]);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function render(dv: any): HTMLElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v: any = makeVisual();
  v.update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
  const target = v.target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return target;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cumulativeDv(destArrowEnds?: string, globalArrowEnds?: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dv: any = dvBuild({
    cats: [
      {
        name: "Cat",
        values: ["A", "B"],
        objects: [
          { pillars: { isPillar: true } },
          {
            pillars: { isPillar: true },
            ...(destArrowEnds ? { variationArc: { arrowEnds: destArrowEnds } } : {})
          }
        ]
      }
    ],
    vals: [{ name: "Sales", role: "actual", values: [100, 200] }]
  });
  dv.metadata.objects = {
    grandTotal: { showGrandTotal: false },
    variationArc: {
      show: true,
      lineColor: { solid: { color: ARC_COLOR } },
      ...(globalArrowEnds ? { arrowEnds: globalArrowEnds } : {})
    }
  };
  return dv;
}

describe("per-arc arrowEnds — cumulative (persisted on the destination category)", () => {
  test("destination override 'end' → single arrow on the ARRIVAL pillar despite global 'both'", () => {
    const tips = arrowTipXs(render(cumulativeDv("end")));
    expect(tips.length).toBe(1);
    expect(tips[0]).toBeGreaterThan(320);
  });

  test("destination override 'start' beats a DIFFERENT global ('end')", () => {
    const tips = arrowTipXs(render(cumulativeDv("start", "end")));
    expect(tips.length).toBe(1);
    expect(tips[0]).toBeLessThan(320);
  });

  test("no override → the arc follows the global ('start')", () => {
    const tips = arrowTipXs(render(cumulativeDv(undefined, "start")));
    expect(tips.length).toBe(1);
    expect(tips[0]).toBeLessThan(320);
  });
});

describe("per-arc arrowEnds — comparison (persisted on the destination MEASURE)", () => {
  test("arrowEnds on M2's source.objects drives the M1→M2 arc only", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv: any = dvBuild({
      cats: [{ name: "Cat", values: ["X", "Y"] }],
      vals: [
        { name: "M1", role: "actual", values: [100, 100] },
        {
          name: "M2",
          role: "actual",
          values: [120, 110],
          objects: { variationArc: { arrowEnds: "end" } }
        },
        { name: "M3", role: "actual", values: [130, 140] }
      ]
    });
    dv.metadata.objects = {
      general: { mode: "comparison" },
      variationArc: { show: true, lineColor: { solid: { color: ARC_COLOR } } }
    };
    const tips = arrowTipXs(render(dv));
    expect(tips.length).toBe(3);
  });
});

describe("per-arc arrowEnds — format-pane group", () => {
  test("each per-arc group carries an arrowEnds dropdown with the destination selector, echoing the persisted value", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    v.update({
      dataViews: [cumulativeDv("end")],
      viewport: { width: 640, height: 420 },
      type: 2
    });
    v.getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arcGroups = v.formattingSettings.variationArc.groups.filter((g: any) =>
      String(g.name).startsWith("arcDest")
    );
    expect(arcGroups.length).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dd = arcGroups[0].slices.find((s: any) => s.name === "arrowEnds");
    expect(dd).toBeTruthy();
    expect(dd.selector).toBeTruthy();
    expect(dd.value.value).toBe("end");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toggle = arcGroups[0].slices.find((s: any) => s.name === "showArc");
    expect(toggle).toBeTruthy();
  });
});
