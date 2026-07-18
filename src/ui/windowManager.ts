import { estimateCost } from "../pricing";
import { clonePreset, validatePreset } from "../presets";
import type {
  ConfigurationController,
  ConfigurationSubmission,
  PodcastJobRequest,
  ProgressController,
  ProgressState,
  SelectionPreview,
} from "../types";
import { CredentialService } from "../services/credentials";
import { JobManager } from "../services/jobManager";
import { SelectionService } from "../services/selection";
import { SettingsService } from "../services/settings";
import { validateOutputDirectory } from "../services/output";

function alert(title: string, message: string): void {
  (Services as any).prompt.alert(Zotero.getMainWindow(), title, message);
}

class ProgressHost {
  private window?: Window;
  private ready = false;
  private latest: ProgressState = {
    stage: "preparing",
    percent: 0,
    message: "Preparing podcast…",
  };

  constructor(rootURI: string, controller: ProgressController) {
    this.window = (Services as any).ww.openWindow(
      Zotero.getMainWindow(),
      `${rootURI}content/dialogs/progress.xhtml`,
      "zotero-podcast-progress",
      "chrome,dialog=no,resizable,centerscreen,width=520,height=390",
      { wrappedJSObject: controller },
    );
    this.window?.addEventListener(
      "load",
      () => {
        this.ready = true;
        this.window?.ZoteroPodcastProgress?.update(this.latest);
      },
      { once: true },
    );
  }

  update(state: ProgressState): void {
    this.latest = state;
    if (!this.ready || !this.window || this.window.closed) return;
    try {
      this.window.ZoteroPodcastProgress?.update(state);
    } catch (error) {
      Zotero.debug(`Zotero Podcast: progress window update skipped: ${String(error)}`);
    }
  }
}

export class WindowManager {
  private configurationWindow?: Window;

  constructor(
    private readonly rootURI: string,
    private readonly selection: SelectionService,
    private readonly settings: SettingsService,
    private readonly credentials: CredentialService,
    private readonly jobs: JobManager,
  ) {}

  async openForItems(items: Zotero.Item[]): Promise<void> {
    if (!this.ensureIdle()) return;
    await this.prepare(() => this.selection.fromItems(items));
  }

  async openForCollection(collection: Zotero.Collection): Promise<void> {
    if (!this.ensureIdle()) return;
    await this.prepare(() => this.selection.fromCollection(collection));
  }

  async browseOutputDirectory(): Promise<string | null> {
    const picker = (Components as any).classes["@mozilla.org/filepicker;1"].createInstance(
      (Components as any).interfaces.nsIFilePicker,
    );
    const mainWindow = Zotero.getMainWindow() as any;
    picker.init(
      mainWindow.browsingContext,
      "Choose podcast output directory",
      (Components as any).interfaces.nsIFilePicker.modeGetFolder,
    );
    const result = await new Promise<number>((resolve) => picker.open(resolve));
    if (
      result !== (Components as any).interfaces.nsIFilePicker.returnOK &&
      result !== (Components as any).interfaces.nsIFilePicker.returnReplace
    ) {
      return null;
    }
    return String(picker.file?.path || "") || null;
  }

  private ensureIdle(): boolean {
    if (this.jobs.isRunning) {
      alert(
        "Zotero Podcast",
        "A podcast is already being generated. Wait for it to finish or cancel the current job.",
      );
      return false;
    }
    return true;
  }

  private async prepare(loader: () => Promise<SelectionPreview>): Promise<void> {
    const progress = new (Zotero as any).ProgressWindow({ closeOnClick: false });
    progress.changeHeadline("Zotero Podcast");
    const line = new progress.ItemProgress(
      `${this.rootURI}content/icons/podcast.svg`,
      "Reading selected full text…",
    );
    progress.show();
    try {
      const preview = await loader();
      line.setProgress(100);
      progress.startCloseTimer(800);
      if (!preview.sources.length) {
        const reasons = preview.skipped.slice(0, 8).join("\n");
        alert(
          "Zotero Podcast",
          `No supported full text could be extracted.${reasons ? `\n\n${reasons}` : ""}`,
        );
        return;
      }
      this.openConfiguration(preview);
    } catch (error) {
      progress.close();
      const message = error instanceof Error ? error.message : String(error);
      alert("Zotero Podcast", `Could not prepare the selection.\n\n${message}`);
    }
  }

  private openConfiguration(preview: SelectionPreview): void {
    if (this.configurationWindow && !this.configurationWindow.closed) {
      this.configurationWindow.focus();
      return;
    }

    const controller: ConfigurationController = {
      preview,
      presets: this.settings.getPresets(),
      lastPresetID: this.settings.lastPresetID,
      outputDirectory: this.settings.outputDirectory,
      hasAPIKey: this.credentials.has(),
      estimate: (preset) => estimateCost(preview.sources, preset),
      savePreset: (preset) => this.settings.savePreset(preset),
      deletePreset: (id) => this.settings.deletePreset(id),
      browseOutputDirectory: () => this.browseOutputDirectory(),
      submit: (submission) => this.submit(preview, submission),
    };
    this.configurationWindow = (Services as any).ww.openWindow(
      Zotero.getMainWindow(),
      `${this.rootURI}content/dialogs/configuration.xhtml`,
      "zotero-podcast-configuration",
      "chrome,dialog=no,resizable,centerscreen,width=1000,height=820",
      { wrappedJSObject: controller },
    );
    this.configurationWindow?.addEventListener(
      "unload",
      () => {
        this.configurationWindow = undefined;
      },
      { once: true },
    );
  }

  private async submit(
    preview: SelectionPreview,
    submission: ConfigurationSubmission,
  ): Promise<void> {
    if (!this.ensureIdle()) throw new Error("A podcast is already being generated.");
    if (!submission.name.trim()) throw new Error("Enter a podcast name.");
    if (!validatePreset(submission.preset)) throw new Error("The configuration is invalid.");
    if (!this.credentials.has()) {
      throw new Error("Add an OpenAI API key in Zotero Podcast settings first.");
    }
    await validateOutputDirectory(submission.outputDirectory);
    this.settings.outputDirectory = submission.outputDirectory;
    this.settings.lastPresetID = submission.preset.id;

    const request: PodcastJobRequest = {
      name: submission.name.trim(),
      attachmentKeys: preview.sources.map((source) => source.attachmentKey),
      sourceMetadata: preview.sources.map(
        ({ text: _text, attachmentID: _attachmentID, ...source }) => source,
      ),
      presetSnapshot: clonePreset(submission.preset),
      outputDirectory: submission.outputDirectory,
      sources: preview.sources,
    };
    const outputDirectory = submission.outputDirectory;
    const progressController: ProgressController = {
      cancel: () => this.jobs.cancel(),
      openOutputDirectory: async () => {
        await Zotero.File.reveal(outputDirectory);
      },
    };
    const host = new ProgressHost(this.rootURI, progressController);
    void this.jobs
      .start(request, (state) => host.update(state))
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          Zotero.logError(error);
        }
      });
  }
}
