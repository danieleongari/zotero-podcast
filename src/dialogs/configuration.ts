import { clonePreset, slugifyPresetName, validatePreset } from "../presets";
import type {
  ConfigurationController,
  LLMModel,
  PodcastPresetV1,
  Speaker,
  TTSModel,
  Voice,
} from "../types";
import { LLM_MODELS, TTS_MODELS, VOICES } from "../types";

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing configuration control: ${id}`);
  return value as T;
}

const controller = (window.arguments?.[0] as any)?.wrappedJSObject as
  ConfigurationController | undefined;
let presets: PodcastPresetV1[] = [];
let loadedPreset: PodcastPresetV1;
let speakerDrafts: Speaker[] = [];

function option(value: string, label = value): HTMLOptionElement {
  const result = document.createElement("option");
  result.value = value;
  result.textContent = label;
  return result;
}

function fillSelect(select: HTMLSelectElement, values: readonly string[]): void {
  select.replaceChildren(...values.map((value) => option(value)));
}

function populatePresetSelect(selectedID: string): void {
  const select = element<HTMLSelectElement>("preset-select");
  select.replaceChildren();
  const builtIns = document.createElement("optgroup");
  builtIns.label = "Built-in";
  const custom = document.createElement("optgroup");
  custom.label = "Custom";
  for (const preset of presets) {
    (preset.builtIn ? builtIns : custom).append(option(preset.id, preset.name));
  }
  select.append(builtIns);
  if (custom.children.length) select.append(custom);
  select.value = presets.some((preset) => preset.id === selectedID)
    ? selectedID
    : "scholarly-deep-dive";
}

function snapshotSpeakers(): void {
  const rows = [...document.querySelectorAll<HTMLElement>(".speaker-row")];
  speakerDrafts = rows.map((row) => ({
    name:
      (row.querySelector(".speaker-name") as HTMLInputElement | null)?.value.trim() || "Speaker",
    voice: ((row.querySelector(".speaker-voice") as HTMLSelectElement | null)?.value ||
      "alloy") as Voice,
  }));
}

function renderSpeakers(count: number): void {
  const list = element<HTMLDivElement>("speaker-list");
  list.replaceChildren();
  for (let index = 0; index < count; index += 1) {
    const speaker = speakerDrafts[index] || {
      name: index === 0 ? "Host" : `Speaker ${index + 1}`,
      voice: VOICES[index] || "alloy",
    };
    const row = document.createElement("div");
    row.className = "speaker-row";
    const label = document.createElement("strong");
    label.textContent = `Speaker ${index + 1}`;
    const name = document.createElement("input");
    name.className = "speaker-name";
    name.type = "text";
    name.maxLength = 50;
    name.value = speaker.name;
    name.setAttribute("aria-label", `Speaker ${index + 1} display name`);
    const voice = document.createElement("select");
    voice.className = "speaker-voice";
    voice.setAttribute("aria-label", `Speaker ${index + 1} OpenAI voice`);
    fillSelect(voice, VOICES);
    voice.value = speaker.voice;
    for (const input of [name, voice]) input.addEventListener("change", updateCost);
    row.append(label, name, voice);
    list.append(row);
  }
  snapshotSpeakers();
}

function loadPreset(preset: PodcastPresetV1): void {
  loadedPreset = clonePreset(preset);
  speakerDrafts = clonePreset(preset).speakers;
  element<HTMLInputElement>("preset-name").value = preset.name;
  element<HTMLSelectElement>("summary-model").value = preset.summaryModel;
  element<HTMLSelectElement>("podcast-model").value = preset.podcastModel;
  element<HTMLSelectElement>("tts-model").value = preset.ttsModel;
  element<HTMLInputElement>("target-minutes").value = String(preset.targetMinutes);
  element<HTMLTextAreaElement>("summary-prompt").value = preset.summaryPrompt;
  element<HTMLTextAreaElement>("podcast-prompt").value = preset.podcastPrompt;
  element<HTMLSelectElement>("speaker-count").value = String(preset.speakers.length);
  renderSpeakers(preset.speakers.length);
  element<HTMLButtonElement>("preset-delete").disabled = Boolean(preset.builtIn);
  updateCost();
}

function readPreset(options: { newID?: boolean } = {}): PodcastPresetV1 {
  snapshotSpeakers();
  const currentID = element<HTMLSelectElement>("preset-select").value;
  const name = element<HTMLInputElement>("preset-name").value.trim();
  return {
    schemaVersion: 1,
    id: options.newID ? slugifyPresetName(name) : currentID,
    name,
    builtIn: options.newID ? false : loadedPreset.builtIn,
    summaryPrompt: element<HTMLTextAreaElement>("summary-prompt").value.trim(),
    podcastPrompt: element<HTMLTextAreaElement>("podcast-prompt").value.trim(),
    summaryModel: element<HTMLSelectElement>("summary-model").value as LLMModel,
    podcastModel: element<HTMLSelectElement>("podcast-model").value as LLMModel,
    targetMinutes: Number(element<HTMLInputElement>("target-minutes").value),
    ttsModel: element<HTMLSelectElement>("tts-model").value as TTSModel,
    speakers: speakerDrafts,
  };
}

function showError(message = ""): void {
  const error = element<HTMLDivElement>("form-error");
  error.textContent = message;
  error.hidden = !message;
}

function money(value: number): string {
  return `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
}

