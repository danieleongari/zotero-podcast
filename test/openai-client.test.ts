import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIClient } from "../src/services/openai";

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
});
