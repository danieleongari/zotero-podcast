import { config } from "../package.json";
import Addon from "./addon";

if (!(Zotero as any)[config.addonInstance]) {
  _globalThis.addon = new Addon();
  (Zotero as any)[config.addonInstance] = _globalThis.addon;
}
