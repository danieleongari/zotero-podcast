import { afterEach, describe, expect, it } from "vitest";
import { BUILT_IN_PRESETS } from "../src/presets";
import { JobManager } from "../src/services/jobManager";
import type { PodcastJobRequest } from "../src/types";

afterEach(() => {
  delete (globalThis as any).IOUtils;
});

describe("single active job guard", () => {
  it("rejects a second run while the first job is still preparing", async () => {
    let releaseExists: ((value: boolean) => void) | undefined;
    (globalThis as any).IOUtils = {
      exists: () =>
        new Promise<boolean>((resolve) => {
          releaseExists = resolve;
        }),
      remove: async () => undefined,
    };
    const request: PodcastJobRequest = {
      name: "Test",
      attachmentKeys: ["ABC"],
      sourceMetadata: [],
      presetSnapshot: BUILT_IN_PRESETS[0],
      outputDirectory: "/output",
      sources: [],
    };
    const jobs = new JobManager({ get: () => "test-key" } as any);
    const first = jobs.start(request, () => undefined);

    expect(jobs.isRunning).toBe(true);
    await expect(jobs.start(request, () => undefined)).rejects.toThrow("already being generated");

    releaseExists?.(false);
    await expect(first).rejects.toThrow("Choose an existing output directory");
    expect(jobs.isRunning).toBe(false);
  });
});
