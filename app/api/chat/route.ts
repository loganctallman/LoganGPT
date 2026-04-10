import { createOpenAI } from "@ai-sdk/openai";
import { streamText, embed } from "ai";
import { readFileSync } from "fs";
import { join } from "path";
import { retrieve, retrieveSemantic, type Chunk } from "@/lib/retrieval";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// ── Knowledge base ────────────────────────────────────────────────────────────
// Loaded once at module level — cached between requests in prod
let chunks: Chunk[] = [];
try {
  const filePath = join(process.cwd(), "data", "chunks.json");
  chunks = JSON.parse(readFileSync(filePath, "utf-8")) as Chunk[];
} catch {
  console.warn(
    "data/chunks.json not found. Run `npm run ingest` first to generate it."
  );
}

// Detect whether embeddings were generated during ingest
const chunksHaveEmbeddings = chunks.length > 0 && Array.isArray(chunks[0].embedding);

export async function POST(req: Request) {
  // ── Rate limiting ────────────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(ip)) {
    return new Response("Too many requests. Please slow down.", { status: 429 });
  }

  const { messages } = await req.json();

  // ── Initialise provider ───────────────────────────────────────────────────────
  const gateway = createOpenAI({
    baseURL: process.env.AI_GATEWAY_URL ?? "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY,
  });
  const MODEL = process.env.MODEL ?? "gpt-4o-mini";

  // ── Context pruning ───────────────────────────────────────────────────────────
  // Keep last 10 messages to avoid runaway token costs in long sessions
  const MAX_MESSAGES = 10;
  const prunedMessages =
    messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages;

  // ── Retrieval ─────────────────────────────────────────────────────────────────
  const lastUser = [...prunedMessages]
    .reverse()
    .find((m: { role: string }) => m.role === "user");
  const query: string = lastUser?.content ?? "";

  let relevant: Chunk[];

  if (chunksHaveEmbeddings) {
    // Semantic search — embed the query at request time, then cosine-match
    // Use direct OpenAI for embeddings (gateway may not proxy embedding endpoints)
    const openaiDirect = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { embedding: queryEmbedding } = await embed({
      model: openaiDirect.embedding("text-embedding-3-small"),
      value: query,
    });
    relevant = retrieveSemantic(queryEmbedding, chunks, 5);
    // If semantic search yields nothing above threshold, fall back to keyword
    if (relevant.length === 0) relevant = retrieve(query, chunks, 5);
  } else {
    relevant = retrieve(query, chunks, 5);
  }

  const context =
    relevant.length > 0
      ? relevant
          .map(
            (c, i) =>
              `[${i + 1}] (source: ${c.source}${c.section ? ` — ${c.section}` : ""})\n${c.text}`
          )
          .join("\n\n")
      : "No relevant information found.";

  const systemPrompt = `You are LoganGPT, a helpful assistant that answers questions about Logan Tallman.
Answer only using the context excerpts below. Do not make up information.
If the answer is not covered by the context, say "I don't have that information about Logan."
Context from resume.pdf is the primary source of truth. Context from extra.md is supplementary background — use it to add color or personality detail, but defer to the resume for any factual claims about Logan's experience, skills, or history.
When answering, use clear formatting where appropriate — bullet points for lists of skills or responsibilities, bold for emphasis on key terms. Keep responses concise and direct.

--- CONTEXT ---
${context}
--- END CONTEXT ---`;

  const result = streamText({
    model: gateway(MODEL),
    system: systemPrompt,
    messages: prunedMessages,
    onError: (err) => {
      console.error("[chat] streamText error:", JSON.stringify(err));
    },
  });

  return result.toDataStreamResponse({
    getErrorMessage: (err) => {
      console.error("[chat] error:", err);
      return err instanceof Error ? err.message : String(err);
    },
  });
}
