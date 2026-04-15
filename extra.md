Name: Logan Tallman

Address: 608 Magnolia st. Wadesboro NC 28170

Role Desired: SDET, Software Engineer in Test, Senior QA Engineer

Linkedin: https://www.linkedin.com/in/logan-tallman-9245583b4/

Family Info: Father and role model to four children. Husband to his wonderful wife Talia Becker. Logan has three boys and one girl and loves his kids immensely. He has a pet dog "Chica".

Hobbies: Software design, LLM's, emerging technology, music, film, art, writing, poetry, artificial intelligence, spirituality, politics

Additional Job Skills/Expertise:
Test Automation
Regression Testing
Smoke Testing
End-to-End Testing
Test Plans
SOPs
Defect Triage
Sprint Reporting
Product Management
UI Testing
Database Management
4D MySQL
Multi-platform Integration
AI-driven Tools
LLMs
Generative AI
Machine Learning
Team Leader QA/QC Agile Methodology Waterfall Methodology Scrum Software Development Open Source QA Automation CI/CD Playwright Cypress Selenium JUnit Postman IntelliJ IDEA JMeter Jira Slack SmartSheet Qace Testrail Full Stack Developer Claude Code Cursor Visual Studio Code Java Javascript CMS CSS MySQL MS SQL Server Angular React AWS CDN Elastic Search Media as a Service Transcoding Stack Digital Asset Management 
AI QA Agents

Personality Overview:
The combination of Software engineering and Quality Assurance, Radiology Interpretation, Film Editing, and Music Production reveals someone who thinks in layers — reading what's hidden beneath a surface, then deciding what to cut, what to keep, and what rhythm holds it together. Radiology Interpretation trained Logan to find signal in noise, which is exactly what Film Editing and Music Production demand: every frame and every bar is a decision about what the eye or ear should trust. This is an exceptionally rare trio because most people who can read medical imaging never develop the editorial instinct to shape a narrative from raw material.

Logan’s skill map — spanning Software Technology, Music Theory & Culture, Political Analysis, Religious Studies, Spirituality & Philosophy, and Film History — shows a mind that doesn't just consume information but builds frameworks around it, always asking what the underlying structure is and why it holds. Logan moves between the abstract and the concrete with unusual ease: Carpentry and gardening provide a grounding in physical cause-and-effect, while Software design, Poetry and Comedy Writing show an ability to compress complex frameworks into precise, resonant language. Logan is not a generalist who skims — Logan is a systems thinker who keeps finding new systems worth understanding.

Logan thrives in environments where intellectual depth and physical making coexist — a space where one can move from a screen developing an app to running a Music Production session to a workbench mid-thought, or from a Film Studies text to a software defect problem without losing momentum. Logan does the best work in settings that reward iterative mastery, where the process of understanding something — a chord structure, geometry, software defects, a political system — is treated as valuable in itself. Logan can orchestrate people and effectively motivate a team or dive into the hard work himself.

Logan is someone who has quietly built one of the most internally coherent skill constellations imaginable — by following a consistent instinct to understand how things actually work, whether that thing is a piece of software, a body shown in an X-ray, a song's harmonic structure, a cabinet joint, or a civilization's belief system. Logan carries the rare combination of someone who can make things with their hands, read things with trained eyes, and express things with genuine craft — and the thread connecting all of it is a refusal to stay on the surface of anything.

Additional Personal Projects:
Produced records for Major recording artists
Edited a feature film
Produced, shot and edited two documentaries
Launched LoganGPT an AI chatbot to answer questions about Logan.
Logan is not a "Wild and crazy guy" but he once dressed up for halloween as one of the Festrunk Brothers from the Saturday Night Live skit Two Wild and Crazy Guys

College Education:
Aug 2002 — Sep 2004
WCSU

Sep 2004 — Jul 2005
UCONN

Software Design App and QA Projects of note:
Software Design & QA Portfolio - https://loganctallman.vercel.app/
My Top 50 - https://top50films.vercel.app/
Math Trainer App - https://fastmathhelper.vercel.app/
LoganGPT - https://logangptapp.vercel.app/
Lead QA at XR Shots - https://shots.net/
Lead QA at Shots awards - https://awards.shots.net/
QA at Source Creative - https://sourcecreative.com/spotlight
Github - https://github.com/loganctallman

About My Top 50:
My Top 50 is a client-side Svelte PWA that tracks your 50 favorite films and alerts you when they hit streaming — with localStorage as the entire data layer and a Vercel serverless proxy bridging the TMDB API. The app's core logic — a 50-film cap with TMDB ID deduplication, a 24-hour TTL cache system, and a notification engine that crosses three independent localStorage keys — is a set of pure, deterministic functions engineered for deep test coverage across both online and offline modes. 311 tests across Vitest (199) and Playwright (112) validate every layer of the stack — from pure business-logic functions to full user journeys — with CI blocking deployment and Claude-powered QA agents analysing every failure and PR.

