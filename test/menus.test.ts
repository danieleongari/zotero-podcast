import { afterEach, describe, expect, it, vi } from "vitest";
import { MenuService } from "../src/ui/menus";

afterEach(() => {
  delete (globalThis as any).Zotero;
});

describe("Zotero menu integration", () => {
  it("registers and unregisters Zotero 9 item and collection menu targets", () => {
    const registerMenu = vi.fn((options: any) => String(options.menuID));
    const unregisterMenu = vi.fn((_menuID: string) => true);
    (globalThis as any).Zotero = {
      MenuManager: { registerMenu, unregisterMenu },
    };
    const selection = { supportsAny: vi.fn(() => true) };
    const windows = {
      openForItems: vi.fn(),
      openForCollection: vi.fn(),
    };
    const service = new MenuService(selection as any, windows as any);

    service.register();

    expect(registerMenu).toHaveBeenCalledTimes(2);
    expect(registerMenu.mock.calls.map(([options]) => options.target)).toEqual([
      "main/library/item",
      "main/library/collection",
    ]);
    expect(registerMenu.mock.calls[0][0].menus[0].l10nID).toBe("zotero-podcast-convert");

    service.unregister();
    expect(unregisterMenu).toHaveBeenCalledWith("zotero-podcast-item-menu");
    expect(unregisterMenu).toHaveBeenCalledWith("zotero-podcast-collection-menu");
  });
});
