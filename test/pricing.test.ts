import { describe, expect, it } from "vitest";
import { BUILT_IN_PRESETS } from "../src/presets";
import { actualCostBreakdown, estimateCost, estimateTokens, PRICING_DATE } from "../src/pricing";

describe("cost estimation", () => {
  it("uses the documented character token heuristic", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(5)).toBe(2);
    expect(PRICING_DATE).toBe("2026-07-18");
  });

  it("produces a stage breakdown and a repair upper bound", () => {
    const result = estimateCost(
      [{ textCharacters: 400_000 }],
      BUILT_IN_PRESETS.find((preset) => preset.id === "scholarly-deep-dive")!,
    );
    expect(result.sourceTokens).toBe(100_000);
    expect(result.expectedSummaryTokens).toBe(6_000);
    expect(result.summary).toBeGreaterThan(0);
    expect(result.podcast).toBeGreaterThan(0);
    expect(result.tts).toBeGreaterThan(0);
    expect(result.expected).toBeCloseTo(result.summary + result.podcast + result.tts);
    expect(result.upperBound).toBeGreaterThan(result.expected);
  });

  it("accounts for map and reduce work above the per-request threshold", () => {
    const preset = BUILT_IN_PRESETS[0];
    const direct = estimateCost([{ textCharacters: 400_000 }], preset);
    const mapped = estimateCost([{ textCharacters: 1_600_000 }], preset);
    expect(mapped.sourceTokens).toBe(400_000);
    expect(mapped.summary).toBeGreaterThan(direct.summary * 4);
  });

  it("returns calculated actual costs for each billable stage", () => {
    const preset = BUILT_IN_PRESETS[0];
    const result = actualCostBreakdown(
      { inputTokens: 1_000, outputTokens: 100 },
      { inputTokens: 500, outputTokens: 200 },
      2_000,
      preset.summaryModel,
      preset.podcastModel,
      preset.ttsModel,
    );

    expect(result.summary).toBeGreaterThan(0);
    expect(result.podcast).toBeGreaterThan(0);
    expect(result.tts).toBeGreaterThan(0);
    expect(result.total).toBeCloseTo(result.summary + result.podcast + result.tts);
  });
});
