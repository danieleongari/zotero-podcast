let zoteroPodcastPreferencesInitialized = false;

function podcastAddon() {
  return Zotero.PodcastAddon;
}

function setPodcastStatus(id, message, isError = false) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message || "";
  element.style.color = isError ? "#b3261e" : "";
}

async function initZoteroPodcastPreferences() {
  if (zoteroPodcastPreferencesInitialized) return;
  zoteroPodcastPreferencesInitialized = true;

  const apiInput = document.getElementById("zotero-podcast-api-key");
  const clearButton = document.getElementById("zotero-podcast-key-clear");
  const testButton = document.getElementById("zotero-podcast-key-test");
  const outputInput = document.getElementById("zotero-podcast-output-directory");
  const browseButton = document.getElementById("zotero-podcast-output-browse");
  const outputTestButton = document.getElementById("zotero-podcast-output-test");
  if (
    !apiInput ||
    !clearButton ||
    !testButton ||
    !outputInput ||
    !browseButton ||
    !outputTestButton
  ) {
    return;
  }

  apiInput.value = podcastAddon().getAPIKey();
  outputInput.value = podcastAddon().settings.outputDirectory;

  apiInput.addEventListener("change", () => {
    podcastAddon().setAPIKey(String(apiInput.value || ""));
    setPodcastStatus("zotero-podcast-key-status", "API key saved securely.");
  });

  clearButton.addEventListener("command", () => {
    podcastAddon().clearAPIKey();
    apiInput.value = "";
    setPodcastStatus("zotero-podcast-key-status", "API key cleared.");
  });

  testButton.addEventListener("command", async () => {
    const value = String(apiInput.value || "").trim();
    if (!value) {
      setPodcastStatus("zotero-podcast-key-status", "Enter an API key first.", true);
      return;
    }
    podcastAddon().setAPIKey(value);
    testButton.disabled = true;
    setPodcastStatus("zotero-podcast-key-status", "Testing OpenAI connection…");
    try {
      await podcastAddon().testAPIKey(value);
      setPodcastStatus("zotero-podcast-key-status", "OpenAI connection successful.");
    } catch (error) {
      setPodcastStatus(
        "zotero-podcast-key-status",
        `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    } finally {
      testButton.disabled = false;
    }
  });

  const saveOutput = () => {
    podcastAddon().settings.outputDirectory = String(outputInput.value || "");
  };
  outputInput.addEventListener("change", saveOutput);

  browseButton.addEventListener("command", async () => {
    const selected = await podcastAddon().windows.browseOutputDirectory();
    if (!selected) return;
    outputInput.value = selected;
    saveOutput();
    setPodcastStatus("zotero-podcast-output-status", "Output directory selected.");
  });

  outputTestButton.addEventListener("command", async () => {
    saveOutput();
    outputTestButton.disabled = true;
    try {
      await podcastAddon().validateOutputDirectory(String(outputInput.value || ""));
      setPodcastStatus("zotero-podcast-output-status", "Folder is writable.");
    } catch (error) {
      setPodcastStatus(
        "zotero-podcast-output-status",
        error instanceof Error ? error.message : String(error),
        true,
      );
    } finally {
      outputTestButton.disabled = false;
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initZoteroPodcastPreferences, { once: true });
} else {
  void initZoteroPodcastPreferences();
}

window.initZoteroPodcastPreferences = initZoteroPodcastPreferences;
