# MBEditor Render Decisions

Last updated: 2026-04-16

This file explains how agents should choose between HTML, SVG, and raster output, and how that decision relates to the current legacy `Article` path and the future `MBDoc` path.

## 1. Core Rule

Choose the lowest layer that can express the result while preserving WeChat-safe output.

Priority:

1. HTML
2. SVG
3. raster

Lower layers are usually better because they preserve more semantics and are easier to edit, diff, and publish safely.

## 2. Use HTML When

Choose HTML for:

- titles and paragraphs
- callouts
- lists
- quotes
- tables
- simple cards
- normal image-plus-text layouts
- basic multi-column layouts that survive current project constraints
- content where selectable text matters

HTML is usually the best first choice for legacy `Article` work and for the early `MBDoc` renderer rollout.

## 3. Use SVG When

Choose SVG for:

- vector illustration
- decorative shapes
- diagram-like compositions
- simple iconography
- interactions that can be expressed safely in SVG itself

SVG is a better choice than raster when:

- the output should remain crisp at different sizes
- the visual is more geometric than document-like
- the design does not depend on browser scripting

## 4. Use Raster When

Choose raster only when HTML and SVG cannot represent the result acceptably.

Typical cases:

- visually exact compositions that rely on browser rendering tricks
- effects that would be too fragile or too expensive to preserve in WeChat-safe markup
- outputs whose main value is visual fidelity rather than selectable/editable structure

Tradeoff:

- you gain visual fidelity
- you lose text semantics and editability

Do not rasterize by default.

## 5. Architecture Boundary Rule

Today:

- current product authoring is still legacy `Article`
- backend processing is still what makes preview/publish believable
- `MBDoc` is not yet the universal authoring path

So use this split:

- content needed now in the shipped editor: stay compatible with `Article`
- render-system work: build toward `MBDoc`
- bridge work: explicitly state how `Article` content becomes renderable by `MBDoc`

## 6. Preview / Copy / Publish Rule

A render choice is only valid if it can survive the full path:

- preview
- copy/export
- publish

If one path differs materially from the others, the decision is incomplete.

This is especially important for:

- images
- inline styles
- WeChat sanitization effects
- any future raster or SVG handling

## 7. Decision Checklist

Before choosing a layer, ask:

1. Can the design be expressed with normal structure and inline-safe styling?
2. Does the user need selectable text?
3. Is the visual primarily geometric or illustrative?
4. Would publishing mutate the result beyond acceptability?
5. Is the effect worth losing structure and editability?

If the answer to 1 is yes, use HTML.
If 1 is no but 3 is yes, try SVG.
If neither HTML nor SVG is acceptable, use raster.

## 8. Migration Guidance

When implementing renderer coverage, the project should proceed in this order:

1. `html`
2. `markdown`
3. `image`
4. `svg`
5. `raster`

Reason:

- text and image coverage matter first for publish parity
- SVG and raster are higher-complexity escape hatches

## 9. Common Failure Modes

- choosing raster too early and losing meaningful text
- choosing HTML for effects that require brittle publish-time hacks
- moving preview to a new render layer without moving publish with it
- assuming a research conclusion automatically equals current runtime support

## 10. Related Docs

- `docs/architecture/PROJECT_MAP.md`
- `docs/architecture/SESSION_ONRAMP.md`
