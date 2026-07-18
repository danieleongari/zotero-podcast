import lamejs from "@breezystack/lamejs";

export const SAMPLE_RATE = 24_000;
const MP3_BITRATE_KBPS = 96;
const ENCODE_BLOCK_SIZE = 1_152;

export interface EncodedAudio {
  bytes: Uint8Array;
  durationSeconds: number;
}

export async function encodeMP3(
  pcmSegments: Int16Array[],
  pauseMilliseconds = 240,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<EncodedAudio> {
  const encoder = new lamejs.Mp3Encoder(1, SAMPLE_RATE, MP3_BITRATE_KBPS);
  const output: Uint8Array[] = [];
  const pause = new Int16Array(Math.round((SAMPLE_RATE * pauseMilliseconds) / 1_000));
  const totalSamples =
    pcmSegments.reduce((sum, segment) => sum + segment.length, 0) +
    Math.max(0, pcmSegments.length - 1) * pause.length;
  let processed = 0;

  const encode = async (samples: Int16Array) => {
    for (let offset = 0; offset < samples.length; offset += ENCODE_BLOCK_SIZE) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const block = samples.subarray(offset, Math.min(offset + ENCODE_BLOCK_SIZE, samples.length));
      const encoded = encoder.encodeBuffer(block);
      if (encoded.length) output.push(new Uint8Array(encoded));
      processed += block.length;
      if (processed % (ENCODE_BLOCK_SIZE * 100) === 0) {
        onProgress?.(processed / totalSamples);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  };

  for (let index = 0; index < pcmSegments.length; index += 1) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    await encode(pcmSegments[index]);
    if (index < pcmSegments.length - 1) await encode(pause);
  }
  const flushed = encoder.flush();
  if (flushed.length) output.push(new Uint8Array(flushed));
  onProgress?.(1);

  const byteLength = output.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of output) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes, durationSeconds: totalSamples / SAMPLE_RATE };
}
