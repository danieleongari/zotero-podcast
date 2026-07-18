import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PRESETS,
  clonePreset,
  mergePresets,
  slugifyPresetName,
  validatePreset,
} from "../src/presets";

describe("presets", () => {
  it("ships one-, two-, and three-speaker built-ins", () => {
    expect(BUILT_IN_PRESETS.map((preset) => preset.speakers.length)).toEqual([1, 2, 3]);
    expect(BUILT_IN_PRESETS.every(validatePreset)).toBe(true);
  });

  it("loads valid custom presets and ignores malformed storage", () => {
    const custom = clonePreset(BUILT_IN_PRESETS[0]);
    custom.id = "my-preset";
    custom.name = "My Preset";
    custom.builtIn = false;
    expect(mergePresets(JSON.stringify([custom, { schemaVersion: 99 }]))).toHaveLength(4);
    expect(mergePresets("not JSON")).toHaveLength(3);
  });

  it("creates stable readable custom identifiers", () => {
    expect(slugifyPresetName("Étude critique")).toMatch(/^etude-critique-[a-z0-9]+$/);
  });
});
