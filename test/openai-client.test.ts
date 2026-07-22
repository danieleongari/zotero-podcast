import { afterEach, describe, expect, it, vi } from "vitest";
import { BUILT_IN_PRESETS } from "../src/presets";
import { OpenAIClient } from "../src/services/openai";
import type { SourceDocument } from "../src/types";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OpenAI transport", () => {
  it("does not retry non-transient authentication errors or expose response bodies", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("sensitive server detail", {
          status: 401,
          headers: { "content-type": "text/plain" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new OpenAIClient("invalid", new AbortController().signal);

    await expect(client.testConnection()).rejects.toThrow(
      "Check the API key and project permissions",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(client.testConnection()).rejects.not.toThrow("sensitive server detail");
  });

  it("retries transient failures and eventually returns", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new OpenAIClient("test", new AbortController().signal);
    const pending = client.testConnection();
    await vi.runAllTimersAsync();
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retains the exact structured request prompts and raw model output", async () => {
    const rawOutput =
      '{"summary":"Evidence [D1].","sourceCoverage":[{"sourceID":"[D1]","status":"covered","note":"Included"}],"warnings":[]}';
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            output_text: rawOutput,
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const source: SourceDocument = {
      sourceID: "[D1]",
      attachmentID: 1,
      attachmentKey: "ABC",
      libraryID: 1,
      title: "Attachment",
      filename: "paper.pdf",
      parentTitle: "Paper",
      contentType: "application/pdf",
      text: "The complete original source text.",
      textCharacters: 34,
    };
    const client = new OpenAIClient("test", new AbortController().signal);

    const result = await client.summarize([source], BUILT_IN_PRESETS[0]);
    const sentBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

    expect(result.traces).toHaveLength(1);
    expect(result.traces[0].instructions).toBe(sentBody.instructions);
    expect(result.traces[0].input).toBe(sentBody.input);
    expect(result.traces[0].input).toContain(source.text);
    expect(result.traces[0].responseFormat).toEqual(sentBody.text.format);
    expect(result.traces[0].output).toBe(rawOutput);
  });

  it("sends the synthesis to script generation in a human-readable form", async () => {
    const rawOutput =
      '{"title":"Brief","speakers":[{"id":"speaker-1","name":"Narrator"}],"turns":[{"speakerId":"speaker-1","text":"Evidence","sourceIds":["[D1]"]}]}';
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ output_text: rawOutput, usage: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const preset = { ...BUILT_IN_PRESETS[0], targetMinutes: 0.01 };
    const source: SourceDocument = {
      sourceID: "[D1]",
      attachmentID: 1,
      attachmentKey: "ABC",
      libraryID: 1,
      title: "Attachment",
      filename: "paper.pdf",
      parentTitle: "Paper",
      contentType: "application/pdf",
      text: "Evidence",
      textCharacters: 8,
    };
    const client = new OpenAIClient("test", new AbortController().signal);

    await client.createScript(
      {
        summary: "Supported synthesis [D1].",
        sourceCoverage: [{ sourceID: "[D1]", status: "covered", note: "Included" }],
        warnings: [],
      },
      [source],
      preset,
    );
    const sentInput = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).input;

    expect(sentInput).toContain("SYNTHESIS\nSUMMARY\nSupported synthesis [D1].");
    expect(sentInput).toContain("SOURCE COVERAGE\n[D1] — covered: Included");
    expect(sentInput).not.toContain('{"summary"');
  });
});
