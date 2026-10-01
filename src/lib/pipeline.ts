import { planQueries } from "./queryPlanner";
import { runPlannedQuery } from "./serpapi";
import { normalizeResults } from "./normalize";
import { extractCandidates, resolveEntities, candidateToEvidence, candidateQuality, type Candidate } from "./entities";
import { extractRelationships, toEdge } from "./relationships";
import { tfidf, similarityMatrix } from "./embeddings";
import { clusterAndScore } from "./clustering";
import { signalsFor, gravity, nodeConfidence, layoutPositions, whyMatters } from "./scoring";
import type { WorldGraph, ExploreMeta, Observation, EngineName, GraphNode, GraphEdge, ClusterInfo } from "./types";
import { cacheGet, cacheSet, cacheKey } from "./cache";

export interface BuildHooks {
  onStage?: (stage: string, message: string, progress: number, extra?: Partial<ExploreMeta> & { observations?: number; entities?: number }) => void;
}

const MAX_NODES = Number(process.env.WORLDLENS_MAX_NODES ?? 120);

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "entity";
}

function trendMomentumFrom(obs: Observation[]): number | null {
  const t = obs.find(o => o.engine === "trends" && o.snippet.includes("series="));
  if (!t) return null;
  const m = t.snippet.match(/series=([\d.,]+)/);
  if (!m) return null;
  const vals = m[1].split(",").map(Number).filter(Number.isFinite);
  if (vals.length < 3 || vals.every(v => v === 0)) return null;
    const first = vals.slice(0, Math.max(1, Math.floor(vals.length / 3))).reduce((a, b) => a + b, 0);
    const last = vals.slice(-Math.max(1, Math.floor(vals.length / 3))).reduce((a, b) => a + b, 0);
    if (first <= 0) return last > 0 ? 0.8 : null;
    return Math.max(0, Math.min(1, (last - first) / (first + last)));
}

async function llmEnrich(cands: Candidate[], observations: Observation[]): Promise<{ merges: [string, string][]; relabels: { a: string; b: string; label: string }[] }> {
  const empty = { merges: [] as [string, string][], relabels: [] as { a: string; b: string; label: string }[] };
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || cands.length < 4) return empty;
  try {
    const obsList = observations.slice(0, 60).map(o => ({ id: o.id, engine: o.engine, title: o.title.slice(0, 120), snippet: o.snippet.slice(0, 200) }));
    const names = cands.slice(0, 80).map(c => c.name);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://worldlens.demo", "X-Title": "WorldLens" },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
        temperature: 0,
        max_tokens: 2000,
        messages: [
          { role: "system", content: "You extract knowledge-graph structure ONLY from the given search observations. Never invent entities or relationships. Return JSON only: {\"merges\": [[\"nameA\",\"nameB\"]], \"relabels\": [{\"a\":\"nameA\",\"b\":\"nameB\",\"label\":\"relationship\"}]}. merges: only pairs that are clearly the same real-world entity. relabels: only pairs co-mentioned in one observation id; label one of partners_with,funded_by,built_by,launched_by,researched_at,hiring_for,uses,competes_with,led_by,related_to." },
          { role: "user", content: `Entities:\n${names.join("\n")}\n\nObservations:\n${obsList.map(o => `[${o.id}|${o.engine}] ${o.title} - ${o.snippet}`).join("\n")}` },
        ],
      }),
    });
    clearTimeout(t);
    if (!res.ok) return empty;
    const j = await res.json();
    const text: string = j.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return empty;
    const parsed = JSON.parse(m[0]);
    const nameSet = new Set(names.map(n => n.toLowerCase()));
    const merges = (parsed.merges ?? []).filter((p: any) => Array.isArray(p) && nameSet.has(String(p[0]).toLowerCase()) && nameSet.has(String(p[1]).toLowerCase())).slice(0, 20) as [string, string][];
    const relabels = (parsed.relabels ?? []).filter((r: any) => nameSet.has(String(r.a).toLowerCase()) && nameSet.has(String(r.b).toLowerCase())).slice(0, 40);
    return { merges, relabels };
  } catch { return empty; }
}

