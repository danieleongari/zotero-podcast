import { PREF_CUSTOM_PRESETS, PREF_LAST_PRESET_ID, PREF_OUTPUT_DIRECTORY } from "../constants";
import {
  BUILT_IN_PRESETS,
  clonePreset,
  mergePresets,
  slugifyPresetName,
  validatePreset,
} from "../presets";
import type { PodcastPresetV1 } from "../types";

function getString(key: string, fallback = ""): string {
  const value = Zotero.Prefs.get(key, true);
  return typeof value === "string" ? value : fallback;
}

export class SettingsService {
  get outputDirectory(): string {
    return getString(PREF_OUTPUT_DIRECTORY);
  }

  set outputDirectory(value: string) {
    Zotero.Prefs.set(PREF_OUTPUT_DIRECTORY, value.trim(), true);
  }

  get lastPresetID(): string {
    return getString(PREF_LAST_PRESET_ID, "scholarly-deep-dive");
  }

  set lastPresetID(value: string) {
    Zotero.Prefs.set(PREF_LAST_PRESET_ID, value, true);
  }

  getPresets(): PodcastPresetV1[] {
    return mergePresets(getString(PREF_CUSTOM_PRESETS, "[]"));
  }

  savePreset(input: PodcastPresetV1): PodcastPresetV1[] {
    if (!validatePreset(input)) throw new Error("The preset is invalid.");
    const all = this.getPresets();
    const builtIn = BUILT_IN_PRESETS.some((preset) => preset.id === input.id);
    const saved: PodcastPresetV1 = {
      ...clonePreset(input),
      id: builtIn ? slugifyPresetName(input.name) : input.id,
      builtIn: false,
    };
    const custom = all.filter((preset) => !preset.builtIn && preset.id !== saved.id);
    custom.push(saved);
    Zotero.Prefs.set(PREF_CUSTOM_PRESETS, JSON.stringify(custom), true);
    this.lastPresetID = saved.id;
    return this.getPresets();
  }

  deletePreset(id: string): PodcastPresetV1[] {
    if (BUILT_IN_PRESETS.some((preset) => preset.id === id)) {
      throw new Error("Built-in presets cannot be deleted.");
    }
    const custom = this.getPresets().filter((preset) => !preset.builtIn && preset.id !== id);
    Zotero.Prefs.set(PREF_CUSTOM_PRESETS, JSON.stringify(custom), true);
    this.lastPresetID = "scholarly-deep-dive";
    return this.getPresets();
  }
}
