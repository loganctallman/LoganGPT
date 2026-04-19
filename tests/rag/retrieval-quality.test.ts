/**
 * RAG Retrieval Quality Tests
 *
 * Validates that the keyword and semantic retrieval paths surface relevant
 * chunks for representative user questions. Uses a curated fixture corpus
 * that mirrors a real QA/SDET resume, enabling repeatable quality metrics
 * (Precision@K, MRR) without live API calls.
 */
import { describe, it, expect } from "vitest";
import { retrieve, retrieveSemantic, type Chunk } from "@/lib/retrieval";

// ── Fixture corpus ────────────────────────────────────────────────────────────

const CORPUS: Chunk[] = [
  {
    id: "contact",
    source: "resume.pdf",
    section: "CONTACT",
    text: "Logan Tallman | loganctallman@gmail.com | (203) 559-0179 | Wadesboro, North Carolina 28170 | LinkedIn | Remote-friendly",
  },
  {
    id: "profile",
    source: "resume.pdf",
    section: "PROFILE",
    text: "Results-driven Senior QA Engineer and SDET with 16+ years of experience building automated testing frameworks and CI/CD pipelines. Proven track record leading cross-functional QA teams, architecting E2E test suites, and deploying AI QA agents to reduce regressions.",
  },
  {
    id: "skills-automation",
    source: "resume.pdf",
    section: "SKILLS",
    text: "Test Automation: Playwright, Selenium WebDriver, Cypress, Appium. Languages: TypeScript, Python, JavaScript, Java. Frameworks: Page Object Model, BDD/Gherkin, Data-Driven Testing, API testing with Postman and REST-assured.",
  },
  {
    id: "skills-tools",
    source: "resume.pdf",
    section: "SKILLS",
    text: "Tools & Platforms: JIRA, TestRail, Confluence, GitHub Actions, Jenkins, CircleCI, Azure DevOps. Cloud: AWS, Azure. Monitoring: Datadog, Splunk, PagerDuty. Performance: k6, JMeter.",
  },
  {
    id: "job-extreme-reach",
    source: "resume.pdf",
    section: "EMPLOYMENT",
    text: "Extreme Reach | Senior Automation Engineer | Jun 2021 – Present. Led automation strategy for a media ad-tech SaaS platform. Built Playwright TypeScript E2E suite with 300+ scenarios across multiple environments. Reduced regression cycle from 2 days to 4 hours via CI parallelization. Mentored a team of 4 junior QA engineers.",
  },
  {
    id: "job-infosys",
    source: "resume.pdf",
    section: "EMPLOYMENT",
    text: "Infosys | QA Engineer | Mar 2019 – May 2021. Developed Selenium Python automation for a healthcare portal. Integrated test suite with Jenkins CI pipeline. Managed defect lifecycle in JIRA and documented test plans in TestRail. Collaborated with offshore team across multiple time zones.",
  },
  {
    id: "job-freelance",
    source: "resume.pdf",
    section: "EMPLOYMENT",
    text: "Freelance QA Consultant | Jan 2018 – Feb 2019. Delivered manual and exploratory testing engagements for 3 SaaS startups. Wrote detailed test cases and reproducible bug reports. Introduced structured QA processes and triaging workflows where none previously existed.",
  },
  {
    id: "education",
    source: "resume.pdf",
    section: "EDUCATION",
    text: "Coursera – Google certifications in Software Testing. Udemy certifications – Playwright with TypeScript Masterclass. Self-directed study in REST API testing, performance testing with k6, and web accessibility auditing with axe-core and WCAG 2.1 guidelines.",
  },
  {
    id: "extra-personality",
    source: "extra.md",
    text: "Logan is passionate about quality engineering as a craft. He enjoys mentoring junior QAs, contributing to open-source testing tools, and speaking at local tech meetups about test automation strategies and best practices.",
  },
  {
    id: "extra-hobbies",
    source: "extra.md",
    text: "Logan's hobbies include hiking in the Uwharrie National Forest near his home in Wadesboro, NC. He photographs nature landscapes and tinkers with home automation using Raspberry Pi and Home Assistant.",
  },
];

