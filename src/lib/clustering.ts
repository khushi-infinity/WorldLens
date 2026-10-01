import type { Observation, EngineName } from "./types";
import type { Candidate } from "./entities";
import { cosine } from "./embeddings";

/** Label propagation on the weighted co-occurrence graph. */
export function labelPropagation(n: number, neighbors: Map<number, { j: number; w: number }[]>): number[] {
  const labels = Array.from({ length: n }, (_, i) => i);
  for (let iter = 0; iter < 12; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const acc = new Map<number, number>();
      for (const { j, w } of neighbors.get(i) ?? []) acc.set(labels[j], (acc.get(labels[j]) ?? 0) + w);
      if (!acc.size) continue;
      let best = labels[i], bestW = -1;
      for (const [lab, w] of acc) if (w > bestW) { bestW = w; best = lab; }
      if (best !== labels[i]) { labels[i] = best; changed = true; }
    }
    if (!changed) break;
  }
  return labels;
}

/** K-means on TF-IDF vectors (cosine). Deterministic seeded init. */
export function kmeans(vectors: number[][], k: number, iters = 25): number[] {
  const n = vectors.length;
  if (!n) return [];
  k = Math.max(1, Math.min(k, n));
  const centroids = Array.from({ length: k }, (_, c) => [...vectors[Math.floor((c * n) / k)]]);
  const assign = new Array(n).fill(0);
  for (let it = 0; it < iters; it++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0, bestS = -Infinity;
      for (let c = 0; c < k; c++) { const s = cosine(vectors[i], centroids[c]); if (s > bestS) { bestS = s; best = c; } }
      if (assign[i] !== best) { assign[i] = best; changed = true; }
    }
    const sums = Array.from({ length: k }, () => new Array(vectors[0].length).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) { counts[assign[i]]++; for (let d = 0; d < vectors[i].length; d++) sums[assign[i]][d] += vectors[i][d]; }
    for (let c = 0; c < k; c++) if (counts[c]) for (let d = 0; d < sums[c].length; d++) centroids[c][d] = sums[c][d] / counts[c];
    if (!changed) break;
  }
  return assign;
}

export interface ClusterDraft { members: number[]; label: string; emergenceScore: number; emerging: boolean; stats: any; why: string[] }

const RECENT_RE = /(hour|day|week|2025|2026|announc|launch|unveil|raise\$|funding)/i;

export function isRecent(o: Observation): boolean {
  if (o.engine !== "news") return false;
  // Honest recency: dated items, or explicit news-freshness cues. Undated items
  // without cues don't count - we never inflate "recent" metrics.
  if (o.date) return true;
  return RECENT_RE.test(`${o.title} ${o.snippet}`);
}

const CLUSTER_STOP = new Set([
  "india", "indian", "data", "news", "report", "global", "national", "digital", "market", "growth",
  "future", "today", "year", "years", "time", "times", "best", "live", "latest", "breaking", "update",
  "announces", "launches", "launched", "says", "said", "will", "over", "amid", "with", "from", "have",
  "makes", "made", "takes", "take", "give", "gives", "getting", "know", "like", "want", "need", "use",
  "show", "shows", "help", "helps", "build", "builds", "solve", "solves", "create", "creates",
]);

/**
 * Distinctive cluster naming. Raw term frequency produces nonsense labels like
 * "Skills Labs" or "Emergent Equal", so terms are scored by how concentrated they
 * are in this cluster relative to the rest of the graph, and a term must appear in
 * at least 40% of members to qualify. Falls back to the highest-gravity member.
 */
function distinctiveTerms(cands: Candidate[], members: number[], allMembers: number[][], top = 2): string[] {
  const inCluster = new Map<string, number>();
  for (const i of members) {
    for (const w of new Set(cands[i].name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/))) {
      if (w.length < 4 || CLUSTER_STOP.has(w)) continue;
      inCluster.set(w, (inCluster.get(w) ?? 0) + 1);
    }
  }
  const total = Math.max(1, allMembers.length);
  const scored = [...inCluster.entries()]
    .map(([w, c]) => ({ w, c, share: c / members.length, lift: c / (total * 0.25) }))
    .filter(x => x.share >= 0.4)
    .map(x => ({ ...x, score: x.lift * Math.log1p(x.c) }))
    .sort((a, b) => b.score - a.score);

  // drop a term if it is already fully contained in a higher-ranked term
  const picked: string[] = [];
  for (const s of scored) {
    if (picked.some(p => p.includes(s.w) || s.w.includes(p))) continue;
    picked.push(s.w);
    if (picked.length >= top) break;
  }
  return picked;
}

