import { DISCLOSURE, DURATION_TOLERANCE, WORDS_PER_MINUTE } from "../constants";
import { actualCost, estimateCost } from "../pricing";
import type { PodcastJobRequest, PodcastJobResult, ProgressState, Usage } from "../types";
import { splitForSpeech, stripSourceMarkers, wordCount } from "../utils/text";
import { encodeMP3 } from "./audio";
import { CredentialService } from "./credentials";
import { OpenAIClient, renderSummary, renderTranscript, scriptTurnsWithDisclosure } from "./openai";
import {
  allocateOutputPaths,
  cleanupOutputs,
  finalizeOutputs,
  type OutputPaths,
  validateOutputDirectory,
} from "./output";

interface SpeechTask {
  input: string;
  voice: PodcastJobRequest["presetSnapshot"]["speakers"][number]["voice"];
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  handler: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      result[index] = await handler(values[index], index);
    }
  });
  await Promise.all(workers);
  return result;
}

export class JobManager {
  private abortController?: AbortController;
  private cancelRequested = false;
  private running = false;

  constructor(private readonly credentials: CredentialService) {}

  get isRunning(): boolean {
    return this.running;
  }

  cancel(): void {
    this.cancelRequested = true;
    this.abortController?.abort();
  }

  async start(
    request: PodcastJobRequest,
    onProgress: (state: ProgressState) => void,
  ): Promise<PodcastJobResult> {
    if (this.running) throw new Error("A podcast is already being generated.");
    const apiKey = this.credentials.get();
    if (!apiKey) throw new Error("Add an OpenAI API key in Zotero Podcast settings.");

    this.running = true;
    this.cancelRequested = false;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const client = new OpenAIClient(apiKey, signal);
    let paths: OutputPaths | undefined;

    try {
      onProgress({ stage: "preparing", percent: 2, message: "Validating output directory…" });
      await validateOutputDirectory(request.outputDirectory);
      paths = await allocateOutputPaths(request.outputDirectory, request.name);
      const initialEstimate = estimateCost(request.sources, request.presetSnapshot);

      onProgress({
        stage: "summarizing",
        percent: 10,
        message: "Synthesizing selected documents…",
        estimatedCost: initialEstimate.expected,
      });
      const summarized = await client.summarize(
        request.sources,
        request.presetSnapshot,
        (current, total) => {
          onProgress({
            stage: "summarizing",
            percent: 10 + Math.round((current / total) * 30),
            message: `Synthesizing document group ${current} of ${total}…`,
            estimatedCost: initialEstimate.expected,
          });
        },
      );

      onProgress({
        stage: "scripting",
        percent: 44,
        message: "Writing the podcast dialogue…",
        estimatedCost: initialEstimate.expected,
      });
      const scripted = await client.createScript(
        summarized.summary,
        request.sources,
        request.presetSnapshot,
      );

      const preset = request.presetSnapshot;
      const speakerByID = new Map(
        preset.speakers.map((speaker, index) => [`speaker-${index + 1}`, speaker]),
      );
      const spokenWords = wordCount(
        `${DISCLOSURE} ${scripted.script.turns.map((turn) => turn.text).join(" ")}`,
      );
      const speed = Math.max(
        0.25,
        Math.min(4, spokenWords / (preset.targetMinutes * WORDS_PER_MINUTE)),
      );
      const speechTasks: SpeechTask[] = [];
      for (const turn of scriptTurnsWithDisclosure(scripted.script)) {
        const speaker = speakerByID.get(turn.speakerId) || preset.speakers[0];
        for (const chunk of splitForSpeech(stripSourceMarkers(turn.text))) {
          speechTasks.push({ input: chunk, voice: speaker.voice });
        }
      }

      let completedSpeech = 0;
      const pcmSegments = await mapConcurrent(speechTasks, 3, async (task) => {
        const pcm = await client.speech(task.input, preset.ttsModel, task.voice, speed);
        completedSpeech += 1;
        onProgress({
          stage: "speech",
          percent: 58 + Math.round((completedSpeech / speechTasks.length) * 30),
          message: `Generating speech segment ${completedSpeech} of ${speechTasks.length}…`,
          estimatedCost: initialEstimate.expected,
        });
        return pcm;
      });

      onProgress({
        stage: "encoding",
        percent: 89,
        message: "Encoding MP3…",
        estimatedCost: initialEstimate.expected,
      });
      const encoded = await encodeMP3(
        pcmSegments,
        240,
        (fraction) => {
          onProgress({
            stage: "encoding",
            percent: 89 + Math.round(fraction * 7),
            message: "Encoding MP3…",
            estimatedCost: initialEstimate.expected,
          });
        },
        signal,
      );
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

      const usage: Usage = {
        inputTokens: summarized.usage.inputTokens + scripted.usage.inputTokens,
        outputTokens: summarized.usage.outputTokens + scripted.usage.outputTokens,
        ttsCharacters: speechTasks.reduce((sum, task) => sum + task.input.length, 0),
      };
      const warnings = [...summarized.summary.warnings];
      const targetSeconds = preset.targetMinutes * 60;
      if (
        encoded.durationSeconds < targetSeconds * (1 - DURATION_TOLERANCE) ||
        encoded.durationSeconds > targetSeconds * (1 + DURATION_TOLERANCE)
      ) {
        warnings.push(
          `Finished duration ${formatDuration(encoded.durationSeconds)} is outside the ±20% target range.`,
        );
      }
      if (scripted.repaired) {
        warnings.push("The dialogue was revised once to better match the requested duration.");
      }

      onProgress({
        stage: "finalizing",
        percent: 97,
        message: "Writing output files…",
        estimatedCost: initialEstimate.expected,
      });
      await finalizeOutputs(
        paths,
        encoded.bytes,
        renderSummary(summarized.summary, request.sources),
        renderTranscript(scripted.script, preset),
        signal,
      );
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

      const result: PodcastJobResult = {
        podcastPath: paths.podcast,
        summaryPath: paths.summary,
        transcriptPath: paths.transcript,
        durationSeconds: encoded.durationSeconds,
        usage,
        estimatedCost: actualCost(
          usage,
          preset.summaryModel,
          preset.podcastModel,
          preset.ttsModel,
          summarized.usage,
        ),
        warnings,
      };
      onProgress({
        stage: "completed",
        percent: 100,
        message: "Podcast completed.",
        estimatedCost: result.estimatedCost,
        result,
      });
      return result;
    } catch (error) {
      const wasCancelled = this.cancelRequested;
      if (!signal.aborted) this.abortController?.abort();
      await cleanupOutputs(paths);
      if (wasCancelled) {
        onProgress({ stage: "cancelled", percent: 0, message: "Podcast generation cancelled." });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        onProgress({
          stage: "failed",
          percent: 0,
          message: "Podcast generation failed.",
          error: message,
        });
      }
      throw error;
    } finally {
      this.running = false;
      this.cancelRequested = false;
      this.abortController = undefined;
    }
  }
}

function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