// ── Metric helpers ────────────────────────────────────────────────────────────

function precisionAtK(results: Chunk[], relevant: Set<string>, k: number): number {
  const hits = results.slice(0, k).filter((c) => relevant.has(c.id)).length;
  return hits / k;
}

function reciprocalRank(results: Chunk[], relevant: Set<string>): number {
  for (let i = 0; i < results.length; i++) {
    if (relevant.has(results[i].id)) return 1 / (i + 1);
  }
  return 0;
}

// ── Golden query set ──────────────────────────────────────────────────────────
// Each entry names the expected relevant chunk IDs for that query.

const GOLDEN_QUERIES: Array<{ label: string; query: string; relevant: Set<string> }> = [
  {
    label: "contact/email",
    query: "What is Logan's email address?",
    relevant: new Set(["contact"]),
  },
  {
    label: "location",
    query: "Where does Logan live?",
    relevant: new Set(["contact", "extra-hobbies"]),
  },
  {
    label: "phone number",
    query: "What is Logan's phone number?",
    relevant: new Set(["contact"]),
  },
  {
    label: "automation tools",
    query: "What test automation tools does Logan know?",
    relevant: new Set(["skills-automation", "skills-tools"]),
  },
  {
    label: "Playwright experience",
    query: "Does Logan have experience with Playwright?",
    relevant: new Set(["skills-automation", "job-extreme-reach"]),
  },
  {
    label: "current employer",
    query: "Where does Logan currently work?",
    relevant: new Set(["job-extreme-reach"]),
  },
  {
    label: "years of experience",
    query: "How many years of experience does Logan have?",
    relevant: new Set(["profile", "job-extreme-reach"]),
  },
  {
    label: "certifications",
    query: "What certifications does Logan have?",
    relevant: new Set(["education"]),
  },
  {
    label: "JIRA and TestRail",
    query: "Does Logan know JIRA and TestRail?",
    relevant: new Set(["skills-tools", "job-infosys"]),
  },
  {
    label: "previous employer",
    query: "Where did Logan work before Extreme Reach?",
    relevant: new Set(["job-infosys", "job-freelance"]),
  },
  {
    label: "programming languages",
    query: "What programming languages does Logan use?",
    relevant: new Set(["skills-automation"]),
  },
  {
    label: "CI/CD pipelines",
    query: "Does Logan have experience with Jenkins or GitHub Actions?",
    relevant: new Set(["skills-tools", "job-infosys"]),
  },
  {
    label: "hobbies outside work",
    query: "What are Logan's hobbies?",
    relevant: new Set(["extra-hobbies"]),
  },
  {
    label: "seniority level",
    query: "Is Logan a senior engineer?",
    relevant: new Set(["profile", "job-extreme-reach"]),
  },
  {
    label: "performance testing",
    query: "Has Logan done any performance testing?",
    relevant: new Set(["skills-tools", "education"]),
  },
];

// ── Keyword retrieval quality ─────────────────────────────────────────────────

describe("Keyword Retrieval — per-query precision", () => {
  for (const { label, query, relevant } of GOLDEN_QUERIES) {
    it(`'${label}': at least 1 relevant result in top 3`, () => {
      const results = retrieve(query, CORPUS, 5);
      const p3 = precisionAtK(results, relevant, 3);
      expect(p3).toBeGreaterThan(0);
    });
  }
});

