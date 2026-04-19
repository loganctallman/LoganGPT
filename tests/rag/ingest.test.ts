/**
 * Ingest Pipeline — Output Contract Tests
 *
 * Runs the actual ingest script against a fixture markdown file and validates
 * the shape, content, and chunking invariants of the produced chunks.json.
 * Uses --no-resume --no-embed to avoid network calls and external file deps.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT         = join(__dirname, "../..");
const FIXTURE_DIR  = join(ROOT, "tests/rag/fixtures");
const FIXTURE_PATH = join(FIXTURE_DIR, "test-resume.md");
const OUT_FILE     = join(ROOT, "data/chunks.json");

// ── Fixture content ───────────────────────────────────────────────────────────
// Sections are sized to exercise different code paths:
//   SKILLS is short (fits in one chunk)
//   EMPLOYMENT is long enough (>800 chars) to force at least one split

const FIXTURE_CONTENT = `
PROFILE

Results-driven Senior QA Engineer and SDET with 16+ years of experience building and optimizing automated testing frameworks. Proven track record leading cross-functional QA teams of up to 16 engineers, architecting E2E test suites using Playwright and Selenium WebDriver, and deploying AI QA agents within CI/CD pipelines to reduce regressions and accelerate release cycles. Deep expertise in JIRA and TestRail defect workflows, QA SOPs, and agile ceremonies.

SKILLS

Test Automation: Playwright, Selenium WebDriver, Cypress, Appium
Languages: TypeScript, Python, JavaScript, Java
Frameworks: Page Object Model, BDD/Gherkin, Data-Driven Testing
Tools: JIRA, TestRail, Confluence, GitHub Actions, Jenkins, CircleCI, Azure DevOps
Cloud and Monitoring: AWS, Azure, Datadog, Splunk, PagerDuty
Performance Testing: k6, JMeter, Lighthouse CI

EMPLOYMENT

Extreme Reach — Senior Automation Engineer — Jun 2021 – Present
Led end-to-end automation strategy for a global media ad-tech SaaS platform serving Fortune 500 advertisers. Designed and built a Playwright TypeScript E2E suite from scratch covering over 300 scenarios across staging, QA, and production-mirror environments. Reduced the manual regression cycle from two full days down to four hours by introducing parallel test execution in GitHub Actions. Mentored a team of four junior QA engineers, conducting weekly code reviews and pairing sessions. Collaborated directly with product managers and developers to define acceptance criteria and shift testing left in the SDLC.

Infosys — QA Engineer — Mar 2019 – May 2021
Developed Selenium WebDriver automation in Python for a large-scale healthcare patient portal used by over two million users. Integrated the full test suite into a Jenkins CI pipeline with automated reporting via Allure. Managed the complete defect lifecycle in JIRA from discovery through closure and documented all test plans and test cases in TestRail. Worked in a distributed agile team spanning three continents, communicating across multiple time zones daily.

Freelance QA Consultant — Jan 2018 – Feb 2019
Delivered manual, exploratory, and structured regression testing engagements for three early-stage SaaS startups. Authored detailed test cases, reproducible bug reports, and regression suites from scratch. Introduced formal QA processes, JIRA project setups, and defect triaging workflows where none had previously existed, directly improving release confidence and reducing post-launch defect rates.

EDUCATION

Coursera — Google Professional Certificate in Software Testing
Udemy — Playwright with TypeScript Masterclass
Self-directed study: REST API testing with Postman and REST-assured, performance testing with k6, web accessibility auditing with axe-core following WCAG 2.1 guidelines, and security testing fundamentals.

CONTACT

Email: loganctallman@gmail.com
Phone: (203) 559-0179
Location: Wadesboro, North Carolina 28170
LinkedIn: linkedin.com/in/logantallman
`.trim();

// ── Lifecycle ─────────────────────────────────────────────────────────────────

type RawChunk = {
  id: string;
  text: string;
  source: string;
  section?: string;
  embedding?: number[];
};

let originalChunks: string | null = null;
let chunks: RawChunk[] = [];

beforeAll(() => {
  // Preserve existing chunks.json so production data is restored after tests
  if (existsSync(OUT_FILE)) {
    originalChunks = readFileSync(OUT_FILE, "utf-8");
  }

  if (!existsSync(FIXTURE_DIR)) mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(FIXTURE_PATH, FIXTURE_CONTENT, "utf-8");

  execSync(
    `node scripts/ingest.cjs --no-resume --extra "${FIXTURE_PATH}" --no-embed`,
    { cwd: ROOT, stdio: "pipe" }
  );

  chunks = JSON.parse(readFileSync(OUT_FILE, "utf-8")) as RawChunk[];
});

afterAll(() => {
  // Restore original chunks.json
  if (originalChunks !== null) {
    writeFileSync(OUT_FILE, originalChunks, "utf-8");
  }
  rmSync(FIXTURE_PATH, { force: true });
});

// ── Output structure ──────────────────────────────────────────────────────────

describe("Ingest — output structure", () => {
  it("produces a non-empty JSON array", () => {
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("outputs valid JSON (parseable without error)", () => {
    const raw = readFileSync(OUT_FILE, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("every chunk has required string fields: id, text, source", () => {
    for (const chunk of chunks) {
      expect(typeof chunk.id, `id missing on chunk ${JSON.stringify(chunk)}`).toBe("string");
      expect(typeof chunk.text, `text missing on chunk ${chunk.id}`).toBe("string");
      expect(typeof chunk.source, `source missing on chunk ${chunk.id}`).toBe("string");
    }
  });

  it("source field matches the fixture filename on every chunk", () => {
    for (const chunk of chunks) {
      expect(chunk.source).toBe("test-resume.md");
    }
  });

  it("chunk IDs are globally unique", () => {
    const ids = chunks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("chunk IDs follow the '<source>-<n>' naming convention", () => {
    for (const chunk of chunks) {
      expect(chunk.id).toMatch(/^.+\-\d+$/);
    }
  });
});

// ── Text content invariants ───────────────────────────────────────────────────

describe("Ingest — text content invariants", () => {
  it("no chunk text is below the 30-char flush threshold", () => {
    for (const chunk of chunks) {
      expect(chunk.text.length, `chunk ${chunk.id} text too short`).toBeGreaterThanOrEqual(30);
    }
  });

  it("no chunk text exceeds a safe upper bound (CHUNK_SIZE + single oversized paragraph)", () => {
    const MAX = 800 + 80 + 800; // worst-case: one large paragraph appended to overlap
    for (const chunk of chunks) {
      expect(chunk.text.length, `chunk ${chunk.id} text oversized`).toBeLessThan(MAX);
    }
  });

  it("markdown heading syntax is stripped from chunk text", () => {
    for (const chunk of chunks) {
      expect(chunk.text, `chunk ${chunk.id} contains raw markdown heading`).not.toMatch(/^#{1,6}\s/m);
    }
  });

  it("leading and trailing whitespace is removed from chunk text", () => {
    for (const chunk of chunks) {
      expect(chunk.text).toBe(chunk.text.trim());
    }
  });

  it("content from each section is represented in at least one chunk", () => {
    const allText = chunks.map((c) => c.text.toLowerCase()).join(" ");
    expect(allText).toContain("playwright");
    expect(allText).toContain("selenium");
    expect(allText).toContain("typescript");
    expect(allText).toContain("jira");
    expect(allText).toContain("coursera");
    expect(allText).toContain("loganctallman@gmail.com");
  });
});

// ── Chunking behaviour ────────────────────────────────────────────────────────

describe("Ingest — chunking behaviour", () => {
  it("produces multiple chunks when content exceeds CHUNK_SIZE (800 chars)", () => {
    // EMPLOYMENT section alone is >800 chars — must be split into ≥2 chunks
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("consecutive chunks share overlapping text when a split occurs", () => {
    if (chunks.length < 2) return;

    let foundOverlap = false;
    for (let i = 0; i < chunks.length - 1; i++) {
      // The overlap carries the last CHUNK_OVERLAP (80) chars of the prev buffer
      // into the start of the next buffer, so at least a short phrase should recur.
      const tailSample = chunks[i].text.slice(-60).trim().split(/\s+/).slice(0, 4).join(" ");
      if (tailSample.length > 10 && chunks[i + 1].text.includes(tailSample)) {
        foundOverlap = true;
        break;
      }
    }
    // Overlap is only present when a split occurs. If the fixture all fits in
    // one chunk the assertion is vacuously true — but we guard with the length
    // check above.
    expect(foundOverlap || chunks.length === 1).toBe(true);
  });
});

// ── Embedding behaviour ───────────────────────────────────────────────────────

describe("Ingest — embedding behaviour", () => {
  it("no embeddings are present when run with --no-embed flag", () => {
    for (const chunk of chunks) {
      expect(chunk.embedding).toBeUndefined();
    }
  });
});
