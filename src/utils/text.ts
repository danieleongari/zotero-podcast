import { MAX_SOURCE_TOKENS_PER_REQUEST, MAX_TTS_CHARACTERS } from "../constants";
import type { SourceDocument } from "../types";
import { estimateTokens } from "../pricing";

export function wordCount(text: string): number {
  return (text.trim().match(/\S+/g) || []).length;
}

export function splitForSpeech(text: string, maxCharacters = MAX_TTS_CHARACTERS): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  if (normalized.length <= maxCharacters) return [normalized];

  const sentences = normalized.match(/[^.!?]+(?:[.!?]+|$)/g) || [normalized];
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const sentenceValue of sentences) {
    let sentence = sentenceValue.trim();
    while (sentence.length > maxCharacters) {
      flush();
      let splitAt = sentence.lastIndexOf(" ", maxCharacters);
      if (splitAt < Math.floor(maxCharacters * 0.5)) splitAt = maxCharacters;
      chunks.push(sentence.slice(0, splitAt).trim());
      sentence = sentence.slice(splitAt).trim();
    }

    if (!current) {
      current = sentence;
    } else if (current.length + sentence.length + 1 <= maxCharacters) {
      current += ` ${sentence}`;
    } else {
      flush();
      current = sentence;
    }
  }
  flush();
  return chunks;
}

export function sourceBlock(source: SourceDocument): string {
  const metadata = [
    `SOURCE ${source.sourceID}`,
    `Title: ${source.parentTitle || source.title}`,
    source.creators ? `Creators: ${source.creators}` : "",
    source.year ? `Year: ${source.year}` : "",
    `Attachment: ${source.title}`,
    `Content type: ${source.contentType}`,
  ]
    .filter(Boolean)
    .join("\n");
  return `${metadata}\n\n${source.text}`;
}

function splitLongBlock(block: string, maxCharacters: number): string[] {
  if (block.length <= maxCharacters) return [block];
  const paragraphs = block.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (let paragraph of paragraphs) {
    while (paragraph.length > maxCharacters) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      let splitAt = paragraph.lastIndexOf(" ", maxCharacters);
      if (splitAt < maxCharacters / 2) splitAt = maxCharacters;
      chunks.push(paragraph.slice(0, splitAt));
      paragraph = paragraph.slice(splitAt).trim();
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxCharacters && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function chunkSources(
  sources: SourceDocument[],
  maxTokens = MAX_SOURCE_TOKENS_PER_REQUEST,
): string[] {
  const maxCharacters = maxTokens * 4;
  const blocks = sources.flatMap((source) => splitLongBlock(sourceBlock(source), maxCharacters));
  const chunks: string[] = [];
  let current = "";

  for (const block of blocks) {
    const candidate = current ? `${current}\n\n---\n\n${block}` : block;
    if (estimateTokens(candidate.length) > maxTokens && current) {
      chunks.push(current);
      current = block;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function stripSourceMarkers(text: string): string {
  return text.replace(/\s*\[(?:D\d+)(?:\s*,\s*D\d+)*\]/gi, "").trim();
}