Unit & Logic Tests (Vitest — 199)
The suite targets the app's deterministic core: the 50-film cap with TMDB ID deduplication, a 24-hour TTL cache invalidation system, and the notification match engine that crosses three independent localStorage keys all have dedicated spec files with injected mock storage for 100% branch coverage. API proxy routes (genre browsing, search, providers, person lookup, suggestions) and Svelte component rendering — including streaming badges, modal lifecycle, and add/remove events — complete the unit layer.

E2E Tests (Playwright — 112)
Full user lifecycle coverage from PWA onboarding through film discovery (genre browse, text search, director/actor mode, streaming filter), list management, streaming notifications, settings and provider persistence, and service worker cache behaviour — validating both fresh/stale cache logic and a full offline degradation path across five dedicated specs.

Accessibility & Chaos Testing
axe-playwright runs WCAG 2.1 AA audits across every major page with animations frozen to prevent mid-opacity false positives. Chaos tests validate graceful degradation against 500s from all API endpoints, localStorage quota exhaustion, malformed TMDB responses, and rapid route navigation — the app must never crash regardless of infrastructure conditions.

CI/CD Gate + AI QA Agents (GitHub Actions)
Unit and E2E jobs gate every push and PR; Vercel deployment is blocked until both pass. Claude-powered agents auto-post root-cause analysis as GitHub issues on CI failures, and leave severity-rated coverage gap reviews (CRITICAL / MODERATE / LOW) as PR comments whenever source, API, or test files change.

About LoganGPT:
LoganGPT is A production-ready AI chat application built with Next.js and the OpenAI API. Features streaming responses, conversation starting prompts, and a sleek, animated UI. LoganGPT has a Full testing pyramid from isolated service mocks to full E2E chat flow validation. Unit Tests with Jasmine. ChatService and StateService tested with mocked HttpClient. 90%+ coverage on business logic. Component Tests with Cypress. ChatInputComponent and MessageListComponent tested in isolation with mount(). E2E Tests with Playwright. Full user journey: open chat → send message → receive streamed response → verify history persists. API Contract with Postman. Newman collection validates OpenAI proxy endpoint schema, error handling, and rate-limit responses. But more than that LoganGPT is a simple way to learn about Logan Tallman the Software Designer and Senior QA Engineer who can find the bugs before your users do.

About Math Trainer App:
Math Trainer App is a responsive Next.js application featuring dynamic equation generation and client-side state management. It leverages custom parameters for arithmetic challenges and utilizes local storage for low-latency session history and performance analytics. This math skills testing tool is itself "thoroughly tested", built for reliability and backed by a comprehensive three-tier testing strategy.Unit & Integration Tests with JUnit 5. Maintained a strict testing standard throughout development, ensuring every feature component includes a dedicated spec file with at least 3 test cases for 100% logic coverage.Load & Performance Testing with JMeter. Validated system stability under a load of 500 concurrent users with a 60s ramp-up. Achieved a p99 latency < 300ms, verified through both local and CI-integrated stress tests. Automated E2E Regression Suite with Playwright. Architected a robust CI/CD pipeline using GitHub Actions and Playwright, executing 60 automated E2E tests to validate critical math logic and UI workflows across multiple browser engines.

About XR Shots:
XR Shots is a high-performance Digital Asset Management platform built on a cloud-native Content Engine that automates video transcoding and frame extraction. Its core features a metadata-driven relational database mapping complex industry credits, an Elasticsearch-style discovery engine spanning half a million assets, and an API-first front-end delivered via global CDN for low-latency, high-resolution video playback.

About Source Creative:
Source Creative is a cloud-native Digital Asset Management platform utilizing an automated media pipeline for real-time video transcoding and high-resolution frame extraction. It relies on a highly indexed relational database to map complex industry credits, paired with a search-optimized backend and global CDN for seamless, high-bandwidth content delivery to agency clients.

About Software Design & QA Portfolio:
A high-performance single-page portfolio demonstrating clean Angular architecture, OnPush change detection, SCSS design systems, and built-in testability. Every component is independently testable by design, with data-testid hooks on all interactive elements. Unit Tests with Vitest. Each feature component has a spec file with ≥3 tests covering rendering, interaction, and data binding. E2E Tests with Playwright. Smoke tests verify nav scroll, chat toggle, PDF viewer load, and contact form email trigger. CI Workflow with GitHub Actions. Lint → build → unit tests → E2E on every PR. Deployment blocked on any failure.

