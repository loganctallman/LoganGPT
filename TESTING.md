# Testing Strategy — LoganGPT

**Author:** Logan Tallman, Senior SDET  
**Stack:** Next.js 15 · React 19 · Vercel AI SDK · OpenAI RAG pipeline  
**Frameworks:** Vitest 4 · Playwright 1.59 · Lighthouse CI · axe-core

---

## Overview

LoganGPT is an AI portfolio chatbot backed by a Retrieval-Augmented Generation (RAG) pipeline. The test suite is architected to give fast, precise signal at every layer of the stack while keeping CI time under 10 minutes for the critical path.

The guiding principle is **risk-proportional coverage**: unit tests own the logic that's easy to break silently (retrieval scoring, rate limiting, prompt construction), E2E owns the user-facing flows that must never regress, and Lighthouse CI owns the production performance contract. Each layer catches different failure modes — overlap between them is waste, not safety.

---

## Table of Contents

1. [Test Architecture](#test-architecture)
2. [Running the Suite](#running-the-suite)
3. [Vitest — Unit & Integration](#vitest--unit--integration)
4. [RAG Quality Methodology](#rag-quality-methodology)
5. [Playwright — E2E](#playwright--e2e)
6. [Accessibility Standards](#accessibility-standards)
7. [Performance Budget](#performance-budget)
8. [Visual Regression](#visual-regression)
9. [Chaos & Resilience](#chaos--resilience)
10. [Cross-Browser & Responsive Strategy](#cross-browser--responsive-strategy)
11. [CI/CD Gate Logic](#cicd-gate-logic)
12. [Coverage Thresholds](#coverage-thresholds)
13. [Known Limitations & Mitigations](#known-limitations--mitigations)

---

## Test Architecture

```
                    ┌──────────────────────────┐
                    │    Visual Regression      │   9 screenshots · Chromium only
                    │    Lighthouse CI          │   Core Web Vitals · prod build
                    ├──────────────────────────┤
                    │    E2E (Playwright)        │  146 tests
                    │    · Chat flows            │  Chromium + Firefox + Mobile Chrome
                    │    · Accessibility         │
                    │    · Performance timing    │
                    │    · Chaos / Resilience    │
                    ├──────────────────────────┤
                    │    Integration (Vitest)    │  141 tests
                    │    · RAG retrieval quality │  No browser, no OpenAI API calls
                    │    · Ingest pipeline       │
                    │    · Prompt injection      │
                    │    · API contracts         │
                    │    · Unit logic            │
                    └──────────────────────────┘
                              287 tests total
```

**Why this split:** The Vitest layer runs in ~1 second with no external dependencies and catches the vast majority of logic regressions before a single browser opens. Playwright owns the surface area where interaction, state management, and streaming rendering intersect — things that are impossible to assert without a real browser. Lighthouse CI runs only after a production build succeeds, ensuring performance budgets reflect real-user conditions rather than dev-mode overhead.

---

## Running the Suite

```bash
# Unit + integration tests (Vitest)
npm run test:unit

# Unit tests with coverage report
npm run test:coverage

# Full E2E suite — all browsers
npm test

# E2E by concern
npm run test:perf          # performance timing gates
npm run test:visual        # visual regression — compare to baselines
npm run test:visual:update # regenerate golden snapshots after intentional UI change

# Single browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=mobile-chrome

# Lighthouse CI (requires production build)
npm run build && npm run lhci
```

> Tests mock all external API calls via `page.route()` and `vi.mock()`. Set `OPENAI_API_KEY` to any non-empty string — it is never called during test runs.

---

## Vitest — Unit & Integration

**141 tests · 9 files · ~1 s runtime**

I keep the Vitest suite focused on code that is (a) complex enough to have non-obvious failure modes and (b) impossible to catch through UI-level assertions alone. Rate limiting, retrieval scoring math, and prompt construction all fit that criterion. Simple passthrough code does not.

| File | Tests | What it owns |
|------|-------|-------------|
| `tests/unit/retrieval.test.ts` | 18 | Cosine similarity, keyword tokenization, synonym expansion, section boost (4×), resume boost (1.5×), Levenshtein fuzzy matching, score normalization |
| `tests/unit/rate-limit.test.ts` | 12 | Sliding window per IP, 20 req/min cap, boundary at 19th/20th/21st request, window reset at 60 s |
| `tests/unit/utils.test.ts` | 8 | `formatRelativeTime` — "just now", minutes, hours, edge cases |
| `tests/api/health.test.ts` | 6 | `/api/health` shape, status code, content-type |
| `tests/api/chat.test.ts` | 9 | `/api/chat` streaming format, malformed body, 429 response, missing fields |
| `tests/rag/retrieval-quality.test.ts` | 28 | MRR@5, Precision@3, 15 golden queries, edge cases |
| `tests/rag/ingest.test.ts` | 14 | Ingest subprocess integration — JSON validity, field requirements, ID format, chunk size bounds, overlap |
| `tests/rag/chaos.test.ts` | 15 | Empty KB, context delimiter integrity, `streamText` error propagation, message pruning, malformed inputs |
| `tests/rag/prompt-injection.test.ts` | 15 | 15 adversarial payloads; system prompt integrity on every request |

### Design Decisions

**Ingest tests use subprocess invocation.** The ingest script (`scripts/ingest.cjs`) calls `main()` on require and cannot be unit-tested via import. I test it as a black box using `execSync` — asserting the output JSON structure and content without coupling tests to internal implementation. The test backs up and restores `data/chunks.json` around each run.

**RAG chaos tests mock at the module level.** `vi.mock("fs")` returns `"[]"` for chunk data so the knowledge base is always empty in isolation tests. This lets me assert system prompt construction, delimiter injection, and error propagation without any real chunk data.

**Prompt injection tests capture the system string.** `vi.mocked(streamText).mockImplementationOnce` intercepts the `streamText` call and captures the exact system prompt passed to it. Tests assert that adversarial user input cannot alter the system prompt's context delimiters, role instructions, or source citations — even under SQL injection, XSS, null-byte, and role-hijack payloads.

---

## RAG Quality Methodology

The retrieval pipeline uses a **dual-path architecture**: a semantic path (cosine similarity on OpenAI `text-embedding-3-small` embeddings) with a keyword fallback (Levenshtein fuzzy matching, synonym expansion, section boost, resume boost). Testing retrieval quality in CI without calling the OpenAI API required a purpose-built evaluation harness.

### How It Works

I built a 10-chunk synthetic corpus with hand-crafted 4-dimensional embeddings that encode thematic distance. Real retrieval math runs against this corpus, but no network calls are made. The evaluation runs 15 **golden queries** — one per major resume topic — and computes two IR metrics:

**MRR@5 (Mean Reciprocal Rank)**
```
MRR = mean(1 / rank_of_first_relevant_chunk)
```
A score of 1.0 means the relevant chunk always ranks first. The gate is **≥ 0.65** — meaning the right chunk consistently surfaces in the top 1–2 positions.

**Mean Precision@3**
```
P@3 = mean(relevant_results_in_top_3 / 3)
```
The gate is **≥ 0.40** — at least one clearly relevant chunk in the top 3. This reflects the actual context window constraint: we pass the top-K chunks to the LLM, so ranking quality directly impacts answer quality.

### Edge Cases Covered

| Edge case | Why it matters |
|-----------|---------------|
| Fuzzy typo (`"playwrigt"`) | Real user queries contain misspellings |
| 2 000-character query | Maximum input stress |
| Emoji and unicode | Non-ASCII tokenization correctness |
| Short tokens (`"ci"`, `"cd"`) | Tokenizer filters ≤ 2-char tokens; queries must use full-word synonyms |
| Synonym fallback | `"work"` → `["employment", "position", "role"]` — must not over-boost unrelated chunks |

---

## Playwright — E2E

**146 tests · 6 spec files**

All routes are intercepted via `page.route()` — no real OpenAI calls, no real health check responses. A `globalSetup` file pre-warms the Next.js dev server before any test runs, eliminating a cold-start hydration race where `fill()` fires before React has mounted its event listeners.

### Chat Flows (`tests/chat.spec.ts`) — 53 tests

Every user-facing journey: empty state and suggested prompts, typing and sending, streaming response display, stop button, retry on error, multi-turn conversation, markdown rendering (bold, lists, inline code), rate limiting (429), clear chat, health tooltip, mobile viewport.

The golden path test asserts the full round trip: user message bubble renders optimistically (before API responds), thinking indicator appears, stream completes, assistant bubble renders with correct content, input re-enables and refocuses.

### Component Behaviour (`tests/components.spec.ts`) — 16 tests

Micro-behaviours that are easy to break silently: character counter appearance (> 400 chars) and colour change (> 480 chars), enter hint visibility, copy button aria-label toggle with 2 s reset, health indicator tooltip states (checking / ok / error), message timestamps on hover.

### Accessibility (`tests/accessibility.spec.ts`) — 32 tests

See [Accessibility Standards](#accessibility-standards).

### Performance (`tests/performance.spec.ts`) — 15 tests

See [Performance Budget](#performance-budget).

### Chaos & Resilience (`tests/chaos.spec.ts`) — 25 tests

See [Chaos & Resilience](#chaos--resilience).

### Visual Regression (`tests/visual.spec.ts`) — 9 tests

See [Visual Regression](#visual-regression).

---

## Accessibility Standards

**Target:** WCAG 2.1 AA · **Tool:** `@axe-core/playwright`

I run automated axe scans across five distinct UI states — not just initial load. A static scan misses violations that only appear when the assistant is responding, when an error occurs, or when streaming is in progress. Each scan filters to `critical` and `serious` violations only; `moderate` and `minor` issues are tracked separately and addressed iteratively.

| State scanned | Violations targeted |
|---------------|-------------------|
| Initial load (empty state) | Landmark structure, heading hierarchy, colour contrast |
| After assistant response | Dynamic content roles, focus management |
| During streaming | `aria-live` region updates, disabled state labels |
| Error state | Error identification (WCAG 3.3.1), recovery path labelling |
| Dark mode (CSS media query) | Contrast under forced colour scheme |

Beyond automated scanning, I validate:

| Requirement | Standard | Method |
|-------------|----------|--------|
| Full keyboard operability | WCAG 2.1.1 | 20-tab traversal, Enter/Space on all interactive elements |
| Focus visibility | WCAG 2.4.7 | `outline-width` / `box-shadow` computed style assertions |
| Touch target size | WCAG 2.5.8 | `boundingBox()` ≥ 44 × 44 px — Send, Resume, Portfolio, prompt chips |
| Reduced motion | WCAG 2.3.3 | `page.emulateMedia({ reducedMotion: "reduce" })` with error listener |
| Live region | WCAG 4.1.3 | `role=log` + `aria-live=polite` on the message container |

---

## Performance Budget

I separate dev-mode timing gates from production budgets deliberately — they catch different things.

**Playwright timing gates** (dev build) catch UI responsiveness regressions: the thinking indicator appearing, the input disabling, the user bubble rendering optimistically. These are React state changes with no network dependency; if they're slow, something in the component tree has regressed.

**Lighthouse CI** (production build) enforces Core Web Vitals against Google's "Good" thresholds. It runs after every push to `main` against the production bundle — minified, tree-shaken, with real throttling simulation.

### Dev-Mode Playwright Gates

| Metric | Gate | What a failure indicates |
|--------|------|--------------------------|
| TTFB | < 800 ms | Server/network issue |
| FCP | < 5 000 ms | Heavy blocking resources |
| DOM Content Loaded | < 5 000 ms | Script parse overhead |
| Thinking indicator | < 1 000 ms | React state update regression |
| Input disabled | < 750 ms | Controlled component latency |
| User bubble render | < 750 ms | Optimistic UI regression |
| Long tasks > 500 ms | 0 | Main thread blocking |
| CLS | < 0.1 | Layout instability |

### Lighthouse CI Production Budget

| Metric | Threshold | Severity |
|--------|-----------|----------|
| LCP | < 2 500 ms | **error** (blocks CI) |
| CLS | < 0.1 | **error** |
| TBT | < 200 ms | **error** |
| FCP | < 1 800 ms | **error** |
| Performance score | ≥ 0.85 | **error** |
| Speed Index | < 3 400 ms | warn |
| TTI | < 3 500 ms | warn |
| Accessibility score | ≥ 0.90 | warn |

Settings: desktop preset · simulated throttling (40 ms RTT, 10 Mbps, no CPU slowdown) · 2 runs, median reported · `uses-http2` and `redirects-http` silenced (localhost is HTTP/1.1 by definition).

---

## Visual Regression

**9 golden screenshots · Playwright `toHaveScreenshot()` · 2% pixel tolerance**

Visual regression catches the class of bug that functional tests miss: a colour variable overriding another, a CSS specificity conflict pushing the input bar up by 2 px, a font weight change making the title unreadable. These regressions are invisible to any assertion-based test.

Screenshots are taken with animations disabled (`animations: "disabled"`) and timestamp spans masked — both sources of false positives that would make the suite noisy rather than signal-rich.

| Snapshot | State |
|----------|-------|
| `empty-desktop` | Initial load, 1 280 × 800 |
| `empty-mobile` | Initial load, 390 × 844 |
| `user-bubble` | Optimistic render before API response |
| `thinking-indicator` | Streaming in progress |
| `completed-response` | Plain text assistant reply |
| `markdown-response` | Rendered lists, bold, inline code |
| `error-state` | Red card + Retry button |
| `char-counter-neutral` | 450 / 500 chars (counter appears) |
| `char-counter-red` | 485 / 500 chars (counter turns red) |

Snapshots are OS- and browser-specific. macOS (`-chromium-darwin.png`) and Linux (`-chromium-linux.png`) baselines are both committed to the repo. On first CI run after adding new screenshots, `--update-snapshots=missing` writes the Linux baselines and the pipeline auto-commits them with `[skip ci]` — no manual intervention required on subsequent runs.

**Updating snapshots after an intentional UI change:**
```bash
npm run test:visual:update   # regenerates macOS baselines
git add tests/visual.spec.ts-snapshots/
git push                     # CI generates and auto-commits Linux equivalents
```

---

## Chaos & Resilience

**25 Playwright tests · Real browser network simulation**

I test chaos at the E2E layer because resilience is ultimately a user experience property — the right question is not "does the error handler fire?" but "does the user have a recovery path?" Every chaos test ends with an assertion that the UI is interactive and either shows useful content or a clear error with a retry mechanism.

| Scenario | Simulation method | Assertion |
|----------|------------------|-----------|
| Partial stream + disconnect | `route.abort()` mid-stream | Content visible; stop button escapes; UI re-enables |
| Malformed SSE | Garbage bytes + mixed valid/invalid lines | No crash, no JS exception |
| Empty 200 body | `route.fulfill({ body: "" })` | No hang; thinking indicator clears |
| Offline before send | `page.context().setOffline(true)` | Error state shown with retry |
| Offline mid-stream | `setOffline(true)` after first chunk | Partial content or error; no exception |
| Network recovery | `setOffline(false)` after error | Subsequent send succeeds |
| Hanging API | Route never fulfilled (30–60 s) | Stop button appears within 500 ms |
| Clear during stream | `setMessages([])` while `isLoading` | Clean state; no ghost messages |
| Double-send prevention | Rapid click before loading state | One request, one bubble |
| 5 000-char response | Long markdown body | Renders without freeze or layout shift |
| Markdown table + list | Complex formatting | No crash; correct DOM structure |
| 2-failure retry chain | Fail → retry → fail → retry → succeed | All three states visible in sequence |
| Health API isolation | Health returns 500 / aborts | Chat functions independently |
| JS error budget | 4-scenario loop with `page.on("pageerror")` | Zero uncaught exceptions |

---

## Cross-Browser & Responsive Strategy

| Project | Engine | Scope | Rationale |
|---------|--------|-------|-----------|
| `chromium` | Blink | Full suite — 146 tests | Canonical project; all layers run here |
| `firefox` | Gecko | Chat · components · accessibility | Validates cross-engine DOM, event delegation, CSS rendering |
| `mobile-chrome` | Blink (Pixel 5, 393 × 851) | Chat · accessibility | Real mobile viewport; catches responsive layout regressions |
| `webkit` | WebKit | Excluded (see below) | Linux WebKit limitation — see Known Limitations |

**Why these exclusions:** Visual regression tests are excluded from Firefox and Mobile Chrome because screenshot baselines are engine-specific — maintaining four sets of PNGs for the same logical state is maintenance cost with no signal gain. Performance tests are excluded because the timing thresholds are calibrated against Chrome's Performance API; different engines report different values for equivalent rendering. Chaos tests are excluded from non-Chromium projects because the 30–60 s hanging-route scenarios would triple CI time for behaviour (React error handling, Vercel AI SDK state) that is framework-level, not browser-level.

---

## CI/CD Gate Logic

```
push / pull_request → main
  │
  ├── [parallel] unit-tests     Vitest · 141 tests · ~1 s
  │
  ├── [parallel] e2e            Playwright · chromium + firefox + mobile-chrome
  │     ├── globalSetup pre-warms Next.js dev server (eliminates hydration race)
  │     ├── --update-snapshots=missing (writes, not overwrites, missing baselines)
  │     └── auto-commits new Linux visual baselines [skip ci]
  │
  └── [needs: unit-tests] lighthouse
        ├── npm run build (production bundle)
        └── lhci autorun → CWV assertions → upload to temporary public storage
  │
  ├── [needs: unit-tests + e2e, PRs only]    deploy-preview → Vercel preview URL
  └── [needs: unit-tests + e2e, main only]   deploy-production → Vercel production
```

**Gate philosophy:** Unit tests gate Lighthouse because there is no value running a 5-minute Lighthouse job against code with failing logic tests. Both unit tests and E2E gate deploys — a passing unit suite with broken user flows should not ship. Lighthouse does not gate deploys directly; it runs as an advisory check that informs but does not block production for warn-level findings.

---

## Coverage Thresholds

Enforced by Vitest on `lib/**/*.ts` (business logic only — not Next.js pages or API route handlers, which are covered by E2E):

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Functions | 90% |
| Branches | 80% |
| Statements | 90% |

The branch threshold is slightly lower than the others by design. Several branches in the retrieval pipeline handle edge cases (empty chunk array, missing embedding field) that are validated at the integration and chaos test level rather than the unit level. Forcing 90% branch coverage there would require mocking internal state that is better tested behaviourally.

---

## Known Limitations & Mitigations

| Limitation | Root cause | Mitigation |
|-----------|-----------|------------|
| WebKit excluded from fill()-dependent tests | Linux WebKit Playwright binary does not reliably fire React 19 `onChange` via `fill()` — synthetic input events are lost before hydration completes | All excluded specs are fully covered by the Chromium project; limitation documented in `playwright.config.ts` with the path to re-enable |
| Visual snapshots are OS-specific | Sub-pixel font rendering differs between macOS and Linux | Both `-darwin` and `-linux` baselines committed to repo; CI auto-generates Linux set on first run |
| RAG quality tests use synthetic embeddings | OpenAI embedding drift is not testable in CI without API calls | Pre-production smoke test recommended after any embedding model change; MRR/P@3 gates catch retrieval logic regressions independently of model quality |
| No sustained load testing | k6 or Artillery not in scope | Lighthouse simulated throttling covers single-user production performance; load testing is a recommended next step for production scale validation |
| Lighthouse requires production build | `next build` adds ~60 s to CI runtime | Runs after unit tests (fast gate first); does not block E2E or deploy path |
