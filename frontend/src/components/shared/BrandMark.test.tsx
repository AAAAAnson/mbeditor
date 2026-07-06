import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import BrandMark from "./BrandMark";
import BrandMarkCream from "./BrandMarkCream";

afterEach(() => {
  cleanup();
});

describe("BrandMark", () => {
  it("renders an inline SVG", () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("viewBox", "0 0 100 100");
  });

  it("defaults to size 22 and honours an explicit size", () => {
    const { container } = render(<BrandMark size={40} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "40");
    expect(svg).toHaveAttribute("height", "40");
  });

  it("paints the brand-orange rounded square with the cream M stroke", () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelector("rect")).toHaveAttribute("fill", "#E8553A");
    const path = container.querySelector("path");
    expect(path).toHaveAttribute("stroke", "#FBF4E8");
    expect(path).toHaveAttribute("fill", "none");
  });

  it("supports radius, aria label, and className", () => {
    const { container } = render(<BrandMark size={36} radius={18} ariaLabel="MBEditor logo" className="brand" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("brand");
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "MBEditor logo");
    expect(container.querySelector("rect")).toHaveAttribute("rx", "18");
  });

  it("renders the cream mark without the orange square", () => {
    const { container } = render(<BrandMarkCream size={32} className="cream" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("cream");
    expect(container.querySelector("rect")).toBeNull();
    expect(container.querySelector("path")).toHaveAttribute("stroke", "#FBF4E8");
  });
});