function updateCost(): void {
  if (!controller) return;
  const preset = readPreset();
  if (!validatePreset(preset)) return;
  const cost = controller.estimate(preset);
  const values = [
    ["Summary LLM", money(cost.summary)],
    ["Podcast LLM", money(cost.podcast)],
    ["TTS", money(cost.tts)],
    ["Expected total", money(cost.expected)],
    ["Upper bound", money(cost.upperBound)],
  ];
  const grid = element<HTMLDivElement>("cost-grid");
  grid.replaceChildren(
    ...values.map(([label, value]) => {
      const item = document.createElement("div");
      item.className = "cost-item";
      const heading = document.createElement("strong");
      heading.textContent = label;
      const amount = document.createElement("span");
      amount.textContent = value;
      item.append(heading, amount);
      return item;
    }),
  );
}

function refreshAfterSave(next: PodcastPresetV1[]): void {
  presets = next;
  const custom = [...presets]
    .reverse()
    .find(
      (preset) =>
        !preset.builtIn && preset.name === element<HTMLInputElement>("preset-name").value.trim(),
    );
  const selectedID = custom?.id || "scholarly-deep-dive";
  populatePresetSelect(selectedID);
  loadPreset(presets.find((preset) => preset.id === selectedID) || presets[0]);
}

async function initialize(): Promise<void> {
  if (!controller) {
    showError("The Zotero Podcast controller is unavailable.");
    return;
  }
  presets = controller.presets.map(clonePreset);
  fillSelect(element<HTMLSelectElement>("summary-model"), LLM_MODELS);
  fillSelect(element<HTMLSelectElement>("podcast-model"), LLM_MODELS);
  fillSelect(element<HTMLSelectElement>("tts-model"), TTS_MODELS);
  populatePresetSelect(controller.lastPresetID);
  const initial =
    presets.find((preset) => preset.id === controller.lastPresetID) ||
    presets.find((preset) => preset.id === "scholarly-deep-dive") ||
    presets[0];
  loadPreset(initial);
  element<HTMLInputElement>("output-directory").value = controller.outputDirectory;
  element<HTMLDivElement>("api-warning").hidden = controller.hasAPIKey;
  element<HTMLButtonElement>("submit").disabled = !controller.hasAPIKey;

  const sourceList = element<HTMLOListElement>("source-list");
  sourceList.replaceChildren(
    ...controller.preview.sources.map((source) => {
      const item = document.createElement("li");
      item.textContent = `${source.sourceID} ${source.parentTitle || source.title} — ${source.contentType}, ${source.textCharacters.toLocaleString()} characters`;
      return item;
    }),
  );
  element<HTMLDivElement>("source-summary").textContent =
    `${controller.preview.sources.length} document attachment${controller.preview.sources.length === 1 ? "" : "s"} ready; ` +
    `${controller.preview.sources.reduce((sum, source) => sum + source.textCharacters, 0).toLocaleString()} extracted characters.`;
  const skippedList = element<HTMLUListElement>("skipped-list");
  skippedList.replaceChildren(
    ...controller.preview.skipped.map((reason) => {
      const item = document.createElement("li");
      item.textContent = reason;
      return item;
    }),
  );
  element<HTMLDetailsElement>("skipped-details").hidden = !controller.preview.skipped.length;

  element<HTMLSelectElement>("preset-select").addEventListener("change", (event) => {
    const id = (event.target as HTMLSelectElement).value;
    const preset = presets.find((candidate) => candidate.id === id);
    if (preset) loadPreset(preset);
  });
  element<HTMLSelectElement>("speaker-count").addEventListener("change", (event) => {
    snapshotSpeakers();
    renderSpeakers(Number((event.target as HTMLSelectElement).value));
    updateCost();
  });
  for (const id of [
    "summary-model",
    "podcast-model",
    "tts-model",
    "target-minutes",
    "summary-prompt",
    "podcast-prompt",
  ]) {
    element<HTMLElement>(id).addEventListener("change", updateCost);
  }

  element<HTMLButtonElement>("preset-save").addEventListener("click", () => {
    try {
      const preset = readPreset();
      if (!validatePreset(preset)) throw new Error("Complete all preset fields before saving.");
      refreshAfterSave(controller.savePreset(preset));
      showError();
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  });
  element<HTMLButtonElement>("preset-save-as").addEventListener("click", () => {
    try {
      const preset = readPreset({ newID: true });
      if (!validatePreset(preset)) throw new Error("Complete all preset fields before saving.");
      refreshAfterSave(controller.savePreset(preset));
      showError();
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  });
  element<HTMLButtonElement>("preset-reload").addEventListener("click", () => {
    const selected = presets.find(
      (preset) => preset.id === element<HTMLSelectElement>("preset-select").value,
    );
    if (selected) loadPreset(selected);
    showError();
  });
  element<HTMLButtonElement>("preset-delete").addEventListener("click", () => {
    try {
      presets = controller.deletePreset(element<HTMLSelectElement>("preset-select").value);
      populatePresetSelect("scholarly-deep-dive");
      loadPreset(presets.find((preset) => preset.id === "scholarly-deep-dive") || presets[0]);
      showError();
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  });
  element<HTMLButtonElement>("output-browse").addEventListener("click", async () => {
    const selected = await controller.browseOutputDirectory();
    if (selected) element<HTMLInputElement>("output-directory").value = selected;
  });
  element<HTMLButtonElement>("cancel").addEventListener("click", () => window.close());
  element<HTMLButtonElement>("submit").addEventListener("click", async () => {
    const submit = element<HTMLButtonElement>("submit");
    submit.disabled = true;
    showError();
    try {
      const preset = readPreset();
      if (!validatePreset(preset)) throw new Error("Complete all configuration fields.");
      await controller.submit({
        name: element<HTMLInputElement>("podcast-name").value,
        preset,
        outputDirectory: element<HTMLInputElement>("output-directory").value,
      });
      window.close();
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
      submit.disabled = false;
    }
  });
  updateCost();
}

window.ZoteroPodcastConfiguration = { initialize };
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void initialize(), { once: true });
} else {
  void initialize();
}
