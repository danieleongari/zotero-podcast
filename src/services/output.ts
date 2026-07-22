import { baseFilename, sanitizeName } from "../utils/files";
import { abortError } from "../utils/runtime";
import { LLM_PRICES, PRICING_DATE, TTS_PRICES } from "../pricing";
import type {
  ActualCostBreakdown,
  CostBreakdown,
  LLMCallTrace,
  PodcastPresetV1,
  Usage,
} from "../types";

interface OutputPaths {
  directory: string;
  tempDirectory: string;
  podcast: string;
  podcastDirectory: string;
  tempPodcast: string;
  tempPodcastDirectory: string;
  summarizationInput: string;
  summarizationOutput: string;
  transcriptionInput: string;
  transcriptionOutput: string;
  costs: string;
}

interface ProcessLogs {
  summarizationInput: string;
  summarizationOutput: string;
  transcriptionInput: string;
  transcriptionOutput: string;
  costs: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    return await IOUtils.exists(path);
  } catch {
    return false;
  }
}

export async function validateOutputDirectory(path: string): Promise<void> {
  const trimmed = path.trim();
  if (!trimmed || !(await exists(trimmed))) {
    throw new Error("Choose an existing output directory.");
  }
  const probe = PathUtils.join(trimmed, `.zotero-podcast-write-test-${Date.now()}`);
  try {
    await IOUtils.writeUTF8(probe, "test");
  } finally {
    await IOUtils.remove(probe, { ignoreAbsent: true });
  }
}

export async function allocateOutputPaths(
  directory: string,
  name: string,
  date = new Date(),
): Promise<OutputPaths> {
  const initial = baseFilename(name, date);
  let base = initial;
  let suffix = 1;
  while (await exists(PathUtils.join(directory, `${base}_podcast`))) {
    suffix += 1;
    base = `${initial}_${suffix}`;
  }
  const tempDirectory = PathUtils.join(directory, `.zotero-podcast-${Date.now()}`);
  const podcastDirectory = PathUtils.join(directory, `${base}_podcast`);
  const tempPodcastDirectory = PathUtils.join(tempDirectory, `${base}_podcast`);
  const podcastFilename = `${sanitizeName(name)}.mp3`;
  await IOUtils.makeDirectory(tempDirectory, { ignoreExisting: false });
  return {
    directory,
    tempDirectory,
    podcast: PathUtils.join(podcastDirectory, podcastFilename),
    podcastDirectory,
    tempPodcast: PathUtils.join(tempPodcastDirectory, podcastFilename),
    tempPodcastDirectory,
    summarizationInput: PathUtils.join(tempPodcastDirectory, "summarization_in.txt"),
    summarizationOutput: PathUtils.join(tempPodcastDirectory, "summarization_out.txt"),
    transcriptionInput: PathUtils.join(tempPodcastDirectory, "transcription_in.txt"),
    transcriptionOutput: PathUtils.join(tempPodcastDirectory, "transcription_out.txt"),
    costs: PathUtils.join(tempPodcastDirectory, "costs.txt"),
  };
}

export async function finalizeOutputs(
  paths: OutputPaths,
  mp3: Uint8Array,
  logs: ProcessLogs,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw abortError();
  await IOUtils.makeDirectory(paths.tempPodcastDirectory, { ignoreExisting: false });
  await IOUtils.write(paths.tempPodcast, mp3);
  if (signal?.aborted) throw abortError();
  await IOUtils.writeUTF8(paths.summarizationInput, logs.summarizationInput);
  if (signal?.aborted) throw abortError();
  await IOUtils.writeUTF8(paths.summarizationOutput, logs.summarizationOutput);
  if (signal?.aborted) throw abortError();
  await IOUtils.writeUTF8(paths.transcriptionInput, logs.transcriptionInput);
  if (signal?.aborted) throw abortError();
  await IOUtils.writeUTF8(paths.transcriptionOutput, logs.transcriptionOutput);
  if (signal?.aborted) throw abortError();
  await IOUtils.writeUTF8(paths.costs, logs.costs);
  const finalized: string[] = [];
  try {
    if (signal?.aborted) throw abortError();
    await IOUtils.move(paths.tempPodcastDirectory, paths.podcastDirectory, { noOverwrite: true });
    finalized.push(paths.podcastDirectory);
    if (signal?.aborted) throw abortError();
    await IOUtils.remove(paths.tempDirectory, { recursive: true, ignoreAbsent: true });
  } catch (error) {
    await Promise.all(
      finalized.map((path) =>
        IOUtils.remove(path, {
          recursive: path === paths.podcastDirectory,
          ignoreAbsent: true,
        }),
      ),
    );
    throw error;
  }
}

