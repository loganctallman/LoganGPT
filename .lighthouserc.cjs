/**
 * Lighthouse CI configuration — performance budget for LoganGPT.
 *
 * Runs against the production build (next build + next start) so scores
 * reflect real-user conditions, not Next.js dev-mode overhead.
 *
 * Thresholds align with Google's "Good" CWV thresholds:
 *   LCP  < 2.5 s  (Largest Contentful Paint)
 *   CLS  < 0.1   (Cumulative Layout Shift)
 *   TBT  < 200 ms (Total Blocking Time — Lighthouse proxy for INP)
 *   FCP  < 1.8 s  (First Contentful Paint)
 *   SI   < 3.4 s  (Speed Index)
 *   TTI  < 3.5 s  (Time to Interactive)
 */

/** @type {import('@lhci/cli').LighthouseRcFile} */
module.exports = {
  ci: {
    collect: {
      url: ["http://localhost:3000"],
      // LHCI starts the production server, waits for it to respond, then audits
      startServerCommand: "npm run start",
      startServerReadyPattern: "localhost",
      startServerReadyTimeout: 20000,
      numberOfRuns: 2, // median of 2 runs — good balance of accuracy vs CI speed
      settings: {
        preset: "desktop",
        // Throttle to simulate a reasonable production connection (not Fast 3G)
        throttlingMethod: "simulate",
        throttling: {
          rttMs: 40,
          throughputKbps: 10_240,
          cpuSlowdownMultiplier: 1,
        },
        // Skip audits that don't apply to a local-only app
        skipAudits: [
          "uses-http2",      // localhost is HTTP/1.1
          "redirects-http",  // no HTTPS on localhost
        ],
      },
    },

    assert: {
      // Fail the CI job on critical violations; warn on advisory ones
      assertions: {
        // ── Core Web Vitals (Google "Good" thresholds) ───────────────────────
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift":  ["error", { maxNumericValue: 0.1  }],
        "total-blocking-time":      ["error", { maxNumericValue: 200  }],

        // ── Additional paint / interactivity metrics ──────────────────────────
        "first-contentful-paint":   ["error", { maxNumericValue: 1800 }],
        "speed-index":              ["warn",  { maxNumericValue: 3400 }],
        "interactive":              ["warn",  { maxNumericValue: 3500 }],

        // ── Lighthouse category scores ────────────────────────────────────────
        "categories:performance":   ["error", { minScore: 0.85 }],
        "categories:accessibility": ["warn",  { minScore: 0.90 }],
        "categories:best-practices":["warn",  { minScore: 0.90 }],
        "categories:seo":           ["warn",  { minScore: 0.90 }],

        // ── Bundle hygiene ────────────────────────────────────────────────────
        "unused-javascript":        ["warn",  { maxLength: 0 }],
        "uses-text-compression":    ["warn"],
        "render-blocking-resources":["warn"],

        // ── Intentionally silenced ────────────────────────────────────────────
        "uses-rel-preconnect": "off", // OpenAI API is runtime-only; no preconnect needed
        "uses-http2":          "off", // localhost is HTTP/1.1 by definition
        "redirects-http":      "off", // no HTTPS on localhost
      },
    },

    upload: {
      // Stores reports in LHCI's free temporary public storage so you can
      // view historical trends and share report links from CI runs.
      target: "temporary-public-storage",
    },
  },
};
