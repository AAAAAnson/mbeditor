// frontend/src/stores/mbdocStore.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { useMBDocStore } from "./mbdocStore";

describe("mbdocStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useMBDocStore.setState({ docs: [] });
  });

  it("saveDoc inserts a new doc", () => {
    useMBDocStore.getState().saveDoc({ id: "d1", title: "Demo", data: { blocks: [] } });
    expect(useMBDocStore.getState().docs).toHaveLength(1);
  });

  it("saveDoc upserts by id", () => {
    useMBDocStore.getState().saveDoc({ id: "d1", title: "A", data: {} });
    useMBDocStore.getState().saveDoc({ id: "d1", title: "B", data: {} });
    const docs = useMBDocStore.getState().docs;
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe("B");
  });

  it("getDoc returns the stored doc or null", () => {
    useMBDocStore.getState().saveDoc({ id: "d1", title: "A", data: {} });
    expect(useMBDocStore.getState().getDoc("d1")?.title).toBe("A");
    expect(useMBDocStore.getState().getDoc("missing")).toBeNull();
  });

  it("deleteDoc removes by id", () => {
    useMBDocStore.getState().saveDoc({ id: "d1", title: "A", data: {} });
    useMBDocStore.getState().deleteDoc("d1");
    expect(useMBDocStore.getState().docs).toHaveLength(0);
  });

  it("persists under mbeditor.mbdocs", () => {
    useMBDocStore.getState().saveDoc({ id: "d1", title: "A", data: {} });
    const raw = localStorage.getItem("mbeditor.mbdocs");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.docs[0].id).toBe("d1");
  });
});