export async function cleanupOutputs(paths: OutputPaths | undefined): Promise<void> {
  if (!paths) return;
  await IOUtils.remove(paths.tempDirectory, { recursive: true, ignoreAbsent: true });
}

export type { OutputPaths };

const MAJOR_SEPARATOR = "#".repeat(72);
const MINOR_SEPARATOR = "-".repeat(72);

function humanLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function scalarText(value: unknown): string {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function renderHumanValue(value: unknown, indentation = 0): string[] {
  const indent = " ".repeat(indentation);
  if (Array.isArray(value)) {
    if (!value.length) return [`${indent}None`];
    return value.flatMap((item, index) => {
      if (item !== null && typeof item === "object") {
        return [`${indent}ITEM ${index + 1}`, ...renderHumanValue(item, indentation + 2)];
      }
      return [`${indent}- ${scalarText(item)}`];
    });
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => {
      const label = humanLabel(key);
      if (item !== null && typeof item === "object") {
        return [`${indent}${label.toUpperCase()}`, ...renderHumanValue(item, indentation + 2)];
      }
      const text = scalarText(item);
      if (text.includes("\n")) {
        return [
          `${indent}${label.toUpperCase()}`,
          ...text.split("\n").map((line) => `${indent}  ${line}`),
        ];
      }
      return [`${indent}${label}: ${text}`];
    });
  }
  return [`${indent}${scalarText(value)}`];
}

function renderModelOutput(output: string): string {
  try {
    return renderHumanValue(JSON.parse(output)).join("\n");
  } catch {
    return output;
  }
}

function schemaType(schema: any): string {
  if (schema?.enum) return `one of: ${schema.enum.map(scalarText).join(", ")}`;
  if (schema?.type === "string") {
    return schema.pattern ? `text matching ${schema.pattern}` : "text";
  }
  if (schema?.type === "array") return "list";
  if (schema?.type === "object") return "group";
  return humanLabel(String(schema?.type || "value")).toLowerCase();
}

function renderSchema(schema: any, indentation = 0): string[] {
  const properties = schema?.properties || {};
  const required = new Set<string>(schema?.required || []);
  return Object.entries(properties).flatMap(([name, property]: [string, any]) => {
    const indent = " ".repeat(indentation);
    const requirement = required.has(name) ? "required" : "optional";
    const details = [`${indent}- ${humanLabel(name)} (${requirement}): ${schemaType(property)}`];
    const nested = property.type === "array" ? property.items : property;
    if (nested?.properties) details.push(...renderSchema(nested, indentation + 2));
    return details;
  });
}

function renderSettings(trace: LLMCallTrace): string {
  const format = trace.responseFormat as any;
  return [
    `Model: ${trace.model}`,
    `Maximum output tokens: ${trace.maxOutputTokens.toLocaleString("en-US")}`,
    "Output format: Structured response",
    `Response name: ${humanLabel(String(format.name || trace.requestName))}`,
    `Strict structure validation: ${format.strict ? "Yes" : "No"}`,
    "",
    "EXPECTED RESPONSE STRUCTURE",
    ...renderSchema(format.schema),
  ].join("\n");
}

export function renderLLMInputs(phase: string, traces: LLMCallTrace[]): string {
  return (
    traces
      .map((trace, index) => {
        return [
          MAJOR_SEPARATOR,
          `${phase.toUpperCase()} REQUEST ${index + 1} OF ${traces.length}`,
          MAJOR_SEPARATOR,
          "",
          MINOR_SEPARATOR,
          "MODEL AND SETTINGS",
          MINOR_SEPARATOR,
          renderSettings(trace),
          "",
          MINOR_SEPARATOR,
          "INSTRUCTIONS (EXACT)",
          MINOR_SEPARATOR,
          trace.instructions,
          "",
          MINOR_SEPARATOR,
          "INPUT (EXACT)",
          MINOR_SEPARATOR,
          trace.input,
        ].join("\n");
      })
      .join("\n\n") + "\n"
  );
}

