import { describe, expect, it } from "vitest";
import { baseFilename, sanitizeName, timestamp } from "../src/utils/files";

describe("filename handling", () => {
  it("preserves Unicode while replacing cross-platform forbidden characters", () => {
    expect(sanitizeName("  Résumé: methods / results?  ")).toBe("Résumé_ methods _ results_");
  });

  it("uses a fallback and limits the user-controlled component", () => {
    expect(sanitizeName("...")).toBe("podcast");
    expect(sanitizeName("a".repeat(100))).toHaveLength(80);
  });

  it("creates the documented local timestamp contract", () => {
    const date = new Date(2026, 6, 18, 9, 7, 5);
    expect(timestamp(date)).toBe("2026-07-18_090705");
    expect(baseFilename("Deep dive", date)).toBe("2026-07-18_090705_Deep dive");
  });
});
