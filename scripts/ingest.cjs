#!/usr/bin/env node
/**
 * One-time ingestion script.
 *
 * Usage:
 *   node scripts/ingest.js [--resume path/to/resume.pdf] [--extra path/to/extra.md] [--no-embed]
 *
 * Defaults:
 *   --resume    ./resume.pdf
 *   --extra     ./extra.md  (optional, skipped if not found)
 *   --no-embed  skip embedding generation (faster, uses keyword search only)
 *
 * Outputs: data/chunks.json
 *
 * Embeddings require OPENAI_API_KEY in the environment or in .env.local.
 */

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

// ── Load .env.local ────────────────────────────────────────────────────────────
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

// ── CLI args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : fallback;
}
const _resumeDefault = fs.existsSync(path.join(process.cwd(), "resume.docx"))
  ? path.join(process.cwd(), "resume.docx")
  : path.join(process.cwd(), "resume.pdf");
const resumePath = getArg("--resume", _resumeDefault);
const extraPath   = getArg("--extra",  path.join(process.cwd(), "extra.md"));
const skipEmbed   = args.includes("--no-embed");
const skipResume  = args.includes("--no-resume");

// ── Config ─────────────────────────────────────────────────────────────────────
const CHUNK_SIZE      = 800;
const CHUNK_OVERLAP   = 80;
const EMBED_BATCH     = 100;  // max texts per OpenAI embeddings request
const EMBED_MODEL     = "text-embedding-3-small";

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizeText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

let chunkCounter = 0;

function splitIntoChunks(text, source, section) {
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let buffer = "";

  function flush() {
    const trimmed = buffer.trim();
    if (trimmed.length < 30) return;
    chunks.push({
      id: `${source}-${chunkCounter++}`,
      text: trimmed,
      source,
      ...(section ? { section } : {}),
    });
  }

  for (const para of paragraphs) {
    if (buffer.length + para.length > CHUNK_SIZE && buffer.length > 0) {
      flush();
      buffer = buffer.slice(-CHUNK_OVERLAP) + "\n\n" + para;
    } else {
      buffer = buffer ? buffer + "\n\n" + para : para;
    }
  }
  if (buffer.trim()) flush();

  return chunks;
}

function detectSection(lines, index) {
  const line = lines[index].trim();
  if (!line) return null;
  if (line.length > 60) return null;
  if (/^[A-Z][A-Z\s&/\-]{2,}$/.test(line) && /[A-Z]{3}/.test(line)) return line;
  return null;
}

// ── Embedding generation ───────────────────────────────────────────────────────

async function generateEmbeddings(texts, apiKey) {
  const embeddings = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const batchNum = Math.floor(i / EMBED_BATCH) + 1;
    const totalBatches = Math.ceil(texts.length / EMBED_BATCH);
    process.stdout.write(
      `   Embedding batch ${batchNum}/${totalBatches} (${batch.length} chunks)...`
    );

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        `OpenAI embeddings API error ${response.status}: ${JSON.stringify(err)}`
      );
    }

    const data = await response.json();
    // OpenAI returns items sorted by index
    embeddings.push(...data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
    console.log(" done.");
  }
  return embeddings;
}

// ── Ingestion ──────────────────────────────────────────────────────────────────

const JOB_DATE_RE = /^[A-Z][a-z]{2} \d{4}\s*[—–-]\s*(?:[A-Z][a-z]{2} \d{4}|Present)/;

async function ingestDOCX(filePath) {
  console.log(`📄 Parsing DOCX: ${filePath}`);
  const { value: rawText } = await mammoth.extractRawText({ path: filePath });

  const preProcessed = rawText
    .split("\n")
    .map((line) => (JOB_DATE_RE.test(line.trim()) ? "\n" + line : line))
    .join("\n");

  const normalized = normalizeText(preProcessed);
  const lines = normalized.split("\n");
  let currentSection = "Resume";
  const sectionedText = [];
  let block = [];

  for (let i = 0; i < lines.length; i++) {
    const heading = detectSection(lines, i);
    if (heading && block.length > 0) {
      sectionedText.push({ section: currentSection, text: block.join("\n") });
      block = [];
      currentSection = heading;
    } else {
      block.push(lines[i]);
    }
  }
  if (block.length > 0) {
    sectionedText.push({ section: currentSection, text: block.join("\n") });
  }

  const source = path.basename(filePath);
  const chunks = [];
  for (const { section, text } of sectionedText) {
    chunks.push(...splitIntoChunks(text, source, section));
  }
  return chunks;
}

