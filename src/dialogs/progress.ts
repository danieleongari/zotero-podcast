import type { ProgressController, ProgressState } from "../types";

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing progress control: ${id}`);
  return value as T;
}

const controller = (window.arguments?.[0] as any)?.wrappedJSObject as
  ProgressController | undefined;

function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function stageLabel(stage: ProgressState["stage"]): string {
  return {
    preparing: "Preparing",
    summarizing: "Synthesizing",
    scripting: "Writing dialogue",
    speech: "Generating speech",
    encoding: "Encoding",
    finalizing: "Finalizing",
    completed: "Completed",
    cancelled: "Cancelled",
    failed: "Failed",
  }[stage];
}

function update(state: ProgressState): void {
  const terminal = ["completed", "cancelled", "failed"].includes(state.stage);
  element<HTMLProgressElement>("job-progress").value = state.percent;
  element<HTMLParagraphElement>("stage-message").textContent = state.message;
  element<HTMLSpanElement>("stage-name").textContent = stageLabel(state.stage);
  element<HTMLSpanElement>("cost-value").textContent =
    typeof state.estimatedCost === "number"
      ? `Estimated spend $${state.estimatedCost.toFixed(4)}`
      : "";
  element<HTMLButtonElement>("cancel-job").hidden = terminal;
  element<HTMLButtonElement>("close-progress").hidden = !terminal;

  const error = element<HTMLDivElement>("job-error");
  error.hidden = !state.error;
  error.textContent = state.error || "";

  if (state.result) {
    const result = element<HTMLDivElement>("job-result");
    result.hidden = false;
    element<HTMLParagraphElement>("duration-value").textContent =
      `Duration ${formatDuration(state.result.durationSeconds)} · Estimated actual OpenAI cost $${state.result.estimatedCost.toFixed(4)}`;
    element<HTMLParagraphElement>("result-paths").textContent = [
      state.result.podcastPath,
      state.result.podcastDirectoryPath,
    ].join("\n");
    const warningList = element<HTMLUListElement>("warning-list");
    warningList.replaceChildren(
      ...state.result.warnings.map((warning) => {
        const item = document.createElement("li");
        item.textContent = warning;
        return item;
      }),
    );
    warningList.hidden = !state.result.warnings.length;
    element<HTMLButtonElement>("open-folder").hidden = false;
  }
}

window.ZoteroPodcastProgress = { update };
if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      element<HTMLButtonElement>("cancel-job").addEventListener("click", () =>
        controller?.cancel(),
      );
      element<HTMLButtonElement>("open-folder").addEventListener("click", () => {
        void controller?.openOutputDirectory();
      });
      element<HTMLButtonElement>("close-progress").addEventListener("click", () => window.close());
    },
    { once: true },
  );
}
