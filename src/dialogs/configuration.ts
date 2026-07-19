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
let hasAPIKey = false;

interface CustomSelectState {
  wrapper: HTMLDivElement;
  button: HTMLButtonElement;
  menu: HTMLDivElement;
}

const customSelects = new Map<HTMLSelectElement, CustomSelectState>();

function option(value: string, label = value): HTMLOptionElement {
  const result = document.createElement("option");
  result.value = value;
  result.textContent = label;
  return result;
}

function closeCustomSelect(select: HTMLSelectElement): void {
  const state = customSelects.get(select);
  if (!state) return;
  state.menu.hidden = true;
  state.button.setAttribute("aria-expanded", "false");
}

function closeOtherCustomSelects(current?: HTMLSelectElement): void {
  for (const select of customSelects.keys()) {
    if (select !== current) closeCustomSelect(select);
  }
}

function customOptionButtons(state: CustomSelectState): HTMLButtonElement[] {
  return [...state.menu.querySelectorAll<HTMLButtonElement>(".custom-select-option")];
}

function syncCustomSelect(select: HTMLSelectElement): void {
  const state = customSelects.get(select);
  if (!state) return;
  const selected = select.selectedOptions[0];
  state.button.textContent = selected?.textContent || "Choose…";
  state.button.disabled = select.disabled;
  for (const button of customOptionButtons(state)) {
    const isSelected = button.dataset.value === select.value;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-selected", String(isSelected));
  }
}

function selectCustomOption(select: HTMLSelectElement, value: string): void {
  select.value = value;
  syncCustomSelect(select);
  closeCustomSelect(select);
  select.dispatchEvent(new Event("change", { bubbles: true }));
  customSelects.get(select)?.button.focus();
}

function rebuildCustomSelectMenu(select: HTMLSelectElement): void {
  const state = customSelects.get(select);
  if (!state) return;
  state.menu.replaceChildren();

  const addOption = (entry: HTMLOptionElement): void => {
    const button = document.createElement("button");
    button.className = "custom-select-option";
    button.type = "button";
    button.role = "option";
    button.dataset.value = entry.value;
    button.textContent = entry.textContent;
    button.disabled = entry.disabled;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectCustomOption(select, entry.value);
    });
    state.menu.append(button);
  };

  for (const child of select.children) {
    if (child instanceof HTMLOptionElement) {
      addOption(child);
      continue;
    }
    if (child instanceof HTMLOptGroupElement) {
      const group = document.createElement("div");
      group.className = "custom-select-group";
      group.textContent = child.label;
      state.menu.append(group);
      for (const entry of child.querySelectorAll("option")) addOption(entry);
    }
  }
  syncCustomSelect(select);
}

function moveCustomOptionFocus(state: CustomSelectState, direction: number): void {
  const options = customOptionButtons(state).filter((entry) => !entry.disabled);
  if (!options.length) return;
  const active = options.indexOf(document.activeElement as HTMLButtonElement);
  const selected = options.findIndex((entry) => entry.classList.contains("selected"));
  const start = active >= 0 ? active : selected >= 0 ? selected : 0;
  options[(start + direction + options.length) % options.length].focus();
}

function openCustomSelect(select: HTMLSelectElement): void {
  const state = customSelects.get(select);
  if (!state || select.disabled) return;
  closeOtherCustomSelects(select);
  state.menu.hidden = false;
  state.button.setAttribute("aria-expanded", "true");
  const selected = state.menu.querySelector<HTMLButtonElement>(".custom-select-option.selected");
  (selected || customOptionButtons(state)[0])?.focus();
}

function enhanceSelect(select: HTMLSelectElement): void {
  if (customSelects.has(select)) {
    rebuildCustomSelectMenu(select);
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "custom-select";
  const button = document.createElement("button");
  button.className = "custom-select-toggle";
  button.type = "button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "custom-select-menu";
  menu.id = `${select.id || `custom-select-${customSelects.size + 1}`}-menu`;
  menu.role = "listbox";
  menu.hidden = true;
  button.setAttribute("aria-controls", menu.id);
  wrapper.append(button, menu);
  select.hidden = true;
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  select.after(wrapper);
  customSelects.set(select, { wrapper, button, menu });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (menu.hidden) openCustomSelect(select);
    else closeCustomSelect(select);
  });
  button.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openCustomSelect(select);
      if (event.key === "ArrowUp") {
        moveCustomOptionFocus(customSelects.get(select)!, -1);
      }
    }
  });
  menu.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCustomSelect(select);
      button.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveCustomOptionFocus(customSelects.get(select)!, event.key === "ArrowDown" ? 1 : -1);
    }
  });
  rebuildCustomSelectMenu(select);
}

