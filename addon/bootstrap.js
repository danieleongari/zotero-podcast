var chromeHandle;

function install(_data, _reason) {}

async function startup({ rootURI }, _reason) {
  const aomStartup = Components.classes["@mozilla.org/addons/addon-manager-startup;1"].getService(
    Components.interfaces.amIAddonManagerStartup,
  );
  const manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "__addonRef__", rootURI + "content/"],
  ]);

  const ctx = { rootURI };
  ctx._globalThis = ctx;
  Services.scriptloader.loadSubScript(`${rootURI}/content/scripts/__addonRef__.js`, ctx);
  await Zotero.__addonInstance__.hooks.onStartup();
}

async function onMainWindowLoad({ window }, _reason) {
  await Zotero.__addonInstance__?.hooks.onMainWindowLoad(window);
}

async function onMainWindowUnload({ window }, _reason) {
  await Zotero.__addonInstance__?.hooks.onMainWindowUnload(window);
}

async function shutdown(_data, reason) {
  if (reason === APP_SHUTDOWN) {
    await Zotero.__addonInstance__?.hooks.onAppShutdown();
    return;
  }

  await Zotero.__addonInstance__?.hooks.onShutdown();
  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

function uninstall(_data, _reason) {}
