import { describe, expect, it } from "vitest";
import type { Article } from "@/types";
import {
  applyProjectedBlockEdit,
  articleToBridgeDoc,
  buildCanonicalImageHtml,
  isProjectedBlockEditable,
  shouldUseProjectedBridge,
  summarizeMBDocBlocks,
} from "@/features/editor/adapters/DocumentAdapter";

const article: Article = {
  id: "article-1",
  title: "Bridge Article",
  mode: "html",
  html: "<p>Hello</p>",
  css: "p{color:red;}",
  js: "",
  markdown: "",
  cover: "",
  author: "Anson",
  digest: "Digest",
  created_at: "2026-04-17T00:00:00Z",
  updated_at: "2026-04-17T00:00:00Z",
};

describe("DocumentAdapter", () => {
  it("creates a legacy-first bridge doc from an article snapshot", () => {
    expect(articleToBridgeDoc(article)).toMatchObject({
      metadata: {
        id: "article-1",
        title: "Bridge Article",
        mode: "html",
      },
      legacyFields: {
        html: "<p>Hello</p>",
        css: "p{color:red;}",
      },
      capabilities: ["legacy-only"],
    });
  });

  it("summarizes projected blocks for the bridge sidebar", () => {
    const summaries = summarizeMBDocBlocks({
      id: "doc-1",
      version: "1",
      meta: {
        title: "Projected",
        author: "",
        digest: "",
        cover: "",
      },
      blocks: [
        { id: "h1", type: "heading", text: "Projected title" },
        { id: "img1", type: "image", src: "/images/cover.png" },
        { id: "svg1", type: "svg", source: "<svg></svg>" },
        { id: "r1", type: "raster", html: "<div>Card</div>" },
      ],
      projection: {
        editability: "informational-only",
        reason: "Projected blocks are informational only.",
        editableBlockIds: [],
      },
    });

    expect(summaries).toEqual([
      {
        id: "h1",
        type: "heading",
        label: "Projected title",
        editable: false,
        editMode: "legacy-fragment",
        reason: "Projected blocks are informational only.",
      },
      {
        id: "img1",
        type: "image",
        label: "cover.png",
        editable: false,
        editMode: "legacy-fragment",
        reason: "Projected blocks are informational only.",
      },
      {
        id: "svg1",
        type: "svg",
        label: "SVG block",
        editable: false,
        editMode: "legacy-fragment",
        reason: "Projected blocks are informational only.",
      },
      {
        id: "r1",
        type: "raster",
        label: "Raster block",
        editable: false,
        editMode: "legacy-fragment",
        reason: "Projected blocks are informational only.",
      },
    ]);
  });

  it("marks reversible projected blocks as editable", () => {
    const summaries = summarizeMBDocBlocks({
      id: "doc-2",
      version: "1",
      meta: { title: "", author: "", digest: "", cover: "" },
      blocks: [{ id: "md1", type: "markdown", source: "# Hello" }],
      projection: {
        editability: "reversible",
        reason: "Single markdown block is reversible.",
        editableBlockIds: ["md1"],
      },
    });

    expect(summaries[0]).toMatchObject({
      id: "md1",
      editable: true,
      editMode: "projected-block",
    });
    expect(isProjectedBlockEditable({ 
      id: "doc-2",
      version: "1",
      meta: { title: "", author: "", digest: "", cover: "" },
      blocks: [{ id: "md1", type: "markdown", source: "# Hello" }],
      projection: {
        editability: "reversible",
        reason: "Single markdown block is reversible.",
        editableBlockIds: ["md1"],
      },
    }, "md1")).toBe(true);
  });

  it("writes markdown block edits back to legacy markdown", () => {
    const bridgeDoc = articleToBridgeDoc({ ...article, mode: "markdown", markdown: "# Old" });
    bridgeDoc.mbdoc = {
      id: "doc-3",
      version: "1",
      meta: { title: "", author: "", digest: "", cover: "" },
      blocks: [{ id: "md1", type: "markdown", source: "# Old" }],
      projection: {
        editability: "reversible",
        reason: "Single markdown block is reversible.",
        editableBlockIds: ["md1"],
      },
    };
    const updated = applyProjectedBlockEdit(bridgeDoc, "md1", { source: "# New" });

    expect(updated?.legacyFields.markdown).toBe("# New");
    expect(updated?.metadata.mode).toBe("markdown");
  });

  it("writes html block edits back to legacy html and css", () => {
    const bridgeDoc = articleToBridgeDoc(article);
    bridgeDoc.mbdoc = {
      id: "doc-4",
      version: "1",
      meta: { title: "", author: "", digest: "", cover: "" },
      blocks: [{ id: "html1", type: "html", source: "<p>Old</p>", css: "p{color:red;}" }],
      projection: {
        editability: "reversible",
        reason: "Single html block is reversible.",
        editableBlockIds: ["html1"],
      },
    };
    const updated = applyProjectedBlockEdit(bridgeDoc, "html1", {
      source: "<p>New</p>",
      css: "p{color:blue;}",
    });

    expect(updated?.legacyFields.html).toBe("<p>New</p>");
    expect(updated?.legacyFields.css).toBe("p{color:blue;}");
    expect(updated?.metadata.mode).toBe("html");
  });

  it("writes image block edits back to canonical legacy html", () => {
    const bridgeDoc = articleToBridgeDoc(article);
    bridgeDoc.mbdoc = {
      id: "doc-5",
      version: "1",
      meta: { title: "", author: "", digest: "", cover: "" },
      blocks: [{ id: "img1", type: "image", src: "/images/old.png", alt: "Old" }],
      projection: {
        editability: "reversible",
        reason: "Single image block is reversible.",
        editableBlockIds: ["img1"],
      },
    };
    const updated = applyProjectedBlockEdit(bridgeDoc, "img1", {
      src: "/images/new.png",
      alt: "Hero",
      width: 640,
      height: 480,
    });

    expect(updated?.legacyFields.html).toBe(
      '<p><img src="/images/new.png" alt="Hero" width="640" height="480"></p>',
    );
    expect(updated?.legacyFields.css).toBe("");
  });

  it("rebuilds legacy html from multiple reversible projected blocks", () => {
    const bridgeDoc = articleToBridgeDoc(article);
    bridgeDoc.mbdoc = {
      id: "doc-8",
      version: "1",
      meta: { title: "", author: "", digest: "", cover: "" },
      blocks: [
        { id: "h1", type: "heading", level: 2, text: "Heading" },
        { id: "p1", type: "paragraph", text: "Paragraph" },
        { id: "svg1", type: "svg", source: "<svg><circle /></svg>" },
      ],
      projection: {
        editability: "reversible",
        reason: "All projected blocks can be written back to legacy HTML.",
        editableBlockIds: ["h1", "p1", "svg1"],
      },
    };

    const updated = applyProjectedBlockEdit(bridgeDoc, "p1", { text: "Updated body" });

    expect(updated?.legacyFields.html).toContain("<h2>Heading</h2>");
    expect(updated?.legacyFields.html).toContain("<p>Updated body</p>");
    expect(updated?.legacyFields.html).toContain("<svg><circle /></svg>");
    expect(updated?.metadata.mode).toBe("html");
  });

  it("writes svg block edits back to legacy html", () => {
    const bridgeDoc = articleToBridgeDoc(article);
    bridgeDoc.mbdoc = {
      id: "doc-9",
      version: "1",
      meta: { title: "", author: "", digest: "", cover: "" },
      blocks: [{ id: "svg1", type: "svg", source: "<svg><circle /></svg>" }],
      projection: {
        editability: "reversible",
        reason: "Single svg block is reversible.",
        editableBlockIds: ["svg1"],
      },
    };

    const updated = applyProjectedBlockEdit(bridgeDoc, "svg1", {
      source: "<svg><rect /></svg>",
    });

    expect(updated?.legacyFields.html).toBe("<svg><rect /></svg>");
  });

  it("writes raster block edits back to legacy html and css", () => {
    const bridgeDoc = articleToBridgeDoc(article);
    bridgeDoc.mbdoc = {
      id: "doc-10",
      version: "1",
      meta: { title: "", author: "", digest: "", cover: "" },
      blocks: [
        {
          id: "r1",
          type: "raster",
          html: "<div>Old card</div>",
          css: "div{display:grid;}",
          width: 640,
        },
      ],
      projection: {
        editability: "reversible",
        reason: "Single raster block is reversible.",
        editableBlockIds: ["r1"],
      },
    };

    const updated = applyProjectedBlockEdit(bridgeDoc, "r1", {
      html: "<div>New card</div>",
      css: "div{display:flex;}",
      width: 720,
    });

    expect(updated?.legacyFields.html).toBe("<div>New card</div>");
    expect(updated?.legacyFields.css).toBe("div{display:flex;}");
  });

  it("refuses projected-block editing for informational projections", () => {
    const bridgeDoc = articleToBridgeDoc(article);
    bridgeDoc.mbdoc = {
      id: "doc-6",
      version: "1",
      meta: { title: "", author: "", digest: "", cover: "" },
      blocks: [
        { id: "p1", type: "paragraph", text: "One" },
        { id: "p2", type: "paragraph", text: "Two" },
      ],
      projection: {
        editability: "informational-only",
        reason: "Multiple projected blocks are not safely reversible.",
        editableBlockIds: [],
      },
    };

    expect(applyProjectedBlockEdit(bridgeDoc, "p1", { text: "Changed" })).toBeNull();
  });

  it("builds canonical image html", () => {
    expect(
      buildCanonicalImageHtml({
        src: "/images/a.png",
        alt: "Cover",
        width: 300,
        height: 200,
      }),
    ).toBe('<p><img src="/images/a.png" alt="Cover" width="300" height="200"></p>');
  });

  it("uses projected bridge actions only when projection is available", () => {
    const bridgeDoc = articleToBridgeDoc(article);
    expect(shouldUseProjectedBridge(bridgeDoc)).toBe(false);

    bridgeDoc.mbdoc = {
      id: "doc-7",
      version: "1",
      meta: { title: "", author: "", digest: "", cover: "" },
      blocks: [{ id: "html1", type: "html", source: "<p>Hello</p>", css: "" }],
      projection: {
        editability: "reversible",
        reason: "Single html block is reversible.",
        editableBlockIds: ["html1"],
      },
    };
    bridgeDoc.capabilities = ["legacy-only", "bridge"];

    expect(shouldUseProjectedBridge(bridgeDoc)).toBe(true);
  });
});
