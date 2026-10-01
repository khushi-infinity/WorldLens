# WorldLens Architecture

> "Don't search the web. Step inside it."
> `SEARCH RESULTS → STRUCTURED ENTITIES → RELATIONSHIPS → KNOWLEDGE GRAPH → ML ANALYSIS → INTERACTIVE 3D WORLD`

## 1. System overview

```
┌────────────┐   ┌──────────────┐   ┌─────────────────────────────────┐   ┌──────────────┐
│  Landing + │   │ Query        │   │  SerpApi data engine (server)   │   │  Knowledge   │
│  Search UI │──▶│ Planner      │──▶│  google / news / jobs / scholar │──▶│  pipeline    │
│  (client)  │   │ (server)     │   │  / trends + cache/dedupe/retry  │   │  (server)    │
└────────────┘   └──────────────┘   └─────────────────────────────────┘   └──────┬───────┘
        ▲ normalize → extract → resolve → relationships → embeddings → clusters → scores
        │                                                                       │
        │ streaming progress (newline-delimited JSON)                           ▼
        │                                                        ┌──────────────────────────┐
        └────────────────────────────────────────────────────────│  3D world (R3F client)   │
                                                                 │  gravity layout, evidence │
                                                                 │  panels, snapshots        │
                                                                 └──────────────────────────┘
```

- **Frontend**: Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Three.js via
  `@react-three/fiber` + `@react-three/drei`, zustand for state.
- **Backend**: Next.js Route Handlers (`src/app/api/explore/route.ts`). No separate server.
- **Cache**: file cache `.cache/serpapi/*.json` (TTL 24h) + in-flight dedupe + usage log.
  Swap for Redis/Postgres for multi-instance prod.
- **Modes**: `LIVE` (real SerpApi) / `CACHED` (previously captured real responses) /
  `MOCK` (synthetic fallback, always labeled). Mock never masquerades as real.

## 2. SerpApi integration (`src/lib/serpapi.ts`)

Engines and their purpose:

| Engine | SerpApi engine | Purpose |
|---|---|---|
| Search | `google` | entity discovery, general relationships |
| News | `google_news` | recent developments, co-occurrence relationships |
| Jobs | `google_jobs` | hiring signals, skills, growth |
| Scholar | `google_scholar` | research areas, researchers, institutions, papers |
| Trends | `google_trends` | momentum / emerging topics (relative interest only) |

Rules: never call every engine blindly - the **query planner** (`queryPlanner.ts`)
generates ≤9 topic-aware subqueries and maps each to the engine(s) that justify it.
Request flow per call: dedupe key (`engine + normalized query`) → file cache hit?
→ in-flight map → fetch with 2 retries (exponential backoff, 429-aware) → normalize →
write cache + usage record (`apiUsage` in response meta).

## 3. Query planner (`src/lib/queryPlanner.ts`)

Input: raw topic string. Steps:
1. Extract `core` (topic minus geo qualifiers like "in India") and `geo` ("India").
2. Emit facet subqueries: startups, companies, research labs, universities, funding,
   jobs, safety/policy, generative AI, infrastructure — templated on core+geo so
   "Semiconductor ecosystem in India" yields "semiconductor startups India", etc.
3. Attach engine intents per subquery (search always; news for funding/safety;
   jobs for jobs/skills; scholar for labs/universities; trends for core term).
4. Cap at 9 queries to bound SerpApi spend.

## 4. Graph schema (`src/lib/types.ts`)

Node: `{ id, name, type, description, importance, cluster, confidence, sources[],
signals: { search, news, jobs, scholar, trends }, evidence: EvidenceRef[],
position?: [x,y,z], whyMatters?: string }`.
Entity types: `company | startup | technology | researcher | university | topic |
product | industry | person | location | event | institution`.
Edge: `{ id, source, target, relationship, confidence, evidence[], weight,
provenance: DIRECTLY_OBSERVED | AI_INFERRED }`.
Every edge carries ≥1 evidence item
`{ sourceType, query, title, url, snippet, date? }`. The UI "WHY?" panel renders
exactly these - no relationship without provenance (engineering rule 7).

## 5. Knowledge pipeline (`src/lib/pipeline.ts`)

`USER TOPIC → PLANNER → SERPAPI → RAW → NORMALIZE → EXTRACT → RESOLVE →
RELATIONSHIPS → EMBEDDINGS → CLUSTERING → SCORING → GRAPH → 3D`

- **Normalize** (`normalize.ts`): unify the five engine payload shapes into
  `Observation { engine, query, title, url, domain, snippet, date, extra }`.
- **Extract** (`entities.ts`): heuristic-first. Signals: `knowledge_graph` blocks,
  `company_name` (jobs), author/institution patterns (scholar), org-suffix regex +
  capitalized-phrase mining + domain-derived names (organic/news). Each candidate
  keeps its supporting observations. Optional OpenRouter pass merges/proposes ONLY
  with cited observation ids; unmatched proposals are dropped.
- **Resolve** (`entities.ts` `resolveEntities`): normalized-name key + alias map
  (e.g. IISc ↔ Indian Institute of Science ↔ IISc Bangalore) + domain match +
  token-overlap/Jaccard semantic similarity ≥ 0.62 → single entity. First-seen
  canonical name wins; aliases retained.
