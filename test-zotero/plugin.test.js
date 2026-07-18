describe("Zotero Podcast integration", function () {
  it("starts the plugin and registers its services", function () {
    const plugin = Zotero.PodcastAddon;
    assert.isTrue(plugin.data.initialized);
    assert.isTrue(plugin.data.alive);
    assert.isFunction(plugin.windows.openForItems);
    assert.isFunction(plugin.jobs.start);
  });

  it("supports the Zotero 9 context-menu lifecycle", function () {
    assert.doesNotThrow(() => {
      Zotero.PodcastAddon.menus.unregister();
      Zotero.PodcastAddon.menus.register();
    });
  });

  it("ships all three built-in presets", function () {
    const presets = Zotero.PodcastAddon.settings.getPresets();
    assert.deepEqual(
      presets.slice(0, 3).map((preset) => preset.name),
      ["Quick Solo Brief", "Scholarly Deep Dive", "Critical Roundtable"],
    );
  });
});
