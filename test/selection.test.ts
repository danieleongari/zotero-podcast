import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionService } from "../src/services/selection";

interface FakeItemOptions {
  id: number;
  key: string;
  regular?: boolean;
  contentType?: string;
  parentItemID?: number;
  attachments?: number[];
  title: string;
  filename?: string;
  text?: string;
}

function fakeItem(options: FakeItemOptions): any {
  return {
    id: options.id,
    key: options.key,
    libraryID: 1,
    parentItemID: options.parentItemID || false,
    attachmentFilename: options.filename || options.title,
    attachmentContentType: options.contentType || "",
    text: options.text || "",
    isRegularItem: () => Boolean(options.regular),
    isAttachment: () => !options.regular,
    isFileAttachment: () => !options.regular,
    getAttachments: () => options.attachments || [],
    getField: (field: string) =>
      field === "title" ? options.title : field === "date" ? "2026-02-03" : "",
    getCreators: () => [{ firstName: "Ada", lastName: "Lovelace" }],
  };
}

afterEach(() => {
  delete (globalThis as any).Zotero;
});

describe("Zotero selection integration", () => {
  it("recurses collections, includes all supported attachments, and de-duplicates by item key", async () => {
    const paper = fakeItem({
      id: 1,
      key: "PAPER",
      regular: true,
      title: "Research paper",
      attachments: [10, 11, 12],
    });
    const duplicatePaper = paper;
    const pdf = fakeItem({
      id: 10,
      key: "PDF",
      title: "PDF",
      filename: "paper.pdf",
      contentType: "application/pdf",
      parentItemID: 1,
      text: "PDF full text",
    });
    const epub = fakeItem({
      id: 11,
      key: "EPUB",
      title: "SI",
      filename: "book.epub",
      contentType: "application/epub+zip",
      parentItemID: 1,
      text: "EPUB full text",
    });
    const unsupported = fakeItem({
      id: 12,
      key: "IMAGE",
      title: "figure.png",
      contentType: "image/png",
      parentItemID: 1,
    });
    const itemByID = new Map([
      [1, paper],
      [10, pdf],
      [11, epub],
      [12, unsupported],
    ]);
    const childCollection = {
      getChildItems: () => [duplicatePaper, pdf],
      getChildCollections: () => [],
    };
    const rootCollection = {
      getChildItems: () => [paper],
      getChildCollections: () => [childCollection],
    };
    const indexItems = vi.fn(async () => undefined);

    (globalThis as any).Zotero = {
      FullText: {
        isCachedMIMEType: (contentType: string) =>
          ["application/pdf", "application/epub+zip", "text/html"].includes(contentType),
        indexItems,
        getItemCacheFile: (item: any) => ({ exists: () => true, item }),
      },
      Items: {
        getAsync: async (ids: number[]) => ids.map((id) => itemByID.get(id)),
        get: (id: number) => itemByID.get(id),
      },
      File: {
        getContentsAsync: async (file: any) => file.item.text,
      },
    };

    const preview = await new SelectionService().fromCollection(rootCollection as any);

    expect(preview.sources).toHaveLength(2);
    expect(preview.sources.map((source) => source.sourceID)).toEqual(["[D1]", "[D2]"]);
    expect(preview.sources.map((source) => source.attachmentKey)).toEqual(["PDF", "EPUB"]);
    expect(preview.sources.map((source) => source.title)).toEqual(["PDF", "SI"]);
    expect(preview.sources.map((source) => source.filename)).toEqual(["paper.pdf", "book.epub"]);
    expect(preview.sources[0].parentTitle).toBe("Research paper");
    expect(preview.sources[0].creators).toBe("Ada Lovelace");
    expect(indexItems).toHaveBeenCalledTimes(2);
    expect(preview.skipped).toContain("figure.png — unsupported attachment type image/png");
  });
});
