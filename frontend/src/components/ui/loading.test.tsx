import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckBurst } from "./CheckBurst";
import { LoadingDots } from "./LoadingDots";
import { Skeleton } from "./Skeleton";

describe("Warm loading primitives", () => {
  it("renders a sized skeleton block", () => {
    const { container } = render(<Skeleton w={120} h={24} r={12} data-testid="skel" />);
    const skel = screen.getByTestId("skel");
    expect(skel).toHaveClass("mb-skel");
    expect(skel).toHaveStyle({ width: "120px", height: "24px", borderRadius: "12px" });
    expect(container.querySelector(".mb-skel")).toBeInTheDocument();
  });

  it("renders exactly three loading dots", () => {
    const { container } = render(<LoadingDots />);
    expect(container.querySelectorAll(".mb-dots span")).toHaveLength(3);
  });

  it("renders a success check burst", () => {
    const { container } = render(<CheckBurst size={48} />);
    expect(container.querySelector(".mb-stamp")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
