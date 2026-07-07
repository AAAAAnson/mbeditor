import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BackgroundControl } from "./BackgroundControl";

afterEach(cleanup);

describe("BackgroundControl", () => {
  it("shows transparent state when article has no background", () => {
    render(
      <BackgroundControl html='<section style="padding:8px;"><p>x</p></section>' onChange={() => {}} />,
    );
    expect(screen.getByTestId("bg-control")).toHaveTextContent(/透明/);
  });

  it("emits html with new background on color pick", () => {
    const onChange = vi.fn();
    render(
      <BackgroundControl html='<section style="padding:8px;"><p>x</p></section>' onChange={onChange} />,
    );
    fireEvent.input(screen.getByTestId("bg-color-input"), { target: { value: "#123456" } });
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining("background-color:#123456"));
  });

  it("clears background on clear button", () => {
    const onChange = vi.fn();
    render(
      <BackgroundControl
        html='<section style="background-color:#123456;padding:8px;"><p>x</p></section>'
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("bg-clear"));
    expect(onChange).toHaveBeenCalledWith(expect.not.stringContaining("background-color"));
  });
});
