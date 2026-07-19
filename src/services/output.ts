import { baseFilename } from "../utils/files";
import { abortError } from "../utils/runtime";

interface OutputPaths {
  directory: string;
  tempDirectory: string;
  podcast: string;
  summary: string;
  transcript: string;
  tempPodcast: string;
  tempSummary: string;
  tempTranscript: string;
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
  while (
    await Promise.all(
      ["podcast.mp3", "summary.txt", "transcript.txt"].map((type) =>
        exists(PathUtils.join(directory, `${base}_${type}`)),
      ),
    ).then((results) => results.some(Boolean))
  ) {
    suffix += 1;
    base = `${initial}_${suffix}`;
  }
  const tempDirectory = PathUtils.join(directory, `.zotero-podcast-${Date.now()}`);
  await IOUtils.makeDirectory(tempDirectory, { ignoreExisting: false });
  return {
    directory,
    tempDirectory,
    podcast: PathUtils.join(directory, `${base}_podcast.mp3`),
    summary: PathUtils.join(directory, `${base}_summary.txt`),
    transcript: PathUtils.join(directory, `${base}_transcript.txt`),
    tempPodcast: PathUtils.join(tempDirectory, `${base}_podcast.mp3.part`),
    tempSummary: PathUtils.join(tempDirectory, `${base}_summary.txt.part`),
    tempTranscript: PathUtils.join(tempDirectory, `${base}_transcript.txt.part`),
  };
}

export async function finalizeOutputs(
  paths: OutputPaths,
  mp3: Uint8Array,
  summary: string,
  transcript: string,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw abortError();
  await IOUtils.write(paths.tempPodcast, mp3);
  if (signal?.aborted) throw abortError();
  await IOUtils.writeUTF8(paths.tempSummary, summary);
  if (signal?.aborted) throw abortError();
  await IOUtils.writeUTF8(paths.tempTranscript, transcript);
  const finalized: string[] = [];
  try {
    if (signal?.aborted) throw abortError();
    await IOUtils.move(paths.tempPodcast, paths.podcast, { noOverwrite: true });
    finalized.push(paths.podcast);
    if (signal?.aborted) throw abortError();
    await IOUtils.move(paths.tempSummary, paths.summary, { noOverwrite: true });
    finalized.push(paths.summary);
    if (signal?.aborted) throw abortError();
    await IOUtils.move(paths.tempTranscript, paths.transcript, { noOverwrite: true });
    finalized.push(paths.transcript);
    if (signal?.aborted) throw abortError();
    await IOUtils.remove(paths.tempDirectory, { recursive: true, ignoreAbsent: true });
  } catch (error) {
    await Promise.all(finalized.map((path) => IOUtils.remove(path, { ignoreAbsent: true })));
    throw error;
  }
}

export async function cleanupOutputs(paths: OutputPaths | undefined): Promise<void> {
  if (!paths) return;
  await IOUtils.remove(paths.tempDirectory, { recursive: true, ignoreAbsent: true });
}

export type { OutputPaths };
