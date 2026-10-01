# WorldLens Development Progress

## Overall Status
Current phase: PHASE 9 complete, UI/UX revision + docs shipped
Estimated completion: Demo-ready
Current blocker: None

## Completed

### Foundation
- [x] Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4
- [x] R3F / three / drei + zustand
- [x] PROGRESS.md, ARCHITECTURE.md, README.md (detailed, with real screenshots)
- [x] .env.example + .env* gitignored

### SerpApi pipeline
- [x] Five engine adapters: google, google_news, google_jobs, google_scholar, google_trends
- [x] Topic-aware query planner (facet subqueries + engine intents, budget-capped)
- [x] File cache (24h TTL), in-flight dedupe, retry + 429 backoff, per-engine fault isolation
- [x] API usage tracking, result normalization to a single Observation shape
- [x] Streaming stage events (ndjson) drive the loading UI

### Knowledge graph
- [x] Heuristic-first extraction: knowledge_graph, jobs company_name, scholar authors/orgs,
      org-suffix mining, guarded capitalized-phrase mining
- [x] Structural filters: isPlausibleEntity, looksLikeProperNoun (function-word / verb
      rejection), generic-head rejection, initials-only author rejection
- [x] Domain-derived entities deliberately removed (publishers are sources, not entities)
- [x] Entity resolution: normalized keys, alias table, domain match, Jaccard similarity
- [x] candidateQuality ranking (corroboration, cross-engine agreement, type prior, junk
      penalties) decides what survives; gravity decides prominence
- [x] Relationships: co-occurrence, verb patterns, cross-engine corroboration
- [x] Provenance DIRECTLY_OBSERVED vs AI_INFERRED on every edge
- [x] Optional OpenRouter enrichment, evidence-bound, ungrounded proposals dropped

### ML
- [x] TF-IDF embeddings + cosine similarity
- [x] Hybrid clustering: label propagation + k-means
- [x] Distinctive cluster naming (concentration-based, not raw frequency)
- [x] Emergence Score (documented, E >= 0.6 = emerging, real counts only)
- [x] Search Gravity and relationship confidence (documented formulas)

### 3D experience
- [x] Node size = gravity, colour = entity type, cluster shells as constellations
- [x] WebGL text labels (replaced drei Html) with camera-distance compensation
- [x] Hover neighborhood highlight, click to select, damped camera fly-to
- [x] Cluster isolate, reset, find-entity with Enter-to-select
- [x] Weak-edge filtering, label culling, node cap for 60fps

### Evidence mode
- [x] Entity panel: signals with real counts, connections with confidence, why-it-matters
- [x] Link panel: relationship type, confidence, provenance, WHY derivation, per-source
      evidence with titles, urls, snippets
- [x] why? button on each connection row (3D dots are too small to hit reliably)

### Time travel
- [x] Immutable snapshots in localStorage (cap 10)
- [x] A/B diff: new, removed, strengthened, weakened, growing clusters
- [x] Purpose explained in-UI before the controls (empty state + info block)

### UI/UX revision (this pass)
- [x] Removed overlapping panels: single right Inspector with Entity / Link / Time travel tabs
- [x] Left rail: collapsible legend + emerging clusters with emergence score badges
- [x] Time travel no longer clipped or jumbled; purpose stated explicitly
- [x] Top bar: single row, responsive wrap, entity finder collapses on mobile
- [x] Mobile: side panels collapse to a bottom sheet; Inspector has an embedded variant
- [x] Fixed loading UI wiping live engine status (store now merges stage events)
- [x] Fixed drei Html removeChild crash (0 console errors verified)
- [x] Fixed fly-to camera landing inside the node
- [x] Removed all em dashes / ellipsis characters from source and docs

### Demo reliability
- [x] Demo Mode: 3 cached ecosystems (AI India flagship, Semiconductors, EVs)
- [x] LIVE / CACHED / MOCK strictly separated and labelled
- [x] Rate-limit / quota failures degrade to cached capture with a warning
- [x] Production build passes; screenshots captured from the running app

## In Progress
- [ ] Nothing blocking

## Remaining
- [ ] Push to github.com/khushi-infinity/WorldLens (needs credentials in this environment)

## Bugs / Technical Debt
- Live extraction quality varies by topic. SERP headlines contain noun stacks
  ("Job Description", "SWOT Analysis") that heuristics cannot fully separate from
  entities. Structural filtering + ranking removes most, but arbitrary topics can still
  surface awkward node names. The bundled demo ecosystems are hand-curated and are the
  polished showcase. Documented in README Known Limitations.
- Google Trends is relative (0-100), never shown as absolute volume.
- Scholar author parsing is heuristic; initials-only names are dropped as ambiguous.
- File cache is single-instance; swap for Redis/Postgres in production (interface already
  isolated in src/lib/cache.ts).
- Snapshots are localStorage only; no multi-device sync (interface is storage-agnostic).

## Decisions Made
- Next.js Route Handlers as the backend; no separate server.
- Heuristic-first extraction; LLM only merges/labels already-retrieved entities.
- Ranking over hard thresholding: filtering removes obvious junk, ranking picks the rest.
  Threshold tuning alone oscillated between 10 clean nodes and 120 noisy ones.
- TF-IDF + cosine instead of hosted vector DB (zero-dep, explainable, fast at this scale).
- Deterministic server-side cluster layout; no client physics.
- WebGL Text instead of drei Html: Html mutates React-owned DOM (crashes) and lets labels
  bleed over the side panels.
- Unified tabbed Inspector instead of separate side panels (eliminated overlap/clipping).
- A discoverable why? button instead of relying solely on small 3D edge dots.
- puppeteer-core for README screenshots, committed under docs/screenshots/.

## APIs / Integrations
- SerpApi: SERPAPI_API_KEY; engines google / google_news / google_jobs / google_scholar /
  google_trends. Validated live.
- OpenRouter: OPENROUTER_API_KEY, optional, model openai/gpt-4o-mini. Enrichment only.
- 3D: three + @react-three/fiber + @react-three/drei.
- Screenshots: puppeteer-core (dev dependency, macOS Chrome).

## Demo Readiness
- [x] Search works
- [x] Real SerpApi data works (LIVE)
- [x] Graph generation works
- [x] 3D interaction works
- [x] Evidence inspection works (entity + link)
- [x] Emerging cluster detection works
- [x] Loading sequence polished (live engine checkmarks + counters)
- [x] Error states handled
- [x] Demo topics tested (3 CACHED ecosystems + 3 LIVE topics)
- [x] Responsive / mobile fallback
- [x] Production build succeeds
- [x] Zero console errors during full screenshot run

## Next 3 Tasks
1. Push to github.com/khushi-infinity/WorldLens.
2. Rehearse the 3-minute demo on the flagship topic.
3. If venue Wi-Fi is unstable, use Demo Mode (cached, labelled, zero fabrication).
