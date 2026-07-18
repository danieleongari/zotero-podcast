import { describe, expect, it } from "vitest";
import { encodeMP3, SAMPLE_RATE } from "../src/services/audio";

describe("MP3 encoding", () => {
  it("encodes ordered 24 kHz mono PCM and reports exact duration including pauses", async () => {
    const first = new Int16Array(SAMPLE_RATE / 10);
    const second = new Int16Array(SAMPLE_RATE / 10);
    for (let index = 0; index < first.length; index += 1) {
      first[index] = Math.round(Math.sin((index / SAMPLE_RATE) * Math.PI * 440 * 2) * 4_000);
      second[index] = Math.round(Math.sin((index / SAMPLE_RATE) * Math.PI * 660 * 2) * 4_000);
    }
    const encoded = await encodeMP3([first, second], 100);
    expect(encoded.bytes.length).toBeGreaterThan(500);
    expect(encoded.durationSeconds).toBeCloseTo(0.3, 4);
  });

  it("honors cancellation during local encoding", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      encodeMP3([new Int16Array(SAMPLE_RATE)], 0, undefined, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
