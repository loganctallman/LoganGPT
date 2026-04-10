import { describe, it, expect } from "vitest";
import { retrieve, retrieveSemantic, type Chunk } from "@/lib/retrieval";

// ─── helpers ──────────────────────────────────────────────────────────────────

function chunk(
  id: string,
  text: string,
  source: "resume.pdf" | "extra.md" = "extra.md",
  section?: string,
  embedding?: number[]
): Chunk {
  return { id, text, source, section, embedding };
}

// ─── retrieveSemantic ─────────────────────────────────────────────────────────

describe("retrieveSemantic", () => {
  it("returns [] for empty chunks array", () => {
    expect(retrieveSemantic([1, 0], [])).toEqual([]);
  });

  it("returns [] when no chunk has an embedding", () => {
    const chunks = [chunk("1", "hello world")];
    expect(retrieveSemantic([1, 0], chunks)).toEqual([]);
  });

  it("filters chunks below the default threshold (0.3)", () => {
    // cos([1,0], [0,1]) = 0  →  below threshold
    const chunks = [chunk("1", "text", "extra.md", undefined, [0, 1])];
    expect(retrieveSemantic([1, 0], chunks)).toEqual([]);
  });

  it("returns chunks above threshold sorted by descending similarity", () => {
    // cos([1,0], [1,0]) = 1.0  |  cos([1,0], [0.6,0.8]) ≈ 0.6
    const chunks = [
      chunk("low",  "low chunk",  "extra.md", undefined, [0.6, 0.8]),
      chunk("high", "high chunk", "extra.md", undefined, [1,   0  ]),
    ];
    const result = retrieveSemantic([1, 0], chunks, 5, 0.1);
    expect(result.map((c) => c.id)).toEqual(["high", "low"]);
  });

  it("applies 1.5× score boost to resume.pdf so it ranks first", () => {
    // Both chunks have the same embedding; resume gets boosted
    const emb = [0.8, 0.6];
    const chunks = [
      chunk("extra",  "text", "extra.md",  undefined, emb),
      chunk("resume", "text", "resume.pdf", undefined, emb),
    ];
    const result = retrieveSemantic([1, 0], chunks, 5, 0.1);
    expect(result[0].id).toBe("resume");
  });

  it("respects the topK limit", () => {
    const chunks = Array.from({ length: 8 }, (_, i) =>
      chunk(`c${i}`, `text ${i}`, "extra.md", undefined, [1, 0])
    );
    expect(retrieveSemantic([1, 0], chunks, 3)).toHaveLength(3);
  });

  it("handles zero-vector embeddings (denom = 0) without throwing", () => {
    const chunks = [chunk("1", "text", "extra.md", undefined, [0, 0])];
    // score = 0, filtered by default threshold 0.3
    expect(retrieveSemantic([0, 0], chunks)).toEqual([]);
    // with threshold = 0 the chunk is included
    const result = retrieveSemantic([0, 0], chunks, 5, 0);
    expect(result).toHaveLength(1);
  });

  it("ignores embedding-less chunks when other chunks have embeddings", () => {
    const chunks = [
      chunk("no-emb",  "text"),
      chunk("has-emb", "text", "extra.md", undefined, [1, 0]),
    ];
    const result = retrieveSemantic([1, 0], chunks, 5, 0.3);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("has-emb");
  });
});

// ─── retrieve ─────────────────────────────────────────────────────────────────