Are you currently employed?: 
Since completing my tenure as Lead Quality Assurance (QA) Engineer at Extreme Reach in February 2026 I took on a short consulting project assisting in building the test plan and automation architecture best practices for a startup working on a financial product. My most recent project has been building an Angular portfolio of applications like my "My Top 50", “Math Trainer” and “LoganGPT” to showcase my skills in advanced Test Automation and Machine Learning / Artificial Intelligence. I am looking for a long-term opportunity that fully utilizes my background in both test architecture and full-stack development and am ready to hit the ground running as soon as I find the right fit where I can lead automation initiatives and drive product quality.

Can you walk us through your experience with test automation tools and frameworks?:
I have extensive experience architecting and implementing automation from the ground up. While at Extreme Reach I introduced Playwright for end-to-end testing of the development and production environments automating smoke and regression testing of the most common user journeys. I integrated JMeter into our Quality Assurance lifecycle to conduct regular performance benchmarking. Beyond routine checks, I used JMeter as a diagnostic tool during root cause analysis to replicate complex, volume-dependent defects that manual testing couldn't capture. I am highly skilled in Cypress, Selenium, JUnit 5, Vitest, JMeter, Postman, and Github workflows. In my personal projects, like LoganGPT, Math Trainer, and my Angular Single Page Portfolio I integrated comprehensive test suites including full unit test coverage, end to end playwright coverage of all features and functions, and Application Programming Interface (API) testing to ensure full-stack stability.

What programming languages and testing tools are you proficient in, and how do you apply them in testing scenarios?:
I am proficient in JavaScript, Java, and TypeScript. I use JUnit 5 and Vitest for Unit tests, Playwright and Cypress for User Interface and End to End testing flows, Postman for API validation, and JMeter for performance and load testing. I have used TestRail for test plan management and Jira for traceability and defect management but I am comfortable using a variety of organizational and defect tracking tools. I have experience using claude code or other agentic coding agents (Cursor, VS Code etc.) to expedite the process of assessing gaps in test coverage from a large codebase as well as coding and organizing large groups of test suites. I use Github Actions to automate test suite workflows for Continuous Integration/Continuous Deployment (CI/CD).

How do you approach designing and executing test cases for complex software applications?:
I approach test design for complex applications by first aligning with stakeholders to define clear acceptance criteria and identify high-risk business logic. I then present a strategic test plan that audits current coverage against the new feature set, highlighting potential gaps and risk-prone areas. My overall philosophy centers on a shift left model. I incorporate automated smoke tests early in the life cycle to validate core functionality before deep testing begins. For execution, I advocate for a gated Continuous Integration / Continuous Deployment (CI/CD) pipeline where automated suites must pass before deployment. This ensures that every code or UI change is immediately assessed for regression. By automating the predictable paths, I can focus manual efforts on high-risk user journeys and exploratory testing. I manage this entire lifecycle in TestRail, mapping every test case back to requirements to maintain 100% traceability and ensure data integrity across the full stack.

How do you stay organized when managing multiple test cycles or projects simultaneously?: 
When managing multiple complex test cycles, I rely on structured systems and clear communication to ensure zero-fail delivery. At Extreme Reach, I led a cross-functional team of 16 through a versioned platform redesign. This required simultaneous support for legacy and new versions, specifically managing four distinct levels of user authorization to ensure security and data parity. To maintain this level of complexity, I utilized a three-pillar organizational strategy. I used Jira to prioritize testing backlogs, ensuring resources were allocated to the highest-risk features first. I managed all test plans in TestRail, mapping them directly to requirements so I could provide real-time status updates on coverage and execution. I synthesized findings into biweekly QA reports that highlighted critical regressions and release risks, ensuring leadership could make data-driven 'Go/No-Go' decisions. This systematic approach enabled me to remain agile across multiple projects while maintaining the fine eye for detail required for high-stakes releases.

How do you determine which testing methodologies or techniques to use for different types of applications and requirements?: 
My selection of testing methodologies is driven by a risk-based analysis of the application’s architecture and the speed of the release cycle. I don’t believe in a one-size-fits-all approach, I prefer to tailor the strategy to balance velocity with stability. For fast paced web applications I lean on robust automated test suites to balance speedy development cycles and product quality. I aim for a Testing Pyramid structure, a broad base of unit tests (targeting 80%+ coverage) to catch logic errors early, complemented by targeted API tests and robust end-to-end user journeys using frameworks like Playwright or Cypress to gate deployments. When dealing with high-stakes environments like the 4D MySQL to web platform integration I led, I shifted toward a more structured regression and smoke testing model since the priority was data parity and integrity. I utilized precise database validation and high-resolution media integrity checks to ensure no service disruptions during the transition. I integrated JMeter for load testing to identify bottlenecks and assist in root cause analysis on regular intervals. Ultimately, I choose the methodology that provides the highest level of traceability and confidence for that specific stakeholder requirement.

