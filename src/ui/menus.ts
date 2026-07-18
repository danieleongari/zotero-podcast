import { ADDON_ID } from "../constants";
import { SelectionService } from "../services/selection";
import { WindowManager } from "./windowManager";

const ITEM_MENU_ID = "zotero-podcast-item-menu";
const COLLECTION_MENU_ID = "zotero-podcast-collection-menu";

export class MenuService {
  constructor(
    private readonly selection: SelectionService,
    private readonly windows: WindowManager,
  ) {}

  register(): void {
    Zotero.MenuManager.registerMenu({
      menuID: ITEM_MENU_ID,
      pluginID: ADDON_ID,
      target: "main/library/item",
      menus: [
        {
          menuType: "menuitem",
          l10nID: "zotero-podcast-convert",
          icon: "chrome://zotero-podcast/content/icons/podcast.svg",
          onShowing: (_event, context) => {
            context.setVisible(this.selection.supportsAny(context.items));
          },
          onCommand: (_event, context) => {
            void this.windows.openForItems(context.items || []);
          },
        },
      ],
    });

    Zotero.MenuManager.registerMenu({
      menuID: COLLECTION_MENU_ID,
      pluginID: ADDON_ID,
      target: "main/library/collection",
      menus: [
        {
          menuType: "menuitem",
          l10nID: "zotero-podcast-convert",
          icon: "chrome://zotero-podcast/content/icons/podcast.svg",
          onShowing: (_event, context) => {
            const row = context.collectionTreeRow as any;
            context.setVisible(
              Boolean(row?.isCollection?.() && row.ref instanceof Zotero.Collection),
            );
          },
          onCommand: (_event, context) => {
            const row = context.collectionTreeRow as any;
            if (row?.ref instanceof Zotero.Collection) {
              void this.windows.openForCollection(row.ref);
            }
          },
        },
      ],
    });
  }

  unregister(): void {
    Zotero.MenuManager.unregisterMenu(ITEM_MENU_ID);
    Zotero.MenuManager.unregisterMenu(COLLECTION_MENU_ID);
  }
}
