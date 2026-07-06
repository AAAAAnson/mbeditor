import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tag } from "./Tag";

describe("Tag", () => {
  it("renders a neutral static badge by default", () => {
    render(<Tag>Draft</Tag>);
    const tag = screen.getByText("Draft");
    expect(tag.tagName).toBe("SPAN");
    expect(tag).toHaveClass("mb-tag", "tone-neutral");
  });

  it("supports semantic tones and a leading node", () => {
    render(
      <Tag tone="success" leading={<span data-testid="lead" />}>
        Saved
      </Tag>,
    );
    expect(screen.getByText("Saved")).toHaveClass("tone-success");
    expect(screen.getByTestId("lead")).toBeInTheDocument();
  });

  it("passes through className and style", () => {
    render(
      <Tag className="custom-tag" style={{ fontSize: 11 }}>
        Current
      </Tag>,
    );
    const tag = screen.getByText("Current");
    expect(tag).toHaveClass("custom-tag");
    expect(tag).toHaveStyle({ fontSize: "11px" });
  });
});