- **Relationships** (`relationships.ts`): co-occurrence in same result (weight ∝
  1/√co-entities), knowledge-graph relations, news co-mentions, hiring overlap
  (same company in jobs + search), pattern verbs (partnership/funding/backed by).
  LLM may label the relation type only when evidence exists; otherwise generic
  `related_to`, provenance stays `DIRECTLY_OBSERVED`.
- **Embeddings** (`embeddings.ts`): TF-IDF over `name + description + contexts`,
  cosine similarity. Zero dependencies, explainable, fast for ≤150 entities.
- **Clustering** (`clustering.ts`): hybrid - label-propagation on weighted graph
  (structure) + k-means on TF-IDF vectors (semantics, k ≈ √(n/2) clamped 3–8),
  reconciled by majority vote; clusters named by top TF-IDF terms + dominant type.
- **Layout**: deterministic per-cluster spherical shells, positions computed
  server-side so first paint is already a "universe" (no client physics).

## 6. Scoring formulas (all explainable, all from collected data)

**Search Gravity** `G(e)` ∈ [0,1] - where are the ecosystem's centers of gravity?
```
signals: s_search, s_news, s_jobs, s_scholar, s_trends  (each 0..1, log-normalized counts)
degree:  deg centrality 0..1
G = 0.30·s_search + 0.25·s_news + 0.15·s_jobs + 0.15·s_scholar + 0.15·s_trends
G += 0.15 · degree   → clamp 0..1
```
Drives node size, label prominence, intra-cluster attraction. Shown as the 5-bar
signal meter; every bar traces to real counts.

**Relationship confidence** `C(r)` ∈ [0,1]:
```
C = clamp( 0.25·independentSources(≥1 → 0.25, ≥3 → full)
         + 0.30·cooccurrenceRate
         + 0.15·crossEngineAgreement(news+scholar+jobs corroboration)
         + 0.15·semanticSimilarity(endpoints)
         + 0.15·patternStrength(explicit verb vs bare co-occurrence) )
```
Scholar-only or single-source edges capped at 0.75 and flagged.

**Emergence Score** `E(c)` ∈ [0,1] per cluster - "Emerging cluster detected" iff E ≥ 0.6:
```
E = 0.30·newsRecency(volume of news hits ≤ 60 days, log-norm)
  + 0.25·trendMomentum(relative lift from Trends, else news growth proxy)
  + 0.20·jobsActivity(hiring entities / cluster size)
  + 0.15·researchActivity(scholar hits / cluster size)
  + 0.10·crossSourceAgreement(fraction of engines covering the cluster)
```
The cluster panel renders the WHY with the actual counts (never invented %).

## 7. Evidence model

`EvidenceRef` per node/edge → rendered in Evidence mode: Sources list, per-engine
groups (Search/News/Jobs/Scholar/Trends) with title+url+snippet, `AI_INFERRED`
badge + used-evidence list when applicable. "Why it matters" is templated from
real signals, never LLM-flourish without numbers.

## 8. Temporal / snapshots (`src/lib/snapshots.ts`)

Graph payloads are immutable snapshots `{ id, topic, mode, createdAt, graph }`
stored in localStorage (cap 10). Compare A vs B yields
`new / removed / strengthened / weakened / growingClusters`, visualized by node
halos + a diff list. We never fake historical SERPs - only genuinely captured
snapshots are compared.

## 9. 3D experience (`src/components/WorldCanvas.tsx`)

- R3F Canvas, memoized meshes (≤150 nodes), line segments for edges (weight-filtered),
  drei `Html` labels culled to top-N per cluster + hovered/selected, `OrbitControls`
  (orbit/zoom/pan), damped camera fly-to on select/search, cluster isolate + reset.
- Interactions: hover → highlight neighborhood; click node → focus + intelligence
  panel; click edge (via edge list + raycast-friendly edge dots - lines are thin,
  so picking goes through endpoint spheres + explicit edge inspector) → WHY panel;
  search entity → fly-to; click cluster → isolate; reset → overview.
- Clarity > noise: no ambient particles; subtle starfield background + fog only.

## 10. Loading, errors, demo mode

`/api/explore` streams `{"stage","message","progress","engines"}` events then a final
`{"done":true,"graph","meta"}` frame; `LoadingSequence` renders engine checkmarks +
observation/entity counters from real events. Failures degrade per-engine (empty
observations, flagged in meta) instead of failing the topic. `DEMO MODE` serves
`src/lib/demoGraphs.ts` (previously captured REAL response shapes, labeled CACHED)
for the 3 required ecosystems; AI-India is the flagship.

## 11. Key files

```
src/lib/{types,queryPlanner,serpapi,normalize,entities,relationships,
        embeddings,clustering,scoring,pipeline,cache,snapshots,demoGraphs}.ts
src/app/api/explore/route.ts      POST {topic, mode} → streamed graph build
src/components/{Landing,SearchBar,LoadingSequence,WorldCanvas,IntelligencePanel,
        EvidencePanel,ClusterBar,SnapshotBar}.tsx
src/store/useWorldStore.ts        zustand: stage, graph, selection, snapshots, mode
```