export function renderLLMOutputs(phase: string, traces: LLMCallTrace[]): string {
  return (
    traces
      .map((trace, index) =>
        [
          MAJOR_SEPARATOR,
          `${phase.toUpperCase()} OUTPUT ${index + 1} OF ${traces.length}`,
          MAJOR_SEPARATOR,
          "",
          `Model: ${trace.model}`,
          `Request type: ${trace.requestName}`,
          "",
          MINOR_SEPARATOR,
          "MODEL OUTPUT (HUMAN-READABLE; VALUES PRESERVED)",
          MINOR_SEPARATOR,
          renderModelOutput(trace.output),
        ].join("\n"),
      )
      .join("\n\n") + "\n"
  );
}

function money(value: number): string {
  return `$${value.toFixed(6)}`;
}

function renderCostStep(
  number: number,
  name: string,
  model: string,
  predicted: number,
  actual: number,
  usage: string[],
): string[] {
  return [
    MINOR_SEPARATOR,
    `STEP ${number} — ${name}`,
    MINOR_SEPARATOR,
    `Model: ${model}`,
    `Predicted cost: ${money(predicted)}`,
    `Calculated actual cost: ${money(actual)}`,
    ...usage,
    "",
  ];
}

export function renderCosts(
  predicted: CostBreakdown,
  actual: ActualCostBreakdown,
  summaryUsage: Pick<Usage, "inputTokens" | "outputTokens">,
  podcastUsage: Pick<Usage, "inputTokens" | "outputTokens">,
  ttsCharacters: number,
  preset: PodcastPresetV1,
): string {
  return [
    MAJOR_SEPARATOR,
    "PODCAST COST REVIEW",
    MAJOR_SEPARATOR,
    "",
    `Pricing reference date: ${PRICING_DATE}`,
    "Calculated actual costs use the usage reported by OpenAI and the rates listed below.",
    "OpenAI billing remains authoritative.",
    "",
    ...renderCostStep(1, "SUMMARIZATION", preset.summaryModel, predicted.summary, actual.summary, [
      `Actual input tokens: ${summaryUsage.inputTokens.toLocaleString("en-US")}`,
      `Actual output tokens: ${summaryUsage.outputTokens.toLocaleString("en-US")}`,
    ]),
    ...renderCostStep(
      2,
      "TRANSCRIPTION / PODCAST SCRIPT",
      preset.podcastModel,
      predicted.podcast,
      actual.podcast,
      [
        `Actual input tokens: ${podcastUsage.inputTokens.toLocaleString("en-US")}`,
        `Actual output tokens: ${podcastUsage.outputTokens.toLocaleString("en-US")}`,
      ],
    ),
    ...renderCostStep(3, "SPEECH SYNTHESIS", preset.ttsModel, predicted.tts, actual.tts, [
      `Actual billed characters: ${ttsCharacters.toLocaleString("en-US")}`,
    ]),
    ...renderCostStep(4, "LOCAL MP3 ENCODING AND FILE WRITING", "Local processing", 0, 0, []),
    MAJOR_SEPARATOR,
    "TOTALS",
    MAJOR_SEPARATOR,
    `Predicted cost: ${money(predicted.expected)}`,
    `Predicted upper bound (including one script repair): ${money(predicted.upperBound)}`,
    `Calculated actual cost: ${money(actual.total)}`,
    "",
    MINOR_SEPARATOR,
    "RATES USED",
    MINOR_SEPARATOR,
    `${preset.summaryModel}: $${LLM_PRICES[preset.summaryModel].input}/1M input tokens; $${LLM_PRICES[preset.summaryModel].output}/1M output tokens`,
    `${preset.podcastModel}: $${LLM_PRICES[preset.podcastModel].input}/1M input tokens; $${LLM_PRICES[preset.podcastModel].output}/1M output tokens`,
    `${preset.ttsModel}: $${TTS_PRICES[preset.ttsModel]}/1M characters`,
    "",
  ].join("\n");
}

export type { ProcessLogs };