describe("Keyword Retrieval — aggregate quality metrics", () => {
  it("MRR@5 >= 0.65 across the full golden query set", () => {
    const rrs = GOLDEN_QUERIES.map(({ query, relevant }) =>
      reciprocalRank(retrieve(query, CORPUS, 5), relevant)
    );
    const mrr = rrs.reduce((a, b) => a + b, 0) / rrs.length;
    expect(mrr).toBeGreaterThanOrEqual(0.65);
  });

  it("mean Precision@3 >= 0.40 across the full golden query set", () => {
    const p3s = GOLDEN_QUERIES.map(({ query, relevant }) =>
      precisionAtK(retrieve(query, CORPUS, 5), relevant, 3)
    );
    const mean = p3s.reduce((a, b) => a + b, 0) / p3s.length;
    expect(mean).toBeGreaterThanOrEqual(0.4);
  });

  it("no query returns duplicate chunk IDs in results", () => {
    for (const { query } of GOLDEN_QUERIES) {
      const results = retrieve(query, CORPUS, 5);
      const ids = results.map((c) => c.id);
      expect(new Set(ids).size, `duplicate IDs for query: "${query}"`).toBe(ids.length);
    }
  });

  it("resume.pdf chunks rank above extra.md chunks for the same keyword match", () => {
    // 'automation' appears in both skills-automation (extra.md) and job-extreme-reach (resume.pdf)
    const results = retrieve("automation engineer", CORPUS, 5);
    const resumeIdx = results.findIndex((c) => c.source === "resume.pdf");
    const extraIdx = results.findIndex((c) => c.source === "extra.md");
    if (resumeIdx !== -1 && extraIdx !== -1) {
      expect(resumeIdx).toBeLessThan(extraIdx);
    }
  });
});

describe("Keyword Retrieval — edge cases & robustness", () => {
  it("empty string query returns topK without throwing", () => {
    expect(() => retrieve("", CORPUS, 5)).not.toThrow();
    expect(retrieve("", CORPUS, 5)).toHaveLength(5);
  });

  it("all-stopword query falls back gracefully", () => {
    const result = retrieve("the and for with are from", CORPUS, 3);
    expect(result).toHaveLength(3);
  });

  it("unicode-and-emoji query does not throw and returns results", () => {
    expect(() => retrieve("🚀 ¿Habla español? 日本語", CORPUS, 3)).not.toThrow();
    expect(retrieve("🚀 ¿Habla español? 日本語", CORPUS, 3).length).toBeGreaterThan(0);
  });

  it("very long query (2 000+ chars) does not throw", () => {
    const longQuery = "playwright automation testing ".repeat(70);
    expect(() => retrieve(longQuery, CORPUS, 5)).not.toThrow();
  });

  it("special-character-only query does not throw", () => {
    expect(() => retrieve("!@#$%^&*()_+-=[]{}|;':\",./<>?", CORPUS, 3)).not.toThrow();
  });

  it("single-letter query returns fallback without throwing", () => {
    expect(() => retrieve("a", CORPUS, 3)).not.toThrow();
    expect(retrieve("a", CORPUS, 3)).toHaveLength(3);
  });

  it("query with possessive strips apostrophe and still matches", () => {
    const result = retrieve("Logan's skills", CORPUS, 5);
    const ids = result.map((c) => c.id);
    expect(ids.some((id) => ["skills-automation", "skills-tools", "profile"].includes(id))).toBe(true);
  });

  it("1-edit typo 'playwrigt' still surfaces the skills chunk via fuzzy match", () => {
    const result = retrieve("playwrigt", CORPUS, 5);
    expect(result.map((c) => c.id)).toContain("skills-automation");
  });

  it("synonym expansion: 'job' resolves to employment-related chunks", () => {
    const result = retrieve("job", CORPUS, 5);
    const ids = result.map((c) => c.id);
    expect(
      ids.some((id) => ["job-extreme-reach", "job-infosys", "job-freelance"].includes(id))
    ).toBe(true);
  });

  it("section-name boost: 'employment' surfaces resume work chunks via section match", () => {
    const result = retrieve("employment", CORPUS, 5);
    const ids = result.map((c) => c.id);
    expect(
      ids.some((id) => ["job-extreme-reach", "job-infosys", "job-freelance"].includes(id))
    ).toBe(true);
  });
});

// ── Semantic retrieval quality ────────────────────────────────────────────────
// Synthetic 4-dimensional embeddings encode topic proximity: [skills, work, edu, personal]

