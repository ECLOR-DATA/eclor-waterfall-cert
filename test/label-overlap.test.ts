
import { makeVisual, dvBuild } from "./_harness";

interface Placed {
  text: string;
  x: number;
  y: number;
  w: number;
}

function labelBoxes(target: HTMLElement, fontSize: number): Placed[] {
  return Array.from(target.querySelectorAll("g.wf-clickable[data-cat-idx] text"))
    .map((t) => {
      const text = t.textContent || "";
      return {
        text,
        x: Number(t.getAttribute("x")),
        y: Number(t.getAttribute("y")),
        w: text.length * fontSize * 0.55
      };
    })
    .filter((b) => b.text.length > 0 && Number.isFinite(b.x));
}

function overlappingPairs(boxes: Placed[], lineH: number): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const sameLine = Math.abs(a.y - b.y) < lineH;
      const xOverlap =
        a.x - a.w / 2 < b.x + b.w / 2 && b.x - b.w / 2 < a.x + a.w / 2;
      if (sameLine && xOverlap) out.push([a.text, b.text]);
    }
  }
  return out;
}

function render(dv: unknown, viewport = { width: 420, height: 320 }): HTMLElement {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return target;
}

describe("bar value labels never stack on one another", () => {
  test("a run of tiny deltas in a narrow viewport keeps every label readable", () => {
    const labels = ["P0", "b1", "b2", "b3", "b4", "b5", "b6", "P1"];
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: labels,
          objects: labels.map((_, i) => ({
            pillars: { isPillar: i === 0 || i === labels.length - 1 }
          }))
        }
      ],
      vals: [
        {
          name: "Sales",
          role: "actual",
          values: [502, -7154, 426, 48, 80, 4, -1, -6094],
          format: "#,##0"
        }
      ]
    });
    const boxes = labelBoxes(render(dv), 14);
    expect(boxes.length).toBeGreaterThanOrEqual(8);
    expect(overlappingPairs(boxes, 14)).toEqual([]);
  });

  test("labels stay inside the plot area rather than escaping a collision", () => {
    const labels = ["A", "B", "C", "D", "E", "F"];
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: labels,
          objects: labels.map((_, i) => ({ pillars: { isPillar: i === 0 } }))
        }
      ],
      vals: [
        {
          name: "Sales",
          role: "actual",
          values: [1000, 1, 1, 1, 1, 1],
          format: "#,##0"
        }
      ]
    });
    const target = render(dv);
    const boxes = labelBoxes(target, 14);
    const svg = target.querySelector("svg");
    const h = Number(svg?.getAttribute("height") || 320);
    for (const b of boxes) {
      expect(b.y).toBeGreaterThan(0);
      expect(b.y).toBeLessThan(h);
    }
  });

  test("a roomy chart is laid out exactly as before (no drift)", () => {
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B", "C"],
          objects: [
            { pillars: { isPillar: true } },
            { pillars: { isPillar: false } },
            { pillars: { isPillar: true } }
          ]
        }
      ],
      vals: [{ name: "Sales", role: "actual", values: [100, 50, 150], format: "#,##0" }]
    });
    const boxes = labelBoxes(render(dv, { width: 900, height: 500 }), 14);
    expect(overlappingPairs(boxes, 14)).toEqual([]);
    const bridge = boxes.find((b) => b.text === "+50");
    const pillarA = boxes.find((b) => b.text === "100");
    expect(bridge).toBeDefined();
    expect(pillarA).toBeDefined();
    expect(bridge!.y).toBeLessThan(pillarA!.y);
  });
});

describe("arc labels never stack on one another", () => {
  const arcLabels = (target: HTMLElement): Placed[] =>
    Array.from(target.querySelectorAll("text"))
      .map((t) => ({
        text: t.textContent || "",
        x: Number(t.getAttribute("x")),
        y: Number(t.getAttribute("y")),
        w: (t.textContent || "").length * 12 * 0.55
      }))
      .filter((b) => b.text.includes("|"));

  const arcDv = (values: number[], count = values.length) => {
    const labels = values.map((_, i) => `P${i}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [
        {
          name: "Cat",
          values: labels.slice(0, count),
          objects: labels.slice(0, count).map(() => ({ pillars: { isPillar: true } }))
        }
      ],
      vals: [{ name: "Sales", role: "actual", values, format: "#,##0" }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = { variationArc: { show: true, defaultSource: "auto-both" } };
    return dv;
  };

  test("wide labels on short spans get stacked instead of printed on top of each other", () => {
    const target = render(
      arcDv([1234567, 1361023, 1487479, 1613935, 1740391]),
      { width: 520, height: 360 }
    );
    const arcs = arcLabels(target);
    expect(arcs.length).toBeGreaterThanOrEqual(4);
    expect(overlappingPairs(arcs, 12)).toEqual([]);
    expect(new Set(arcs.map((a) => Math.round(a.y))).size).toBeGreaterThan(1);
    expect(Math.min(...arcs.map((a) => a.y))).toBeGreaterThan(0);
  });

  const bracketYs = (target: HTMLElement): number[] =>
    Array.from(target.querySelectorAll("line"))
      .filter((l) => l.getAttribute("y1") === l.getAttribute("y2"))
      .map((l) => Number(l.getAttribute("y1")));

  test("labels with room stay on their own bracket — the pass adds no drift", () => {
    const target = render(arcDv([100, 104, 108]), { width: 900, height: 420 });
    const arcs = arcLabels(target);
    expect(arcs.length).toBeGreaterThanOrEqual(2);
    const ys = bracketYs(target);
    for (const a of arcs) {
      expect(ys.some((y) => Math.abs(y - (a.y + 12)) < 0.2)).toBe(true);
    }
  });
});
