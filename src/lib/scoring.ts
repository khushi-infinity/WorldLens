import type { Candidate } from "./entities";
import type { EngineName } from "./types";

const logn = (x: number, base = 8) => Math.min(1, Math.log1p(x) / Math.log1p(base));

/** Per-engine 0..1 signals from real counts (log-normalized). */
export function signalsFor(c: Candidate): Record<EngineName, number> {
  const counts: Record<EngineName, number> = { search: 0, news: 0, jobs: 0, scholar: 0, trends: 0 };
  for (const o of c.observations) counts[o.engine]++;
  return {
    search: logn(counts.search), news: logn(counts.news),
    jobs: logn(counts.jobs), scholar: logn(counts.scholar), trends: logn(counts.trends),
  };
}

/**
 * Search Gravity G(e) = 0.30·s_search + 0.25·s_news + 0.15·s_jobs + 0.15·s_scholar
 *   + 0.15·s_trends + 0.15·degreeCentrality (clamped 0..1)
 */
export function gravity(signals: Record<EngineName, number>, degree: number): number {
  const g = 0.30 * signals.search + 0.25 * signals.news + 0.15 * signals.jobs
    + 0.15 * signals.scholar + 0.15 * signals.trends + 0.15 * Math.min(1, degree);
  return Math.round(Math.min(1, g) * 100) / 100;
}

/** Node confidence from independent sources + cross-engine agreement. */
export function nodeConfidence(c: Candidate): number {
  const srcs = new Set(c.observations.map(o => o.domain || o.url)).size;
  const engines = new Set(c.observations.map(o => o.engine)).size;
  const v = 0.5 * Math.min(1, srcs / 3) + 0.3 * Math.min(1, engines / 3) + 0.2 * Math.min(1, c.observations.length / 5);
  return Math.round(Math.min(0.97, v) * 100) / 100;
}

/**
 * Deterministic per-cluster spherical layout (server-side, no client physics).
 * Each cluster is a compact constellation on its own shell so the graph reads as
 * distinct neighbourhoods rather than one undifferentiated cloud.
 */
export function layoutPositions(clusterOf: number[], clusterCount: number): [number, number, number][] {
  const perCluster = new Map<number, number[]>();
  clusterOf.forEach((c, i) => { if (!perCluster.has(c)) perCluster.set(c, []); perCluster.get(c)!.push(i); });
  const pos: [number, number, number][] = new Array(clusterOf.length);
  const ids = [...perCluster.keys()].sort((a, b) => perCluster.get(a)!.length - perCluster.get(b)!.length);
  ids.forEach((cid, ci) => {
    const members = perCluster.get(cid)!;
    // Distribute cluster centres evenly on a sphere (golden-angle spiral), then
    // tighten each constellation's radius so members cluster visually.
    const phi = Math.acos(1 - (2 * (ci + 0.5)) / Math.max(1, clusterCount));
    const theta = ci * 2.399963;
    const R = 46;
    const cx = R * Math.sin(phi) * Math.cos(theta);
    const cy = R * Math.cos(phi) * 0.72;
    const cz = R * Math.sin(phi) * Math.sin(theta);
    const r = 5 + Math.sqrt(members.length) * 1.9;
    members.forEach((idx, k) => {
      const a = k * 2.399963;
      const z = (2 * (k + 0.5)) / Math.max(1, members.length) - 1;
      const s = Math.sqrt(Math.max(0, 1 - z * z));
      pos[idx] = [cx + r * s * Math.cos(a), cy + r * z * 0.8, cz + r * s * Math.sin(a)];
    });
  });
  return pos;
}

export function whyMatters(name: string, type: string, cluster: string, counts: Record<EngineName, number>, edges: number): string {
  const parts: string[] = [];
  const total = counts.search + counts.news + counts.jobs + counts.scholar + counts.trends;
  parts.push(`${name} appears in ${total} collected observations`);
  if (counts.news) parts.push(`${counts.news} recent news ${counts.news === 1 ? "mention" : "mentions"}`);
  if (counts.jobs) parts.push(`hiring signal from ${counts.jobs} job ${counts.jobs === 1 ? "listing" : "listings"}`);
  if (counts.scholar) parts.push(`${counts.scholar} research ${counts.scholar === 1 ? "paper" : "papers"}`);
  parts.push(`${edges} graph ${edges === 1 ? "connection" : "connections"} in the ${cluster} cluster`);
  return parts.join(" · ") + ".";
}
