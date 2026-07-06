import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import TemplateGallery from "./TemplateGallery";
import { TEMPLATES, type Template } from "./templates";

function renderGallery(overrides: Partial<React.ComponentProps<typeof TemplateGallery>> = {}) {
  const onInsert = vi.fn<(t: Template) => void>();
  const onClose = vi.fn();
  render(
    <TemplateGallery
      open
      currentHtmlLength={0}
      onClose={onClose}
      onInsert={onInsert}
      {...overrides}
    />,
  );
  return { onInsert, onClose };
}

describe("TemplateGallery", () => {
  it("does not render when closed", () => {
    const { container } = render(
      <TemplateGallery
        open={false}
        currentHtmlLength={0}
        onClose={() => {}}
        onInsert={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders one thumbnail <img> per template with an svg+xml data url", () => {
    renderGallery();
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(TEMPLATES.length);
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(TEMPLATES.length);
    imgs.forEach((img) => {
      expect(img.getAttribute("src") ?? "").toMatch(/^data:image\/svg\+xml/);
    });
  });

  it("inserts the untouched template html when no params are changed", () => {
    const { onInsert } = renderGallery();
    const tpl = TEMPLATES[0];
    const card = screen.getByText(tpl.title).closest("article")!;
    fireEvent.click(within(card).getByRole("button", { name: "插入" }));
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert.mock.calls[0][0].html).toBe(tpl.html);
  });

  it("patches only the changed color and leaves the rest of the html byte-identical", () => {
    const { onInsert } = renderGallery();
    // pick a template that declares a color param
    const tpl = TEMPLATES.find((t) => (t.colorParams?.length ?? 0) > 0)!;
    const param = tpl.colorParams![0];
    const oldHex = param.match;
    const newHex = "#123456";
    expect(oldHex).not.toBe(newHex);
    expect(tpl.html.includes(oldHex)).toBe(true);

    const card = screen.getByText(tpl.title).closest("article")!;
    // open the tuning panel
    fireEvent.click(within(card).getByRole("button", { name: "调配色/文案" }));
    // change the color via the hex text input
    const hexInput = within(card).getByLabelText(
      `${tpl.title} ${param.label} 色值`,
    ) as HTMLInputElement;
    fireEvent.change(hexInput, { target: { value: newHex } });

    fireEvent.click(within(card).getByRole("button", { name: "插入" }));

    expect(onInsert).toHaveBeenCalledTimes(1);
    const patched = onInsert.mock.calls[0][0].html;
    // old hex fully gone, new hex present
    expect(patched.includes(oldHex)).toBe(false);
    expect(patched.includes(newHex)).toBe(true);
    // byte-for-byte equivalence: reversing the swap reproduces the original exactly
    expect(patched.split(newHex).join(oldHex)).toBe(tpl.html);
  });

  it("confirms before overwriting a non-trivial existing draft", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onInsert } = renderGallery({ currentHtmlLength: 5000 });
    const tpl = TEMPLATES[0];
    const card = screen.getByText(tpl.title).closest("article")!;
    fireEvent.click(within(card).getByRole("button", { name: "插入" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onInsert).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
