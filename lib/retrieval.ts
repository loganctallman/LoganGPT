export interface Chunk {
  id: string;
  text: string;
  source: string;
  section?: string;
  embedding?: number[];
}

// ── Semantic retrieval ────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Semantic retrieval using pre-computed chunk embeddings and a query embedding.
 * resume.pdf chunks receive a 1.5× score boost so that when both sources cover
 * the same topic, the resume version is preferred and ranked first.
 * Falls back to an empty array if no chunks have embeddings.
 */
export function retrieveSemantic(
  queryEmbedding: number[],
  chunks: Chunk[],
  topK = 5,
  threshold = 0.3
): Chunk[] {
  const withEmbeddings = chunks.filter((c) => c.embedding);
  if (withEmbeddings.length === 0) return [];

  return withEmbeddings
    .map((chunk) => {
      const raw = cosineSimilarity(queryEmbedding, chunk.embedding!);
      // Mirror the keyword-search bias: resume is the authoritative source
      const score = chunk.source === "resume.pdf" ? raw * 1.5 : raw;
      return { chunk, score };
    })
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}

// ── Keyword retrieval (fallback) ──────────────────────────────────────────────

// Common resume query terms mapped to words that actually appear in resume text
const SYNONYMS: Record<string, string[]> = {
  job:        ["employment", "position", "role", "work"],
  jobs:       ["employment", "position", "role", "work"],
  experience: ["employment", "history", "worked", "engineer", "technician", "manager"],
  work:       ["employment", "position", "role"],
  career:     ["employment", "history", "experience"],
  education:  ["courses", "coursera", "certification"],
  school:     ["courses", "coursera", "certification"],
  degree:     ["courses", "coursera", "certification"],
  skill:      ["skills", "automation", "testing", "playwright"],
  skills:     ["skills", "automation", "testing", "playwright"],
  tool:       ["skills", "playwright", "jira", "testrail"],
  tools:      ["skills", "playwright", "jira", "testrail"],
  contact:    ["email", "phone", "wadesboro", "north carolina"],
  location:   ["wadesboro", "north carolina", "remote"],
  about:      ["profile", "results", "driven", "engineer"],
};

/**
 * Lightweight keyword/lexical retrieval.
 * Tokenizes the query, expands synonyms, scores each chunk by term frequency
 * (checking both chunk text and section name), and returns the top-k chunks.
 * Falls back to returning the first topK chunks if nothing matches.
 */
export function retrieve(query: string, chunks: Chunk[], topK = 5): Chunk[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return chunks.slice(0, topK);

  const expanded = new Set<string>(tokens);
  for (const token of tokens) {
    for (const syn of SYNONYMS[token] ?? []) expanded.add(syn);
  }
  const allTokens = Array.from(expanded);

  const scored = chunks.map((chunk) => {
    const text = chunk.text.toLowerCase();
    const section = (chunk.section ?? "").toLowerCase();
    let score = 0;

    for (const token of allTokens) {
      const re = new RegExp(escapeRegex(token), "g");
      const textMatches = text.match(re);
      if (textMatches) score += textMatches.length * token.length;
      if (section.includes(token)) score += token.length * 4;
    }

    if (text.includes(query.toLowerCase())) score += 20;
    if (chunk.source === "resume.pdf") score *= 1.5;

    return { chunk, score };
  });

  const results = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);

  return results.length > 0 ? results : chunks.slice(0, topK);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/'s\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all",
  "can", "had", "her", "was", "one", "our", "out", "day",
  "get", "has", "him", "his", "how", "its", "may", "new",
  "now", "old", "see", "two", "who", "did", "did", "she",
  "use", "way", "about", "from", "have", "that", "this",
  "they", "will", "with", "been", "more", "also", "into",
  "than", "then", "when", "what", "some", "them", "were",
]);