function fillSelect(select: HTMLSelectElement, values: readonly string[]): void {
  select.replaceChildren(...values.map((value) => option(value)));
  if (select.isConnected) enhanceSelect(select);
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
  enhanceSelect(select);
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
    enhanceSelect(voice);
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
  for (const select of document.querySelectorAll<HTMLSelectElement>("select")) {
    enhanceSelect(select);
    syncCustomSelect(select);
  }
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

function includedSourceIDs(): string[] {
  return [...document.querySelectorAll<HTMLInputElement>(".source-checkbox:checked")].map(
    (checkbox) => checkbox.value,
  );
}

function updateSourceSelection(): void {
  if (!controller) return;
  const included = new Set(includedSourceIDs());
  const selectedSources = controller.preview.sources.filter((source) =>
    included.has(source.sourceID),
  );
  const total = controller.preview.sources.length;
  element<HTMLDivElement>("source-summary").textContent =
    `${selectedSources.length} of ${total} document attachment${total === 1 ? "" : "s"} included; ` +
    `${selectedSources.reduce((sum, source) => sum + source.textCharacters, 0).toLocaleString()} extracted characters.`;
  element<HTMLButtonElement>("submit").disabled = !hasAPIKey || !selectedSources.length;
  updateCost();
}

function updateCost(): void {
  if (!controller) return;
  const preset = readPreset();
  if (!validatePreset(preset)) return;
  const cost = controller.estimate(preset, includedSourceIDs());
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
  hasAPIKey = controller.hasAPIKey;
  element<HTMLDivElement>("api-warning").hidden = hasAPIKey;

  const sourceList = element<HTMLUListElement>("source-list");
  sourceList.replaceChildren(
    ...controller.preview.sources.map((source) => {
      const item = document.createElement("li");
      const row = document.createElement("div");
      row.className = "source-row";
      const label = document.createElement("label");
      label.className = "source-option";
      const checkbox = document.createElement("input");
      checkbox.className = "source-checkbox";
      checkbox.type = "checkbox";
      checkbox.value = source.sourceID;
      checkbox.checked = true;
      checkbox.setAttribute("aria-label", `Include ${source.filename}`);
      checkbox.addEventListener("change", updateSourceSelection);
      const description = document.createElement("span");
      const filename = document.createElement("span");
      filename.className = "source-filename";
      filename.textContent = source.filename;
      description.append(
        `${source.sourceID} ${source.parentTitle || "Standalone attachment"} — Attachment: ${source.title} — File: `,
        filename,
        ` — ${source.contentType}, ${source.textCharacters.toLocaleString()} characters`,
      );
      label.append(checkbox, description);
      const open = document.createElement("button");
      open.className = "source-open";
      open.type = "button";
      open.textContent = "Open";
      open.setAttribute("aria-label", `Open ${source.title}`);
      open.addEventListener("click", async () => {
        open.disabled = true;
        try {
          await controller.openSource(source.attachmentID);
          showError();
        } catch (error) {
          showError(
            `Could not open ${source.title}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        } finally {
          open.disabled = false;
        }
      });
      row.append(label, open);
      item.append(row);
      return item;
    }),
  );
  updateSourceSelection();
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
        includedSourceIDs: includedSourceIDs(),
      });
      window.close();
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
      submit.disabled = false;
    }
  });
  updateCost();
}

document.addEventListener(
  "pointerdown",
  (event) => {
    const target = event.target as Node | null;
    for (const [select, state] of customSelects) {
      if (target && !state.wrapper.contains(target)) closeCustomSelect(select);
    }
  },
  true,
);

window.ZoteroPodcastConfiguration = { initialize };
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void initialize(), { once: true });
} else {
  void initialize();
}