/**
 * Hybrid clustering + Emergence Score.
 * E = 0.30·newsRecency + 0.25·trendMomentum + 0.20·jobsActivity + 0.15·research + 0.10·crossSource
 * "Emerging" iff E >= 0.6. Only uses collected data; trend null when unsupported.
 */
export function clusterAndScore(
  cands: Candidate[],
  vectors: number[][],
  neighbors: Map<number, { j: number; w: number }[]>,
  trendMomentum: number | null,
): ClusterDraft[] {
  const n = cands.length;
  if (!n) return [];
  const lp = labelPropagation(n, neighbors);
  const k = Math.max(3, Math.min(8, Math.round(Math.sqrt(n / 2))));
  const km = kmeans(vectors, k);
  // reconcile: group by (structure label, semantic cluster) pair, then merge tiny groups
  const groups = new Map<string, number[]>();
  cands.forEach((_, i) => {
    const g = `${lp[i]}:${km[i]}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(i);
  });
  // merge tiny groups (<3) into nearest by centroid similarity
  const arr = [...groups.values()];
  const centroids = arr.map(m => {
    const c = new Array(vectors[0].length).fill(0);
    for (const i of m) for (let d = 0; d < c.length; d++) c[d] += vectors[i][d];
    return c.map(v => v / Math.max(1, m.length));
  });
  const merged: number[][] = [];
  const used = new Set<number>();
  arr.forEach((m, idx) => {
    if (m.length >= 3 || used.has(idx)) { if (m.length >= 3) { merged.push(m); used.add(idx); } return; }
    let best = -1, bestS = -Infinity;
    arr.forEach((m2, j) => { if (j === idx || m2.length < 3) return; const s = cosine(centroids[idx], centroids[j]); if (s > bestS) { bestS = s; best = j; } });
    if (best >= 0) arr[best].push(...m); else merged.push(m);
    used.add(idx);
  });

  const allMembers = merged.map(m => m);
  return merged.map((members, ci) => {
    let newsRecent = 0, scholarHits = 0;
    const hiring = new Set<number>();
    const engines = new Set<EngineName>();
    members.forEach(i => {
      for (const o of cands[i].observations) {
        engines.add(o.engine);
        if (isRecent(o)) newsRecent++;
        if (o.engine === "scholar") scholarHits++;
        if (o.engine === "jobs") hiring.add(i);
      }
    });
    const logn = (x: number) => Math.min(1, Math.log1p(x) / Math.log1p(12));
    const trend = trendMomentum ?? Math.min(1, logn(newsRecent) * 0.7);
    const E = 0.30 * logn(newsRecent) + 0.25 * trend + 0.20 * Math.min(1, hiring.size / Math.max(1, members.length) * 2)
      + 0.15 * Math.min(1, scholarHits / Math.max(1, members.length)) + 0.10 * (engines.size / 5);
    const terms = distinctiveTerms(cands, members, allMembers);
    const typeCount = new Map<string, number>();
    members.forEach(i => typeCount.set(cands[i].type, (typeCount.get(cands[i].type) ?? 0) + 1));
    const domType = [...typeCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "topic";
    // Name the cluster after its distinctive terms; if no term is distinctive enough,
    // fall back to the highest-gravity member's name so labels stay meaningful.
    const titleCase = (t: string) => t[0].toUpperCase() + t.slice(1);
    const label = terms.length
      ? [...terms.map(titleCase), domType === "topic" ? "" : titleCase(domType)].filter(Boolean).join(" ")
      : cands[members[0]].name;
    const why: string[] = [
      `${members.length} related entities`,
      `${newsRecent} recent news results`,
      trendMomentum != null ? `${Math.round(trendMomentum * 100)}% search momentum` : `momentum proxy ${Math.round(trend * 100)} (news-derived)`,
      `${hiring.size} ${hiring.size === 1 ? "entity" : "entities"} hiring`,
      `${scholarHits} research papers`,
    ];
    return {
      members, label,
      emergenceScore: Math.round(E * 100) / 100,
      emerging: E >= 0.6,
      stats: { newsRecent, trendMomentum, hiringEntities: hiring.size, scholarHits, enginesCovered: [...engines] },
      why,
    };
  });
}
