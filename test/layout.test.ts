
import { makeVisual } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pt(sort: number, actual: number, isPillar: boolean): any {
  return {
    sort,
    label: `p${sort}`,
    isPillar,
    actual,
    varianceValues: [],
    categoryIndex: sort,
    selectionId: null
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function layout(points: any[], mode: "cumulative" | "comparison"): any {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (v as any).computeLayout(points, mode);
}

describe("computeLayout — cumulative: pillar y0/y1 signs", () => {
  test("positive pillar → y0=0, y1=v; negative pillar → y0=v, y1=0", () => {
    const res = layout([pt(0, 100, true), pt(1, -40, true)], "cumulative");
    expect(res).not.toBeNull();
    const [pos, neg] = res.items;

    expect(pos.type).toBe("pillar");
    expect(pos.y0).toBe(0);
    expect(pos.y1).toBe(100);
    expect(pos.actualVal).toBe(100);

    expect(neg.type).toBe("pillar");
    expect(neg.y0).toBe(-40);
    expect(neg.y1).toBe(0);
    expect(neg.actualVal).toBe(-40);
    expect(neg.runningBefore).toBe(100);
    expect(neg.runningAfter).toBe(-40);
  });
});

describe("computeLayout — cumulative: bridge running-total chaining", () => {
  const points = [pt(0, 100, true), pt(1, -150, false), pt(2, 80, false), pt(3, 30, true)];

  test("runningBefore/runningAfter chain is 0→100→-50→30→30", () => {
    const res = layout(points, "cumulative");
    const [p0, b1, b2, p3] = res.items;

    expect(p0.runningBefore).toBe(0);
    expect(p0.runningAfter).toBe(100);
    expect(b1.runningBefore).toBe(100);
    expect(b1.runningAfter).toBe(-50);
    expect(b2.runningBefore).toBe(-50);
    expect(b2.runningAfter).toBe(30);
    expect(p3.runningBefore).toBe(30);
    expect(p3.runningAfter).toBe(30);
    expect(p3.y0).toBe(0);
    expect(p3.y1).toBe(30);
  });

  test("bridge types follow the value sign (up / down + isFav)", () => {
    const res = layout(points, "cumulative");
    const [, b1, b2] = res.items;
    expect(b1.type).toBe("down");
    expect(b1.isFav).toBe(false);
    expect(b2.type).toBe("up");
    expect(b2.isFav).toBe(true);
  });

  test("down-bridge crossing zero from positive running clips y0Vis to 0, keeps actualVal", () => {
    const res = layout(points, "cumulative");
    const b1 = res.items[1];
    expect(b1.y0).toBe(0);
    expect(b1.y1).toBe(100);
    expect(b1.actualVal).toBe(-150);
  });

  test("up-bridge crossing zero from negative running clips y0Vis to 0 (mirror rule)", () => {
    const res = layout(points, "cumulative");
    const b2 = res.items[2];
    expect(b2.y0).toBe(0);
    expect(b2.y1).toBe(30);
    expect(b2.actualVal).toBe(80);
  });

  test("maxVisual/minVisual track MATH extents, not the clipped y0Vis", () => {
    const res = layout(points, "cumulative");
    expect(res.minVisual).toBe(-50);
    expect(res.maxVisual).toBe(100);
  });
});

describe("computeLayout — comparison: first/last-sort anchors", () => {
  test("anchors are FIRST and LAST pillar by sort; middle marked pillar chains as a bridge", () => {
    const res = layout(
      [pt(0, 100, true), pt(1, 50, true), pt(2, 130, true)],
      "comparison"
    );
    const [first, mid, last] = res.items;

    expect(first.type).toBe("pillar");
    expect(first.runningBefore).toBe(0);
    expect(first.runningAfter).toBe(100);

    expect(mid.type).toBe("up");
    expect(mid.y0).toBe(100);
    expect(mid.y1).toBe(150);
    expect(mid.runningAfter).toBe(150);

    expect(last.type).toBe("pillar");
    expect(last.y0).toBe(0);
    expect(last.y1).toBe(130);
    expect(last.runningBefore).toBe(150);
    expect(last.runningAfter).toBe(130);
  });

  test("bridge zero-crossing clip applies in the comparison branch too", () => {
    const res = layout(
      [pt(0, 100, true), pt(1, -150, false), pt(2, -50, true)],
      "comparison"
    );
    const bridge = res.items[1];
    expect(bridge.type).toBe("down");
    expect(bridge.y0).toBe(0);
    expect(bridge.y1).toBe(100);
    expect(bridge.actualVal).toBe(-150);
    const last = res.items[2];
    expect(last.y0).toBe(-50);
    expect(last.y1).toBe(0);
  });

  test("comparison needs 2+ pillars, cumulative needs 1+ — otherwise null", () => {
    expect(layout([pt(0, 100, true), pt(1, 20, false)], "comparison")).toBeNull();
    expect(layout([pt(0, 20, false), pt(1, -5, false)], "cumulative")).toBeNull();
    expect(layout([pt(0, 100, true)], "cumulative")).not.toBeNull();
  });
});

describe("computeLayout — minRunning (floor-offset input)", () => {
  test("pillars contribute y1 only, bridges contribute both ends", () => {
    const pos = layout(
      [pt(0, 100, true), pt(1, 20, false), pt(2, 120, true)],
      "cumulative"
    );
    expect(pos.minRunning).toBe(100);

    const neg = layout(
      [pt(0, -100, true), pt(1, 30, false), pt(2, -70, true)],
      "cumulative"
    );
    expect(neg.minRunning).toBe(-100);
  });
});