async function ingestPDF(filePath) {
  console.log(`📄 Parsing PDF: ${filePath}`);
  const buffer = fs.readFileSync(filePath);
  const { text } = await pdfParse(buffer);

  const preProcessed = text
    .split("\n")
    .map((line) => (JOB_DATE_RE.test(line.trim()) ? "\n" + line : line))
    .join("\n");

  const normalized = normalizeText(preProcessed);
  const lines = normalized.split("\n");
  let currentSection = "Resume";
  const sectionedText = [];
  let block = [];

  for (let i = 0; i < lines.length; i++) {
    const heading = detectSection(lines, i);
    if (heading && block.length > 0) {
      sectionedText.push({ section: currentSection, text: block.join("\n") });
      block = [];
      currentSection = heading;
    } else {
      block.push(lines[i]);
    }
  }
  if (block.length > 0) {
    sectionedText.push({ section: currentSection, text: block.join("\n") });
  }

  const source = path.basename(filePath);
  const chunks = [];
  for (const { section, text } of sectionedText) {
    chunks.push(...splitIntoChunks(text, source, section));
  }
  return chunks;
}

function ingestText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  console.log(`📝 Parsing text file: ${filePath}`);
  let text = fs.readFileSync(filePath, "utf-8");

  if (ext === ".md" || ext === ".markdown") {
    text = text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/`{3}[\s\S]*?`{3}/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^#{1,6}\s+/gm, "");
  }

  const normalized = normalizeText(text);
  const source = path.basename(filePath);
  return splitIntoChunks(normalized, source, undefined);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const allChunks = [];

  if (skipResume) {
    console.log("⏭️  Skipping resume (--no-resume).");
  } else if (!fs.existsSync(resumePath)) {
    console.error(`❌ Resume not found at: ${resumePath}`);
    console.error("   Place your resume as resume.pdf or resume.docx in the project root,");
    console.error("   pass --resume <path>, or use --no-resume to skip it.");
    process.exit(1);
  } else {
    const ext = path.extname(resumePath).toLowerCase();
    if (ext === ".docx") {
      allChunks.push(...(await ingestDOCX(resumePath)));
    } else {
      allChunks.push(...(await ingestPDF(resumePath)));
    }
  }

  if (fs.existsSync(extraPath)) {
    allChunks.push(...ingestText(extraPath));
  } else {
    console.log(`ℹ️  No extra file found at ${extraPath} — skipping.`);
  }

  // ── Generate embeddings ──────────────────────────────────────────────────────
  if (!skipEmbed) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn(
        "⚠️  OPENAI_API_KEY not set — skipping embeddings. Using keyword search only.\n" +
        "   Run with --no-embed to suppress this warning, or set OPENAI_API_KEY."
      );
    } else {
      console.log(`\n🔢 Generating embeddings (${EMBED_MODEL}) for ${allChunks.length} chunks…`);
      const texts = allChunks.map((c) => c.text);
      const embeddings = await generateEmbeddings(texts, apiKey);
      for (let i = 0; i < allChunks.length; i++) {
        allChunks[i].embedding = embeddings[i];
      }
      console.log("✅ Embeddings generated.");
    }
  } else {
    console.log("⏭️  Skipping embeddings (--no-embed).");
  }

  // ── Write output ─────────────────────────────────────────────────────────────
  const outDir  = path.join(process.cwd(), "data");
  const outFile = path.join(outDir, "chunks.json");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  fs.writeFileSync(outFile, JSON.stringify(allChunks, null, 2));
  console.log(`\n✅ Wrote ${allChunks.length} chunks → ${outFile}`);
  if (allChunks[0]?.embedding) {
    console.log(`   Embedding dimensions: ${allChunks[0].embedding.length}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
