
import { makeVisual, dvBuild } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const solid = (c: string) => ({ solid: { color: c } });
const BG = "#dddddd";

function render(opts: { position?: string; vertical?: boolean } = {}): {
  v: Any;
  target: HTMLElement;
} {
  const dv: Any = dvBuild({
    cats: [{ name: "Cat", values: ["Start", "Up", "Down", "End"] }],
    vals: [{ name: "Amount", role: "actual", values: [100, 30, -20, 110] }]
  });
  dv.metadata.objects = {
    general: { orientation: opts.vertical ? "vertical" : "horizontal" },
    bridges: {
      labelBgShow: true,
      labelBgColor: solid(BG),
      ...(opts.position ? { labelPosition: opts.position } : {})
    }
  };
  const v: Any = makeVisual();
  v.update({ dataViews: [dv], viewport: { width: 700, height: 460 }, type: 2 });
  return { v, target: v.target as HTMLElement };
}

function barRect(target: HTMLElement, catIdx: number): SVGRectElement {
  const g = target.querySelector(`g.wf-bar[data-cat-idx="${catIdx}"]`)!;
  return Array.from(g.querySelectorAll("rect")).find(
    (r) => !r.classList.contains("wf-focus-ring")
  ) as SVGRectElement;
}

function valueLabel(target: HTMLElement, catIdx: number): SVGTextElement {
  const groups = Array.from(
    target.querySelectorAll(`g.wf-clickable[data-cat-idx="${catIdx}"]`)
  ).filter((g) => !g.classList.contains("wf-bar"));
  const t = groups.map((g) => g.querySelector("text")).find(Boolean);
  expect(t).toBeTruthy();
  return t as SVGTextElement;
}

function labelBg(target: HTMLElement, catIdx: number): SVGRectElement | null {
  const groups = Array.from(
    target.querySelectorAll(`g.wf-clickable[data-cat-idx="${catIdx}"]`)
  ).filter((g) => !g.classList.contains("wf-bar"));
  for (const g of groups) {
    const r = g.querySelector(`rect[fill="${BG}"]`);
    if (r) return r as SVGRectElement;
  }
  return null;
}

const num = (el: Element, a: string): number => Number(el.getAttribute(a));

describe("bridge label position — horizontal", () => {
  test("default (auto): a gain's label sits ABOVE its bar, a loss's BELOW", () => {
    const { target } = render();
    const up = barRect(target, 1);
    const down = barRect(target, 2);
    expect(num(valueLabel(target, 1), "y")).toBeLessThan(num(up, "y"));
    expect(num(valueLabel(target, 2), "y")).toBeGreaterThan(num(down, "y") + num(down, "height"));
  });

  test("explicit 'auto' renders byte-identically to an unset property", () => {
    const a = render().target.innerHTML;
    const b = render({ position: "auto" }).target.innerHTML;
    expect(b).toBe(a);
  });

  test("center: the label sits INSIDE the bar span, horizontally centred", () => {
    const { target } = render({ position: "center" });
    for (const i of [1, 2]) {
      const r = barRect(target, i);
      const t = valueLabel(target, i);
      const top = num(r, "y");
      const bot = top + num(r, "height");
      const y = num(t, "y");
      expect(y).toBeGreaterThan(top);
      expect(y).toBeLessThan(bot + 14 * 0.35 + 0.1);
      expect(num(t, "x")).toBeCloseTo(num(r, "x") + num(r, "width") / 2, 1);
      expect(t.getAttribute("text-anchor")).toBe("middle");
    }
  });

  test("center keeps the background pill, centred on the text", () => {
    const { target } = render({ position: "center" });
    const t = valueLabel(target, 1);
    const bg = labelBg(target, 1);
    expect(bg).not.toBeNull();
    const bgMid = num(bg!, "x") + num(bg!, "width") / 2;
    expect(Math.abs(bgMid - num(t, "x"))).toBeLessThan(0.15);
  });

  test("pillar labels are not affected by the bridge position", () => {
    const a = render();
    const b = render({ position: "center" });
    expect(valueLabel(b.target, 0).getAttribute("y")).toBe(
      valueLabel(a.target, 0).getAttribute("y")
    );
  });
});

describe("bridge label position — vertical", () => {
  test("default: a gain's label starts right of its tip", () => {
    const { target } = render({ vertical: true });
    const r = barRect(target, 1);
    const t = valueLabel(target, 1);
    expect(t.getAttribute("text-anchor")).toBe("start");
    expect(num(t, "x")).toBeGreaterThan(num(r, "x") + num(r, "width"));
  });

  test("center: the label is centred on the bar's horizontal span", () => {
    const { target } = render({ vertical: true, position: "center" });
    for (const i of [1, 2]) {
      const r = barRect(target, i);
      const t = valueLabel(target, i);
      expect(t.getAttribute("text-anchor")).toBe("middle");
      expect(num(t, "x")).toBeCloseTo(num(r, "x") + num(r, "width") / 2, 1);
    }
    expect(labelBg(target, 1)).not.toBeNull();
  });
});

describe("bridge label position — format pane", () => {
  test("the slice lives in Bridges → Data labels, first", () => {
    const { v } = render();
    const model = v.getFormattingModel();
    const card = model.cards.find((c: Any) => c.uid === "bridges-card");
    const group = card.groups.find((g: Any) => g.uid === "bridgesDataLabels-group");
    const first = group.slices[0];
    expect(first.control.properties.descriptor.propertyName).toBe("labelPosition");
  });
});
