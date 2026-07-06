// frontend/src/stores/mbdocStore.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { useMBDocStore } from "./mbdocStore";

// The store's local-cache operations (the API-backed actions are exercised
// through the publish/editor integration paths; here we cover the
// synchronous localStorage layer they delegate to).
describe("mbdocStore local cache", () => {
  beforeEach(() => {
    localStorage.clear();
    useMBDocStore.setState({ docs: [] });
  });

  it("saveDocLocal inserts a new doc", () => {
    useMBDocStore.getState().saveDocLocal({ id: "d1", title: "Demo", data: { blocks: [] } } as never);
    expect(useMBDocStore.getState().docs).toHaveLength(1);
  });

  it("saveDocLocal upserts by id", () => {
    useMBDocStore.getState().saveDocLocal({ id: "d1", title: "A", data: {} } as never);
    useMBDocStore.getState().saveDocLocal({ id: "d1", title: "B", data: {} } as never);
    const docs = useMBDocStore.getState().docs;
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe("B");
  });

  it("getDocLocal returns the stored doc or null", () => {
    useMBDocStore.getState().saveDocLocal({ id: "d1", title: "A", data: {} } as never);
    expect(useMBDocStore.getState().getDocLocal("d1")?.title).toBe("A");
    expect(useMBDocStore.getState().getDocLocal("missing")).toBeNull();
  });

  it("deleteDocLocal removes by id", () => {
    useMBDocStore.getState().saveDocLocal({ id: "d1", title: "A", data: {} } as never);
    useMBDocStore.getState().deleteDocLocal("d1");
    expect(useMBDocStore.getState().docs).toHaveLength(0);
  });

  it("replaceAllLocal swaps the whole cache", () => {
    useMBDocStore.getState().saveDocLocal({ id: "d1", title: "A", data: {} } as never);
    useMBDocStore.getState().replaceAllLocal([
      { id: "d2", title: "B", data: {} } as never,
      { id: "d3", title: "C", data: {} } as never,
    ]);
    const docs = useMBDocStore.getState().docs;
    expect(docs.map((d) => d.id)).toEqual(["d2", "d3"]);
  });

  it("persists under mbeditor.mbdocs", () => {
    useMBDocStore.getState().saveDocLocal({ id: "d1", title: "A", data: {} } as never);
    const raw = localStorage.getItem("mbeditor.mbdocs");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.docs[0].id).toBe("d1");
  });
});