describe("retrieve", () => {
  // Shared fixture — diverse enough to exercise all scoring paths
  const chunks: Chunk[] = [
    chunk("skills",    "Logan has extensive experience in playwright automation testing", "extra.md",  "Skills"),
    chunk("work",      "Logan worked at Extreme Reach as a senior automation engineer",  "resume.pdf", "Employment"),
    chunk("hobbies",   "Hobbies include hiking and photography",                          "extra.md"),
    chunk("education", "Completed coursera certification courses online",                  "extra.md",  "Education"),
  ];

  // ── empty / no-op queries ─────────────────────────────────────────────────

  it("returns first topK chunks for an empty query", () => {
    expect(retrieve("", chunks, 2)).toEqual([chunks[0], chunks[1]]);
  });

  it("returns first topK when all tokens are stopwords", () => {
    expect(retrieve("the and for with", chunks, 2)).toEqual([chunks[0], chunks[1]]);
  });

  it("returns first topK when all tokens are too short (≤2 chars)", () => {
    expect(retrieve("a b c", chunks, 2)).toEqual([chunks[0], chunks[1]]);
  });

  // ── exact keyword matching ────────────────────────────────────────────────

  it("returns the best-matching chunk for an exact keyword", () => {
    const result = retrieve("playwright", chunks);
    expect(result[0].id).toBe("skills");
  });

  it("scores longer tokens higher (more signal per match)", () => {
    const result = retrieve("automation", chunks);
    // Both 'skills' and 'work' contain "automation"; 'work' wins due to resume.pdf 1.5× boost
    expect(result[0].id).toBe("work");
  });

  // ── synonym expansion ─────────────────────────────────────────────────────

  it("expands 'job' → employment-related terms and matches work chunk", () => {
    const result = retrieve("job", chunks);
    expect(result.map((c) => c.id)).toContain("work");
  });

  it("expands 'education' → coursera/certification and matches education chunk", () => {
    const result = retrieve("education", chunks);
    expect(result[0].id).toBe("education");
  });

  it("expands 'tools' → playwright/jira and matches skills chunk", () => {
    const result = retrieve("tools", chunks);
    expect(result.map((c) => c.id)).toContain("skills");
  });

  it("expands 'skills' synonym and boosts via section name match", () => {
    const result = retrieve("skills", chunks);
    expect(result[0].id).toBe("skills"); // section 'Skills' 4× boost
  });

  // ── section name boosting ─────────────────────────────────────────────────

  it("matches section name case-insensitively and boosts it", () => {
    const result = retrieve("EMPLOYMENT", chunks);
    expect(result[0].id).toBe("work"); // section 'Employment' matched
  });

  // ── resume.pdf source boosting ────────────────────────────────────────────

  it("boosts resume.pdf chunk above a same-score extra.md chunk", () => {
    // Both 'skills' and 'work' mention 'automation engineer';
    // 'work' is resume.pdf and wins the 1.5× multiplier
    const result = retrieve("automation engineer", chunks);
    expect(result[0].id).toBe("work");
  });

  // ── full-phrase bonus ─────────────────────────────────────────────────────

  it("awards +20 bonus when the full query phrase appears verbatim", () => {
    const result = retrieve("extreme reach", chunks);
    expect(result[0].id).toBe("work");
  });

  // ── apostrophe-s tokenization ─────────────────────────────────────────────

  it("strips possessive 's before tokenizing", () => {
    // "Logan's" → "Logan" after stripping; "experience" expands to engineer etc.
    const result = retrieve("Logan's experience", chunks);
    const ids = result.map((c) => c.id);
    expect(ids.some((id) => id === "skills" || id === "work")).toBe(true);
  });

  // ── fuzzy matching ────────────────────────────────────────────────────────

  it("fuzzy-matches a 1-edit misspelling of a 9-char token (2 edits allowed)", () => {
    // 'playwrigt' → 1 edit from 'playwright' (length 9, budget 2)
    const result = retrieve("playwrigt", chunks);
    expect(result[0].id).toBe("skills");
  });

  it("fuzzy-matches a 1-edit misspelling of a 5-char token (1 edit allowed)", () => {
    // 'hikng' → 1 edit from 'hiking' (length 5, budget 1)
    const result = retrieve("hikng", chunks);
    expect(result[0].id).toBe("hobbies");
  });

  it("does NOT fuzzy-match when the edit distance exceeds the budget", () => {
    // 'crs' is 3 chars → budget 1, but 'coursera' is 5+ edits away → no match
    // Falls back to first topK
    const result = retrieve("crs", chunks, 4);
    expect(result).toHaveLength(4); // fallback
  });

  // ── topK and fallback ─────────────────────────────────────────────────────

  it("respects the topK limit when matches exist", () => {
    expect(retrieve("logan", chunks, 2)).toHaveLength(2);
  });

  it("falls back to first topK when nothing scores above zero", () => {
    const result = retrieve("zzzyyyxxx", chunks, 2);
    expect(result).toHaveLength(2);
    expect(result).toEqual([chunks[0], chunks[1]]);
  });
});