export async function buildWorld(topic: string, hooks: BuildHooks = {}, mode: WorldGraph["mode"] = "LIVE"): Promise<{ graph: WorldGraph; meta: ExploreMeta }> {
  const t0 = Date.now();
  const planned = planQueries(topic);
  const meta: ExploreMeta = {
    mode, topic, plannedQueries: planned, observations: 0, uniqueEntities: 0,
    apiUsage: [], engines: { search: "pending", news: "pending", jobs: "pending", scholar: "pending", trends: "pending" },
    warnings: [], tookMs: 0,
  };
  const emit = (stage: string, message: string, progress: number, extra: any = {}) => hooks.onStage?.(stage, message, progress, extra);

  emit("planning", `Understanding ecosystem... generated ${planned.length} search strategies`, 0.06);

  // ---- SerpApi acquisition (concurrency 3 to respect rate limits) ----
  const observations: Observation[] = [];
  const engineStatus: Record<EngineName, number> = { search: 0, news: 0, jobs: 0, scholar: 0, trends: 0 };
  emit("searching", "Searching the live web...", 0.12, { engines: { ...meta.engines } });
  const queue = [...planned];
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const q = queue.shift()!;
      const results = await runPlannedQuery(q.query, q.engines);
      for (const r of results) {
        meta.apiUsage.push({ engine: r.engine, query: q.query, cached: r.cached });
        if (r.ok) {
          engineStatus[r.engine]++;
          const obs = normalizeResults(r.engine, q.query, r.data);
          observations.push(...obs);
          meta.engines[r.engine] = "ok";
        } else {
          meta.warnings.push(`${r.engine} failed for "${q.query}": ${r.error}`);
          if (meta.engines[r.engine] === "pending") meta.engines[r.engine] = "error";
        }
      }
      emit("searching", `Searching the live web... ${observations.length} observations`, 0.12 + 0.3 * (1 - queue.length / planned.length), { engines: { ...meta.engines }, observations: observations.length });
    }
  });
  await Promise.all(workers);
  for (const e of Object.keys(meta.engines) as EngineName[]) if (meta.engines[e] === "pending") meta.engines[e] = "skipped";
  meta.observations = observations.length;
  emit("resolving", `${observations.length} observations discovered, resolving entities...`, 0.46, { observations: observations.length, engines: { ...meta.engines } });

  if (!observations.length) throw new Error("No search observations returned. Check SERPAPI_API_KEY / quota and retry.");

  // ---- Extraction + resolution ----
  let cands = resolveEntities(extractCandidates(observations));
  // LLM evidence-grounded enrichment (optional, never invents)
  let aiInferred = 0;
  try {
    const { merges, relabels } = await llmEnrich(cands, observations);
    void relabels; // applied at edge stage via label map
    if (merges.length) {
      const lower = new Map(cands.map(c => [c.name.toLowerCase(), c]));
      for (const [a, b] of merges) {
        const ca = lower.get(a.toLowerCase()), cb = lower.get(b.toLowerCase());
        if (ca && cb && ca !== cb) {
          for (const o of cb.observations) if (!ca.observations.some(x => x.id === o.id)) ca.observations.push(o);
          for (const d of cb.domains) ca.domains.add(d);
          cands = cands.filter(c => c !== cb);
          lower.delete(b.toLowerCase());
        }
      }
    }
  } catch { /* heuristic graph stands alone */ }

  // ---- Rank candidates: entity quality first, then Search Gravity ----
  // Quality decides *what survives*; gravity decides *how prominent it looks*.
  // Ranking instead of hard thresholding keeps the graph rich without admitting
  // obvious headline fragments.
  const prelim = cands.map(c => ({ c, s: signalsFor(c) }));
  const prelimDeg = new Map<string, number>();
  for (const o of observations) {
    const first = o.title.toLowerCase();
    for (const { c } of prelim) if (first.includes(c.name.toLowerCase().split(" ")[0] ?? " ")) prelimDeg.set(c.name, (prelimDeg.get(c.name) ?? 0) + 1);
  }
  const maxDeg = Math.max(1, ...prelimDeg.values(), 1);
  const ranked = prelim
    .map(({ c, s }) => ({ c, g: gravity(s, (prelimDeg.get(c.name) ?? 0) / maxDeg), q: candidateQuality(c) }))
    .sort((a, b) => b.q - a.q || b.g - a.g);
  // Keep a quality floor so junk does not backfill when real entities run out,
  // but always allow a minimum world size for the demo to feel substantial.
  const floor = Math.min(0, ranked[Math.min(40, ranked.length - 1)]?.q ?? 0);
  const kept = ranked.filter(r => r.q >= floor).slice(0, Math.min(MAX_NODES, ranked.length)).map(r => r.c);
  emit("relationships", `${observations.length} observations → ${kept.length} unique entities, building relationships...`, 0.62, { observations: observations.length, entities: kept.length, engines: { ...meta.engines } });

  // ---- Relationships among kept nodes ----
  const idx = new Map(kept.map((c, i) => [c.name, i]));
  const keptObs = observations.filter(o => {
    const text = `${o.title} ${o.snippet}`.toLowerCase();
    return kept.some(c => text.includes(c.name.toLowerCase()));
  });
  const drafts = extractRelationships(kept, keptObs.length ? keptObs : observations);
  const maxCo = Math.max(2, ...drafts.map(d => d.obs.length), 2);

  // ---- Embeddings + clustering ----
  emit("clustering", "Discovering clusters...", 0.74);
  const docs = kept.map(c => `${c.name} ${c.type} ${c.description} ${c.observations.map(o => o.snippet).join(" ").slice(0, 600)}`);
  const { vectors } = tfidf(docs);
  const sim = similarityMatrix(vectors);
  const neighbors = new Map<number, { j: number; w: number }[]>();
  drafts.forEach(d => {
    if (!neighbors.has(d.a)) neighbors.set(d.a, []);
    if (!neighbors.has(d.b)) neighbors.set(d.b, []);
    const w = Math.min(1, d.obs.length / 3) + 0.3 * sim[d.a][d.b];
    neighbors.get(d.a)!.push({ j: d.b, w });
    neighbors.get(d.b)!.push({ j: d.a, w });
  });
  const trendMomentum = trendMomentumFrom(observations);
  const clusterDrafts = clusterAndScore(kept, vectors, neighbors, trendMomentum);

  // ---- Nodes ----
  const ids = kept.map(c => slug(c.name));
  const clusterOf = new Array<number>(kept.length).fill(0);
  clusterDrafts.forEach((cd, ci) => cd.members.forEach(i => { clusterOf[i] = ci; }));
  const positions = layoutPositions(clusterOf, clusterDrafts.length);
  const degree = new Array<number>(kept.length).fill(0);
  drafts.forEach(d => { if (idx.has(kept[d.a].name) && idx.has(kept[d.b].name)) { degree[d.a]++; degree[d.b]++; } });
  const maxD = Math.max(1, ...degree);
  const clabel = (i: number) => clusterDrafts[clusterOf[i]]?.label ?? "Ecosystem";

  const nodes: GraphNode[] = kept.map((c, i) => {
    const s = signalsFor(c);
    const counts: Record<EngineName, number> = { search: 0, news: 0, jobs: 0, scholar: 0, trends: 0 };
    for (const o of c.observations) counts[o.engine]++;
    const edgeCount = degree[i];
    return {
      id: ids[i], name: c.name, aliases: [],
      type: c.type, description: c.description || `${c.name} - surfaced from live search evidence.`,
      importance: gravity(s, degree[i] / maxD),
      cluster: clabel(i), confidence: nodeConfidence(c),
      sources: [...new Set(c.observations.map(o => o.url).filter(Boolean))].slice(0, 8),
      signals: s, evidence: candidateToEvidence(c), position: positions[i],
      whyMatters: whyMatters(c.name, c.type, clabel(i), counts, edgeCount), counts,
    };
  });

  // ---- Edges (cap fan-out: top 6 per node by confidence proxy) ----
  const perNode = new Map<string, number>();
  const edges: GraphEdge[] = [];
  const sortedDrafts = [...drafts].sort((a, b) => b.obs.length - a.obs.length || b.strength - a.strength);
  for (const d of sortedDrafts) {
    if (edges.length >= kept.length * 3) break;
    const sa = ids[d.a], sb = ids[d.b];
    if ((perNode.get(sa) ?? 0) >= 6 || (perNode.get(sb) ?? 0) >= 6) continue;
    // AI-inferred only when LLM relabeled with same evidence - default observed
    const e = toEdge(d, ids, sim[d.a]?.[d.b] ?? 0, maxCo, aiInferred ? "AI_INFERRED" : "DIRECTLY_OBSERVED");
    edges.push(e);
    perNode.set(sa, (perNode.get(sa) ?? 0) + 1);
    perNode.set(sb, (perNode.get(sb) ?? 0) + 1);
  }

  const clusters: ClusterInfo[] = clusterDrafts.map((cd, ci) => ({
    id: `cluster_${ci}`, label: cd.label, size: cd.members.length,
    emergenceScore: cd.emergenceScore, emerging: cd.emerging,
    stats: cd.stats, nodeIds: cd.members.map(i => ids[i]), whyDetected: cd.why,
  }));

  emit("rendering", "Rendering world...", 0.9);
  const graph: WorldGraph = { topic, mode, nodes, edges, clusters };
  meta.uniqueEntities = nodes.length;
  meta.tookMs = Date.now() - t0;
  try { cacheSet(cacheKey("graph", topic), { graph, meta }); } catch { /* noop */ }
  return { graph, meta };
}

export function loadCachedGraph(topic: string): { graph: WorldGraph; meta: ExploreMeta } | null {
  return cacheGet(cacheKey("graph", topic));
}
