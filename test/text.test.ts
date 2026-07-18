import { describe, expect, it } from "vitest";
import { chunkSources, splitForSpeech, stripSourceMarkers, wordCount } from "../src/utils/text";
import type { SourceDocument } from "../src/types";

function source(text: string, id = "[D1]"): SourceDocument {
  return {
    sourceID: id,
    attachmentID: 1,
    attachmentKey: id,
    libraryID: 1,
    title: "Paper",
    contentType: "application/pdf",
    text,
    textCharacters: text.length,
  };
}

describe("text preparation", () => {
  it("splits speech on sentence boundaries below the API safety limit", () => {
    const chunks = splitForSpeech(
      Array.from({ length: 200 }, (_, index) => `Sentence ${index} has useful evidence.`).join(" "),
      180,
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 180)).toBe(true);
    expect(chunks.join(" ")).toContain("Sentence 199");
  });

  it("hard-splits a single oversized sentence", () => {
    const chunks = splitForSpeech("word ".repeat(1_000), 100);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
  });

  it("chunks sources below the requested token budget", () => {
    const chunks = chunkSources(
      [source("alpha ".repeat(200), "[D1]"), source("beta ".repeat(200), "[D2]")],
      100,
    );
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 400)).toBe(true);
  });

  it("removes source markers only from spoken text", () => {
    expect(stripSourceMarkers("A finding [D1] and comparison [D1, D2].")).toBe(
      "A finding and comparison.",
    );
    expect(wordCount("one two\nthree")).toBe(3);
  });
});
