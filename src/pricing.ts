import {
  DISCLOSURE,
  MAX_SOURCE_TOKENS_PER_REQUEST,
  PRICING_DATE,
  WORDS_PER_MINUTE,
} from "./constants";
import type {
  CostBreakdown,
  LLMModel,
  PodcastPresetV1,
  SourceDocument,
  TTSModel,
  Usage,
} from "./types";

export { PRICING_DATE };

export const LLM_PRICES: Record<LLMModel, { input: number; output: number }> = {
  "gpt-5.6-sol": { input: 5, output: 30 },
  "gpt-5.6-terra": { input: 2.5, output: 15 },
  "gpt-5.6-luna": { input: 1, output: 6 },
};

export const TTS_PRICES: Record<TTSModel, number> = {
  "tts-1": 15,
  "tts-1-hd": 30,
};

export function estimateTokens(characters: number): number {
  return Math.ceil(Math.max(0, characters) / 4);
}

function llmCost(model: LLMModel, inputTokens: number, outputTokens: number): number {
  const price = LLM_PRICES[model];
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

export function estimateCost(
  sources: Pick<SourceDocument, "textCharacters">[],
  preset: PodcastPresetV1,
): CostBreakdown {
  const sourceCharacters = sources.reduce((sum, source) => sum + source.textCharacters, 0);
  const sourceTokens = estimateTokens(sourceCharacters);
  const chunkCount = Math.max(1, Math.ceil(sourceTokens / (MAX_SOURCE_TOKENS_PER_REQUEST - 5_000)));
  const mapOutputTokens = Math.min(
    6_000,
    Math.max(1_000, Math.ceil((sourceTokens / chunkCount) * 0.08)),
  );
  const expectedSummaryTokens = Math.min(6_000, Math.max(1_000, Math.ceil(sourceTokens * 0.08)));
  const summaryInputTokens = sourceTokens + (chunkCount > 1 ? chunkCount * mapOutputTokens : 0);
  const summaryOutputTokens =
    chunkCount > 1 ? chunkCount * mapOutputTokens + expectedSummaryTokens : expectedSummaryTokens;
  const dialogueWords = preset.targetMinutes * WORDS_PER_MINUTE;
  const expectedPodcastTokens = Math.ceil(dialogueWords * 1.35);
  const expectedTTSCharacters = Math.ceil(dialogueWords * 6 + DISCLOSURE.length);

  const summary = llmCost(preset.summaryModel, summaryInputTokens, summaryOutputTokens);
  const podcast = llmCost(preset.podcastModel, expectedSummaryTokens, expectedPodcastTokens);
  const tts = (expectedTTSCharacters * TTS_PRICES[preset.ttsModel]) / 1_000_000;
  const expected = summary + podcast + tts;
  const repair = llmCost(preset.podcastModel, expectedPodcastTokens, expectedPodcastTokens);

  return {
    summary,
    podcast,
    tts,
    expected,
    upperBound: expected + repair,
    sourceTokens,
    expectedSummaryTokens,
    expectedPodcastTokens,
    expectedTTSCharacters,
  };
}

export function actualCost(
  usage: Usage,
  summaryModel: LLMModel,
  podcastModel: LLMModel,
  ttsModel: TTSModel,
  summaryUsage?: Pick<Usage, "inputTokens" | "outputTokens">,
): number {
  if (!summaryUsage) {
    return (
      llmCost(podcastModel, usage.inputTokens, usage.outputTokens) +
      (usage.ttsCharacters * TTS_PRICES[ttsModel]) / 1_000_000
    );
  }
  const podcastInput = Math.max(0, usage.inputTokens - summaryUsage.inputTokens);
  const podcastOutput = Math.max(0, usage.outputTokens - summaryUsage.outputTokens);
  return (
    llmCost(summaryModel, summaryUsage.inputTokens, summaryUsage.outputTokens) +
    llmCost(podcastModel, podcastInput, podcastOutput) +
    (usage.ttsCharacters * TTS_PRICES[ttsModel]) / 1_000_000
  );
}
