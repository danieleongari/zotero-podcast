import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allocateOutputPaths,
  finalizeOutputs,
  renderCosts,
  renderLLMInputs,
  renderLLMOutputs,
  type OutputPaths,
} from "../src/services/output";
import { BUILT_IN_PRESETS } from "../src/presets";
import type { LLMCallTrace } from "../src/types";

const paths: OutputPaths = {
  directory: "/output",
  tempDirectory: "/output/.temp",
  podcast: "/output/podcast/Project.mp3",
  podcastDirectory: "/output/podcast",
  tempPodcast: "/output/.temp/podcast/Project.mp3",
  tempPodcastDirectory: "/output/.temp/podcast",
  summarizationInput: "/output/.temp/podcast/summarization_in.txt",
  summarizationOutput: "/output/.temp/podcast/summarization_out.txt",
  transcriptionInput: "/output/.temp/podcast/transcription_in.txt",
  transcriptionOutput: "/output/.temp/podcast/transcription_out.txt",
  costs: "/output/.temp/podcast/costs.txt",
};

const logs = {
  summarizationInput: "summary input",
  summarizationOutput: "summary output",
  transcriptionInput: "transcription input",
  transcriptionOutput: "transcription output",
  costs: "cost report",
};

afterEach(() => {
  delete (globalThis as any).IOUtils;
  delete (globalThis as any).PathUtils;
});

describe("output allocation", () => {
  it("allocates one project-named MP3 inside the podcast folder", async () => {
    (globalThis as any).PathUtils = { join: (...parts: string[]) => parts.join("/") };
    (globalThis as any).IOUtils = {
      exists: vi.fn(async () => false),
      makeDirectory: vi.fn(async () => undefined),
    };

    const allocated = await allocateOutputPaths(
      "/output",
      "Deep dive",
      new Date(2026, 6, 18, 9, 7, 5),
    );

    expect(allocated.podcast).toBe("/output/2026-07-18_090705_Deep dive_podcast/Deep dive.mp3");
    expect(allocated.podcastDirectory).toBe("/output/2026-07-18_090705_Deep dive_podcast");
    expect(allocated.tempPodcast).toMatch(
      /\/output\/\.zotero-podcast-\d+\/2026-07-18_090705_Deep dive_podcast\/Deep dive\.mp3$/,
    );
    expect(allocated.summarizationInput).toMatch(/podcast\/summarization_in\.txt$/);
    expect(allocated.summarizationOutput).toMatch(/podcast\/summarization_out\.txt$/);
    expect(allocated.transcriptionInput).toMatch(/podcast\/transcription_in\.txt$/);
    expect(allocated.transcriptionOutput).toMatch(/podcast\/transcription_out\.txt$/);
    expect(allocated.costs).toMatch(/podcast\/costs\.txt$/);
  });
});

describe("atomic output finalization", () => {
  it("writes one MP3 inside the atomically moved podcast folder", async () => {
    const move = vi.fn(async (_from: string, _to: string) => undefined);
    (globalThis as any).IOUtils = {
      write: vi.fn(async () => 4),
      writeUTF8: vi.fn(async () => 4),
      makeDirectory: vi.fn(async () => undefined),
      move,
      remove: vi.fn(async () => undefined),
    };

    await finalizeOutputs(paths, new Uint8Array([1, 2]), logs);

    expect(move.mock.calls.map(([from, to]) => [from, to])).toEqual([
      [paths.tempPodcastDirectory, paths.podcastDirectory],
    ]);
    expect((globalThis as any).IOUtils.write.mock.calls).toEqual([
      [paths.tempPodcast, expect.any(Uint8Array)],
    ]);
    expect((globalThis as any).IOUtils.writeUTF8.mock.calls).toEqual([
      [paths.summarizationInput, logs.summarizationInput],
      [paths.summarizationOutput, logs.summarizationOutput],
      [paths.transcriptionInput, logs.transcriptionInput],
      [paths.transcriptionOutput, logs.transcriptionOutput],
      [paths.costs, logs.costs],
    ]);
  });

  it("removes the finalized folder if cancellation arrives immediately after its move", async () => {
    const remove = vi.fn(async () => undefined);
    const controller = new AbortController();
    (globalThis as any).IOUtils = {
      write: vi.fn(async () => 4),
      writeUTF8: vi.fn(async () => 4),
      makeDirectory: vi.fn(async () => undefined),
      move: vi.fn(async () => {
        controller.abort();
      }),
      remove,
    };

    await expect(
      finalizeOutputs(paths, new Uint8Array([1, 2]), logs, controller.signal),
    ).rejects.toThrow();
    expect(remove).toHaveBeenCalledWith(paths.podcastDirectory, {
      recursive: true,
      ignoreAbsent: true,
    });
  });
});

describe("process logs", () => {
  const trace: LLMCallTrace = {
    model: "gpt-5.6-sol",
    requestName: "document_summary",
    instructions: "System instructions exactly.",
    input: "Prompt plus the complete original text.\nSecond line.",
    maxOutputTokens: 6000,
    responseFormat: { type: "json_schema", name: "document_summary" },
    output: '{"summary":"exact raw output"}',
  };

  it("separates settings, exact instructions, and exact input", () => {
    const rendered = renderLLMInputs("summarization", [trace]);
    expect(rendered).toContain("SUMMARIZATION REQUEST 1 OF 1");
    expect(rendered).toContain("Model: gpt-5.6-sol");
    expect(rendered).toContain("Maximum output tokens: 6,000");
    expect(rendered).toContain("Expected response structure".toUpperCase());
    expect(rendered).toContain("INSTRUCTIONS (EXACT)\n");
    expect(rendered).toContain(trace.instructions);
    expect(rendered).toContain(`INPUT (EXACT)\n${"-".repeat(72)}\n${trace.input}`);
    expect(rendered).not.toContain('"model"');
  });

  it("presents structured model output without JSON notation", () => {
    const rendered = renderLLMOutputs("summarization", [trace]);
    expect(rendered).toContain("SUMMARIZATION OUTPUT 1 OF 1");
    expect(rendered).toContain("Summary: exact raw output");
    expect(rendered).not.toContain(trace.output);
    expect(rendered).not.toContain('{"');
  });

  it("renders predicted and calculated actual costs for every step", () => {
    const report = renderCosts(
      {
        summary: 0.1,
        podcast: 0.2,
        tts: 0.3,
        expected: 0.6,
        upperBound: 0.75,
        sourceTokens: 100,
        expectedSummaryTokens: 20,
        expectedPodcastTokens: 30,
        expectedTTSCharacters: 40,
      },
      { summary: 0.11, podcast: 0.22, tts: 0.33, total: 0.66 },
      { inputTokens: 10, outputTokens: 5 },
      { inputTokens: 8, outputTokens: 4 },
      100,
      BUILT_IN_PRESETS[0],
    );

    expect(report).toContain("STEP 1 — SUMMARIZATION");
    expect(report).toContain("STEP 2 — TRANSCRIPTION / PODCAST SCRIPT");
    expect(report).toContain("STEP 3 — SPEECH SYNTHESIS");
    expect(report).toContain("STEP 4 — LOCAL MP3 ENCODING AND FILE WRITING");
    expect(report).toContain("Predicted cost: $0.600000");
    expect(report).toContain("Calculated actual cost: $0.660000");
  });
});
