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
    // Pre-split words once per chunk for the fuzzy pass
    const words = text.split(/\s+/);
    let score = 0;

    for (const token of allTokens) {
      const re = new RegExp(escapeRegex(token), "g");
      const textMatches = text.match(re);
      if (textMatches) {
        // Exact match — full weight
        score += textMatches.length * token.length;
      } else if (fuzzyMatchesAny(token, words)) {
        // Fuzzy match — 60% weight so exact hits always rank above fuzzy
        score += token.length * 0.6;
      }
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

// ── Fuzzy matching (AUTO:3,6 edit-distance budget) ────────────────────────────

/**
 * Returns the maximum Levenshtein edits allowed for a given word length,
 * mirroring the AUTO:3,6 formula used in Elasticsearch/Solr:
 *   len 1–2 → 0 (exact only)
 *   len 3–5 → 1 edit
 *   len 6+  → 2 edits
 */
function autoFuzziness(len: number): number {
  if (len <= 2) return 0;
  if (len <= 5) return 1;
  return 2;
}

/** Levenshtein distance between two strings (iterative, O(m·n)). */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  // Early exits
  if (m === 0) return n;
  if (n === 0) return m;
  if (a === b) return 0;

  // Only allocate two rows instead of a full matrix
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  const curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    // Swap rows
    [prev, curr as unknown as number[]] = [curr as unknown as number[], prev];
  }
  return prev[n];
}

/**
 * Returns true if any word in `words` is within the AUTO fuzz budget for `token`.
 * Used only when the exact-match regex pass already scored 0, so this is a
 * cheaper second pass over the pre-split word list.
 */
function fuzzyMatchesAny(token: string, words: string[]): boolean {
  const maxEdits = autoFuzziness(token.length);
  if (maxEdits === 0) return false; // short tokens must be exact
  for (const word of words) {
    // Skip words that differ too much in length to be within budget
    if (Math.abs(word.length - token.length) > maxEdits) continue;
    if (levenshtein(token, word) <= maxEdits) return true;
  }
  return false;
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