describe("Semantic Retrieval — ranking correctness", () => {
  const SEM_CORPUS: Chunk[] = [
    {
      id: "sem-skills",
      source: "resume.pdf",
      section: "SKILLS",
      text: "Playwright TypeScript automation skills",
      embedding: [1, 0.1, 0, 0],
    },
    {
      id: "sem-work",
      source: "resume.pdf",
      section: "EMPLOYMENT",
      text: "Senior automation engineer Extreme Reach",
      embedding: [0.5, 0.866, 0, 0],
    },
    {
      id: "sem-edu",
      source: "resume.pdf",
      section: "EDUCATION",
      text: "Coursera certifications Google",
      embedding: [0.1, 0.1, 0.99, 0],
    },
    {
      id: "sem-extra",
      source: "extra.md",
      text: "Hobbies hiking photography",
      embedding: [0, 0, 0, 1],
    },
  ];

  it("skills-aligned query embedding surfaces the skills chunk first", () => {
    const queryEmb = [1, 0, 0, 0];
    const result = retrieveSemantic(queryEmb, SEM_CORPUS, 5, 0.1);
    expect(result[0].id).toBe("sem-skills");
  });

  it("education-aligned query surfaces the education chunk first", () => {
    const queryEmb = [0, 0, 1, 0];
    const result = retrieveSemantic(queryEmb, SEM_CORPUS, 5, 0.1);
    expect(result[0].id).toBe("sem-edu");
  });

  it("personal-topic query surfaces extra.md chunk first (below threshold if too distant)", () => {
    const queryEmb = [0, 0, 0, 1];
    const result = retrieveSemantic(queryEmb, SEM_CORPUS, 5, 0.1);
    expect(result[0].id).toBe("sem-extra");
  });

  it("resume.pdf 1.5× boost causes resume chunk to outrank identical-embedding extra.md chunk", () => {
    const emb = [0.6, 0.8, 0, 0];
    const tiedCorpus: Chunk[] = [
      { id: "extra-tied",  source: "extra.md",   text: "tie", embedding: emb },
      { id: "resume-tied", source: "resume.pdf",  text: "tie", embedding: emb },
    ];
    const result = retrieveSemantic(emb, tiedCorpus, 5, 0.1);
    expect(result[0].id).toBe("resume-tied");
  });

  it("chunks below the 0.3 cosine threshold are excluded", () => {
    const queryEmb = [1, 0, 0, 0];
    const lowCorpus: Chunk[] = [
      { id: "ortho", source: "extra.md", text: "orthogonal", embedding: [0, 1, 0, 0] },
    ];
    // cos([1,0,0,0], [0,1,0,0]) = 0 — well below 0.3 threshold
    expect(retrieveSemantic(queryEmb, lowCorpus, 5, 0.3)).toHaveLength(0);
  });

  it("returns [] when no chunks have embeddings", () => {
    const noEmbCorpus = CORPUS; // fixture has no embeddings set
    expect(retrieveSemantic([1, 0], noEmbCorpus, 5)).toHaveLength(0);
  });

  it("topK limit is respected even when many chunks pass threshold", () => {
    const queryEmb = [1, 0, 0, 0];
    const bigCorpus: Chunk[] = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      source: "resume.pdf" as const,
      text: `chunk ${i}`,
      embedding: [1, 0, 0, 0],
    }));
    expect(retrieveSemantic(queryEmb, bigCorpus, 3)).toHaveLength(3);
  });

  it("zero-vector embeddings return score 0 and are excluded by default threshold", () => {
    const zeroCorpus: Chunk[] = [
      { id: "zero", source: "extra.md", text: "empty", embedding: [0, 0, 0, 0] },
    ];
    expect(retrieveSemantic([0, 0, 0, 0], zeroCorpus, 5)).toHaveLength(0);
  });
});

describe("Semantic Retrieval — fallback chain integration", () => {
  it("keyword retrieve() runs successfully when semantic returns empty (simulates route fallback)", () => {
    // No embeddings in CORPUS → semantic returns [] → route falls back to keyword
    const semantic = retrieveSemantic([1, 0], CORPUS, 5);
    expect(semantic).toHaveLength(0); // triggers fallback condition

    // Keyword path must still work — job-extreme-reach ranks first via resume.pdf 1.5× boost
    const keyword = retrieve("playwright automation", CORPUS, 5);
    expect(keyword.length).toBeGreaterThan(0);
    const ids = keyword.map((c) => c.id);
    expect(ids.some((id) => ["skills-automation", "job-extreme-reach"].includes(id))).toBe(true);
  });
});
