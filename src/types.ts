export const VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "cedar",
  "echo",
  "fable",
  "marin",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
] as const;

export const LLM_MODELS = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"] as const;
export const TTS_MODELS = ["tts-1", "tts-1-hd"] as const;

export type Voice = (typeof VOICES)[number];
export type LLMModel = (typeof LLM_MODELS)[number];
export type TTSModel = (typeof TTS_MODELS)[number];

export interface Speaker {
  name: string;
  voice: Voice;
}

export interface PodcastPresetV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  builtIn?: boolean;
  summaryPrompt: string;
  podcastPrompt: string;
  summaryModel: LLMModel;
  podcastModel: LLMModel;
  targetMinutes: number;
  ttsModel: TTSModel;
  speakers: Speaker[];
}

export interface SourceMetadata {
  sourceID: string;
  attachmentKey: string;
  libraryID: number;
  title: string;
  parentTitle?: string;
  creators?: string;
  year?: string;
  contentType: string;
  textCharacters: number;
}

export interface SourceDocument extends SourceMetadata {
  attachmentID: number;
  text: string;
}

export interface SelectionPreview {
  sources: SourceDocument[];
  skipped: string[];
}

export interface PodcastJobRequest {
  name: string;
  attachmentKeys: string[];
  sourceMetadata: SourceMetadata[];
  presetSnapshot: PodcastPresetV1;
  outputDirectory: string;
  sources: SourceDocument[];
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  ttsCharacters: number;
}

export interface CostBreakdown {
  summary: number;
  podcast: number;
  tts: number;
  expected: number;
  upperBound: number;
  sourceTokens: number;
  expectedSummaryTokens: number;
  expectedPodcastTokens: number;
  expectedTTSCharacters: number;
}

export interface PodcastJobResult {
  podcastPath: string;
  summaryPath: string;
  transcriptPath: string;
  durationSeconds: number;
  usage: Usage;
  estimatedCost: number;
  warnings: string[];
}

export interface SourceCoverage {
  sourceID: string;
  status: "covered" | "partial" | "omitted";
  note: string;
}

export interface SummaryResult {
  summary: string;
  sourceCoverage: SourceCoverage[];
  warnings: string[];
}

export interface DialogueTurn {
  speakerId: string;
  text: string;
  sourceIds: string[];
}

export interface PodcastScript {
  title: string;
  speakers: Array<{ id: string; name: string }>;
  turns: DialogueTurn[];
}

export type JobStage =
  | "preparing"
  | "summarizing"
  | "scripting"
  | "speech"
  | "encoding"
  | "finalizing"
  | "completed"
  | "cancelled"
  | "failed";

export interface ProgressState {
  stage: JobStage;
  percent: number;
  message: string;
  estimatedCost?: number;
  result?: PodcastJobResult;
  error?: string;
}

export interface ConfigurationSubmission {
  name: string;
  preset: PodcastPresetV1;
  outputDirectory: string;
}

export interface ConfigurationController {
  preview: SelectionPreview;
  presets: PodcastPresetV1[];
  lastPresetID: string;
  outputDirectory: string;
  hasAPIKey: boolean;
  estimate(preset: PodcastPresetV1): CostBreakdown;
  savePreset(preset: PodcastPresetV1): PodcastPresetV1[];
  deletePreset(id: string): PodcastPresetV1[];
  browseOutputDirectory(): Promise<string | null>;
  submit(submission: ConfigurationSubmission): Promise<void>;
}

export interface ProgressController {
  cancel(): void;
  openOutputDirectory(): Promise<void>;
}
