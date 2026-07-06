import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SvgEditPanel from "./SvgEditPanel";
import { parseSvgModel } from "./svgParse";
import { useSvgPatch } from "./useSvgPatch";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg"><rect id="tab1btn" x="10" y="20" width="40" height="40" fill="#F5A623"/><rect width="5" height="5"><animate attributeName="opacity" begin="0.6s" dur="1s"/></rect></svg>`;
const HTML = `<p>before</p>\n${SVG}\n<p>after</p>`;

afterEach(cleanup);

describe("SvgEditPanel", () => {
  it("renders colour, hotspot and smil sections from a parsed model", () => {
    const model = parseSvgModel(SVG);
    render(<SvgEditPanel model={model} patchAttr={vi.fn()} />);
    expect(screen.getByText(/颜色/)).toBeInTheDocument();
    expect(screen.getByText(/热区/)).toBeInTheDocument();
    expect(screen.getByText(/动画时间轴/)).toBeInTheDocument();
    expect(screen.getByText("#tab1btn (rect)")).toBeInTheDocument();
  });

  it("calls patchAttr once with the new hex on colour input change", () => {
    const model = parseSvgModel(SVG);
    const patchAttr = vi.fn();
    render(<SvgEditPanel model={model} patchAttr={patchAttr} />);

    const colorInput = screen.getByLabelText(/颜色$/) as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: "#000000" } });

    expect(patchAttr).toHaveBeenCalledTimes(1);
    const fillColor = model.colors.find((c) => c.attr === "fill")!;
    expect(patchAttr).toHaveBeenCalledWith(fillColor.elementIndex, "fill", "#000000");
  });

  it("shows a fallback when the model failed to parse", () => {
    render(<SvgEditPanel model={parseSvgModel("<p/>")} patchAttr={vi.fn()} />);
    expect(screen.getByText(/未能解析所选 SVG/)).toBeInTheDocument();
  });
});

// Integration: the panel + useSvgPatch end-to-end calls onFieldChange("html", …)
function Harness({ onFieldChange }: { onFieldChange: (f: "html", v: string) => void }) {
  const { model, patchAttr } = useSvgPatch(HTML, HTML.indexOf(SVG), onFieldChange);
  return <SvgEditPanel model={model} patchAttr={patchAttr} />;
}

describe("SvgEditPanel + useSvgPatch integration", () => {
  it("writes the full html with the new colour via onFieldChange exactly once", () => {
    const onFieldChange = vi.fn();
    render(<Harness onFieldChange={onFieldChange} />);

    const colorInput = screen.getByLabelText(/颜色$/) as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: "#00ff00" } });

    expect(onFieldChange).toHaveBeenCalledTimes(1);
    const [field, value] = onFieldChange.mock.calls[0];
    expect(field).toBe("html");
    expect(value).toContain('fill="#00ff00"');
    expect(value).toContain("<p>before</p>");
    expect(value).toContain("<p>after</p>");
    expect(value).not.toContain("#F5A623");
  });
});
