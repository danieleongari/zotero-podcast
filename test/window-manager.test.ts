import { afterEach, describe, expect, it, vi } from "vitest";
import { TooManyDocumentsError } from "../src/services/selection";
import { WindowManager } from "../src/ui/windowManager";

function progressHarness() {
  const line = {
    setText: vi.fn(),
    setProgress: vi.fn(),
  };
  const progress = {
    changeHeadline: vi.fn(),
    ItemProgress: vi.fn(function () {
      return line;
    }),
    show: vi.fn(),
    startCloseTimer: vi.fn(),
    close: vi.fn(),
  };
  const alert = vi.fn();
  (globalThis as any).Zotero = {
    ProgressWindow: vi.fn(function () {
      return progress;
    }),
    getMainWindow: () => ({}),
  };
  (globalThis as any).Services = { prompt: { alert } };
  return { alert, line, progress };
}

function manager(selection: any): WindowManager {
  return new WindowManager(
    "chrome://zotero-podcast/",
    selection,
    {} as any,
    {} as any,
    { isRunning: false } as any,
  );
}

afterEach(() => {
  delete (globalThis as any).Zotero;
  delete (globalThis as any).Services;
});

describe("selection preparation window", () => {
  it("shows the current document number and advances the full-text progress bar", async () => {
    const { line, progress } = progressHarness();
    const selection = {
      fromItems: vi.fn(async (_items, onProgress) => {
        onProgress(1, 2, "First paper");
        onProgress(2, 2, "Second paper");
        return { sources: [], skipped: [] };
      }),
    };

    await manager(selection).openForItems([]);

    expect(line.setText.mock.calls).toEqual([
      ["Reading document 1 of 2: First paper"],
      ["Reading document 2 of 2: Second paper"],
    ]);
    expect(line.setProgress.mock.calls).toEqual([[0], [0], [50], [100]]);
    expect(progress.show).toHaveBeenCalledOnce();
  });

  it("warns the user to select fewer documents when the limit is exceeded", async () => {
    const { alert, progress } = progressHarness();
    const selection = {
      fromItems: vi.fn(async () => {
        throw new TooManyDocumentsError(11);
      }),
    };

    await manager(selection).openForItems([]);

    expect(progress.close).toHaveBeenCalledOnce();
    expect(alert).toHaveBeenCalledWith(
      {},
      "Zotero Podcast",
      "You selected 11 documents. Select 10 or fewer documents and try again.",
    );
  });
});
