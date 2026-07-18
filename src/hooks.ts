import { config } from "../package.json";

async function onStartup() {
  Zotero.PreferencePanes.register({
    pluginID: config.addonID,
    src: `${rootURI}preferences.xhtml`,
    scripts: [`${rootURI}preferences.js`],
    label: "Zotero Podcast",
    image: `${rootURI}content/icons/podcast.svg`,
  });
  addon.menus.register();
  addon.data.initialized = true;
}

async function onMainWindowLoad(_win: _ZoteroTypes.MainWindow) {}

async function onMainWindowUnload(_win: _ZoteroTypes.MainWindow) {}

async function onShutdown() {
  addon.jobs.cancel();
  addon.menus.unregister();
  addon.data.alive = false;
  delete (Zotero as any)[addon.data.config.addonInstance];
}

async function onAppShutdown() {
  addon.jobs.cancel();
}

export default {
  onStartup,
  onMainWindowLoad,
  onMainWindowUnload,
  onShutdown,
  onAppShutdown,
};
