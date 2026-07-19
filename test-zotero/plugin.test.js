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

  it("renders the localized collection-menu label", async function () {
    const doc = Zotero.getMainWindow().document;
    const popup = doc.createXULElement("menupopup");
    doc.documentElement.append(popup);
    try {
      Zotero.MenuManager.updateMenuPopup(popup, "main/library/collection", {
        getContext: () => ({ collectionTreeRow: null }),
      });
      await doc.l10n.translateFragment(popup);
      const menuitem = popup.querySelector('[data-l10n-id="zotero-podcast-convert"]');
      assert.exists(menuitem);
      assert.equal(menuitem.label, "Convert to podcast");
    } finally {
      popup.remove();
    }
  });

  it("uses the Zotero 9 asynchronous credential manager", async function () {
    await Zotero.PodcastAddon.setAPIKey("test-key");
    assert.equal(await Zotero.PodcastAddon.getAPIKey(), "test-key");
    await Zotero.PodcastAddon.clearAPIKey();
    assert.equal(await Zotero.PodcastAddon.getAPIKey(), "");
  });

  it("tests an API key through Zotero window web APIs", async function () {
    const win = Zotero.getMainWindow();
    const originalFetch = win.fetch;
    let authorization;
    win.fetch = async (_url, init) => {
      authorization = init.headers.Authorization;
      return new win.Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    try {
      await Zotero.PodcastAddon.testAPIKey("test-key");
      assert.equal(authorization, "Bearer test-key");
    } finally {
      win.fetch = originalFetch;
    }
  });

  it("renders the non-modal configuration window", async function () {
    const mainWindow = Zotero.getMainWindow();
    const originalViewAttachment = mainWindow.ZoteroPane.viewAttachment;
    let openedAttachmentID;
    mainWindow.ZoteroPane.viewAttachment = async (attachmentID) => {
      openedAttachmentID = attachmentID;
    };
    let win;
    try {
      await Zotero.PodcastAddon.windows.openConfiguration({
        sources: [
          {
            sourceID: "D1",
            attachmentKey: "TEST",
            attachmentID: 1,
            libraryID: 1,
            title: "SI",
            filename: "integration-test.pdf",
            parentTitle: "Integration test document",
            contentType: "application/pdf",
            textCharacters: 17,
            text: "Integration test.",
          },
        ],
        skipped: [],
      });
      win = Zotero.PodcastAddon.windows.configurationWindow;
      assert.exists(win);
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (win.location.href.includes("configuration.xhtml") && win.document.body?.textContent) {
          break;
        }
        await Zotero.Promise.delay(100);
      }
      const rendered = win.document.body?.textContent || "";
      assert.include(rendered, "Zotero Podcast", `Window URL: ${win.location.href}`);
      assert.include(rendered, "Integration test document", `Window URL: ${win.location.href}`);
      assert.include(rendered, "Attachment: SI", `Window URL: ${win.location.href}`);
      assert.include(rendered, "integration-test.pdf", `Window URL: ${win.location.href}`);
      const documentsCard = win.document.querySelector(".documents-card");
      const firstFormCard = win.document.querySelector(".card.two-column");
      assert.isTrue(
        Boolean(
          documentsCard.compareDocumentPosition(firstFormCard) &
          win.Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      );
      const voiceCard = win.document.querySelector(".voice-card");
      const summaryCard = win.document.querySelector(".summary-card");
      assert.isTrue(
        Boolean(
          voiceCard.compareDocumentPosition(summaryCard) & win.Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      );
      const voicePreview = win.document.getElementById("voice-preview");
      const speakerList = win.document.getElementById("speaker-list");
      assert.exists(voicePreview);
      assert.include(voicePreview.currentSrc, "voice-samples-6-voices.mp3");
      assert.isTrue(
        Boolean(
          voicePreview.compareDocumentPosition(speakerList) & win.Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      );
      const sourceCheckbox = win.document.querySelector(".source-checkbox");
      const openSource = win.document.querySelector(".source-open");
      const submit = win.document.getElementById("submit");
      assert.isTrue(sourceCheckbox.checked);
      assert.exists(openSource);
      openSource.click();
      await Zotero.Promise.delay(20);
      assert.equal(openedAttachmentID, 1);
      assert.isTrue(sourceCheckbox.checked);
      sourceCheckbox.checked = false;
      sourceCheckbox.dispatchEvent(new win.Event("change", { bubbles: true }));
      assert.include(win.document.getElementById("source-summary").textContent, "0 of 1");
      assert.isTrue(submit.disabled);
      sourceCheckbox.checked = true;
      sourceCheckbox.dispatchEvent(new win.Event("change", { bubbles: true }));
      assert.include(win.document.getElementById("source-summary").textContent, "1 of 1");
      const select = win.document.getElementById("summary-model");
      const customSelects = win.document.querySelectorAll(".custom-select");
      assert.isTrue(select.hidden);
      assert.isAtLeast(customSelects.length, 6);
      const presetControl = win.document
        .getElementById("preset-select")
        .nextElementSibling.querySelector(".custom-select-toggle");
      presetControl.click();
      const presetMenu = presetControl.nextElementSibling;
      const presetOptions = [...presetMenu.querySelectorAll(".custom-select-option")];
      assert.isFalse(presetMenu.hidden);
      assert.equal(presetOptions.length, 3);
      assert.notEqual(win.getComputedStyle(presetMenu).backgroundColor, "rgba(0, 0, 0, 0)");
      assert.isAtLeast(presetControl.getBoundingClientRect().height, 29);
      for (let index = 1; index < presetOptions.length; index += 1) {
        assert.isAtMost(
          presetOptions[index - 1].getBoundingClientRect().bottom,
          presetOptions[index].getBoundingClientRect().top,
        );
      }
      presetOptions[2].click();
      assert.equal(win.document.getElementById("preset-select").value, "critical-roundtable");
      assert.equal(presetControl.textContent, "Critical Roundtable");
    } finally {
      mainWindow.ZoteroPane.viewAttachment = originalViewAttachment;
      win?.close();
    }
  });

  it("ships all three built-in presets", function () {
    const presets = Zotero.PodcastAddon.settings.getPresets();
    assert.deepEqual(
      presets.slice(0, 3).map((preset) => preset.name),
      ["Quick Solo Brief", "Scholarly Deep Dive", "Critical Roundtable"],
    );
  });
});
