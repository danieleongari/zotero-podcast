import { describe, expect, it } from "vitest";
import { DISCLOSURE } from "../src/constants";
import { BUILT_IN_PRESETS } from "../src/presets";
import { renderSummary, renderTranscript, scriptTurnsWithDisclosure } from "../src/services/openai";
import type { PodcastScript, SourceDocument, SummaryResult } from "../src/types";

const script: PodcastScript = {
  title: "Evidence",
  speakers: [
    { id: "speaker-1", name: "Host" },
    { id: "speaker-2", name: "Expert" },
  ],
  turns: [
    {
      speakerId: "speaker-2",
      text: "The measured effect was significant.",
      sourceIds: ["[D1]"],
    },
  ],
};

const source: SourceDocument = {
  sourceID: "[D1]",
  attachmentID: 1,
  attachmentKey: "ABC",
  libraryID: 1,
  title: "Attachment",
  parentTitle: "Research paper",
  contentType: "application/pdf",
  text: "Evidence",
  textCharacters: 8,
};

describe("human-readable outputs", () => {
  it("starts the transcript and speech plan with the required disclosure", () => {
    const transcript = renderTranscript(script, BUILT_IN_PRESETS[1]);
    expect(transcript.startsWith(DISCLOSURE)).toBe(true);
    expect(transcript).toContain("Expert: The measured effect was significant. [D1]");
    expect(scriptTurnsWithDisclosure(script)[0].text).toBe(DISCLOSURE);
  });

  it("renders source coverage and warnings into summary text", () => {
    const summary: SummaryResult = {
      summary: "Supported synthesis [D1].",
      sourceCoverage: [{ sourceID: "[D1]", status: "covered", note: "Central finding" }],
      warnings: ["One table was unreadable."],
    };
    const rendered = renderSummary(summary, [source]);
    expect(rendered).toContain("[D1] Research paper");
    expect(rendered).toContain("[D1] — covered: Central finding");
    expect(rendered).toContain("One table was unreadable.");
  });
});