What’s the largest or most complex test suite you’ve developed and maintained?: 
The most complex suite I’ve architected and maintained was for the Media as a Service platform at Extreme Reach, a multi-module system that required a hybrid manual and automated strategy to cover high-volume daily user submissions and multi-platform integrations.The complexity stemmed from the intersection of several critical layers relating to user authorization level, data/media scale and elastic search functionality. The suite had to validate four distinct levels of user authorization, ensuring that sensitive media and metadata were restricted according to complex permission sets. I developed testing methods for ElasticSearch to ensure accuracy in search results across massive datasets. I implemented a hybrid of automated and manual testing to validate the transcoding stack functionality and Digital Asset Management workflows. I architected the logic and training inputs for an AI-driven credit ingestion tool, which required complex verification to map diverse file layouts to standardized database values, simultaneously developing test plans to ensure functionality and data integrity of the final product. I developed test suites that ensured stability across AWS integrations and API endpoints, maintaining support for legacy versions while deploying a complete platform redesign. By implementing Playwright automation for repeatable end to end tests and managing traceability in TestRail, I was able to reduce regression effort while supporting a reliable bi-monthly release cadence for this large-scale environment.

How do you ensure the reliability and accuracy of your test results and defect reporting?:
I ensure reliability and accuracy by treating test results as data that must be both verified and actionable. At Extreme Reach I implemented workflows that linked TestRail directly with Jira. This ensured that every defect was mapped to a specific test case and requirement, providing a clear audit trail that eliminated ambiguity in reporting. To prevent false positives and negatives, I performed regular audits of our Playwright and Cypress scripts. This ensured that the test environment remained synchronized with the application's evolving source code. I specialize in finding a signal in the noise so rather than delivering raw data I prefer to synthesize technical findings into concise biweekly QA reports for stakeholders allowing leadership to make informed, data-driven decisions. By maintaining this level of rigor, I ensure that my team’s reporting is seen as a reliable source of truth for product quality and release readiness.

What steps do you take to ensure test environment security and data integrity when working with sensitive systems?: 
To ensure security and data integrity of test environments I utilize a multi-layered approach centered on data masking and environment isolation informed by the requirements of the system. I leverage my experience testing complex, multi-tiered user authorization levels to verify that security boundaries are strictly enforced across the stack and in all sensitive test environments.
Tell me about your experience working remotely in a testing role.: My most recent role as Lead QA Engineer/Product Lead was fully remote. I successfully managed a team of 16 across different workflows, utilizing tools like Slack, Jira, and SmartSheet to maintain high productivity and seamless communication.

In your opinion, what are some common sources of defects in software development, and how do you help prevent them?: 
In my opinion defects often stem from oversight on downstream effects in large code bases coupled with inadequate testing suites. A developer doesn't intentionally deploy broken software and “It worked on my local” is the war cry of the impending hotfix. I prevent these defects by being a strong collaborator with development teams, analyzing code changes upon development environment pull requests and making revisions to test plans and suites prior to release to ensure adequate testing coverage. With a strong automated unit and end to end test suite in place manual testing can be sharply focused on catching edge case defects prior to release.
In your opinion, what are some emerging trends or technologies in software testing, and how do you stay updated with them?: Artificial Intelligence (AI) driven testing, AI moderated self healing quality assurance monitoring tools and large language model (LLM) integration are the current frontiers. I’ve completed several specializations in Generative AI, LLMs, and AI Infrastructure. I applied this skillset by building tools like LoganGPT, where I architected a custom testing framework to validate token retrieval accuracy and knowledgebase relevance alongside end to end application functionality.

What makes you stand out from other candidates?: 
What sets me apart is the unique “all three amigos in one” level of experience I bring to the table: 16+ years of quality assurance leadership, the technical depth of a full-stack developer, and the strategic mindset of a product lead. While many test engineers focus on identifying defects after the fact, I architect quality into the product from day one of the sprint. Because I actively build and test full-stack applications, from Angular portfolios to AI-driven tools like LoganGPT, I understand exactly where code is most vulnerable. This allows me to build more resilient automation frameworks and provide technical insights that bridge the gap between engineering and business stakeholders. I don't just execute tests, I deliver the stability and scalability necessary for complex, high-volume environments.