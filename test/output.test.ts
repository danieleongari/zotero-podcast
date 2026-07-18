import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeOutputs, type OutputPaths } from "../src/services/output";

const paths: OutputPaths = {
  directory: "/output",
  tempDirectory: "/output/.temp",
  podcast: "/output/podcast.mp3",
  summary: "/output/summary.txt",
  transcript: "/output/transcript.txt",
  tempPodcast: "/output/.temp/podcast.part",
  tempSummary: "/output/.temp/summary.part",
  tempTranscript: "/output/.temp/transcript.part",
};

afterEach(() => {
  delete (globalThis as any).IOUtils;
});

describe("atomic output finalization", () => {
  it("writes and moves exactly the requested three artifacts", async () => {
    const move = vi.fn(async (_from: string, _to: string) => undefined);
    (globalThis as any).IOUtils = {
      write: vi.fn(async () => 4),
      writeUTF8: vi.fn(async () => 4),
      move,
      remove: vi.fn(async () => undefined),
    };

    await finalizeOutputs(paths, new Uint8Array([1, 2]), "summary", "transcript");

    expect(move.mock.calls.map(([from, to]) => [from, to])).toEqual([
      [paths.tempPodcast, paths.podcast],
      [paths.tempSummary, paths.summary],
      [paths.tempTranscript, paths.transcript],
    ]);
  });

  it("removes already-finalized files when a later atomic move fails", async () => {
    const remove = vi.fn(async () => undefined);
    let moves = 0;
    (globalThis as any).IOUtils = {
      write: vi.fn(async () => 4),
      writeUTF8: vi.fn(async () => 4),
      move: vi.fn(async () => {
        moves += 1;
        if (moves === 2) throw new Error("disk failure");
      }),
      remove,
    };

    await expect(
      finalizeOutputs(paths, new Uint8Array([1, 2]), "summary", "transcript"),
    ).rejects.toThrow("disk failure");
    expect(remove).toHaveBeenCalledWith(paths.podcast, { ignoreAbsent: true });
  });
});
