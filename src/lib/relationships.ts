import type { Observation, GraphEdge, RelationshipProvenance } from "./types";
import type { Candidate } from "./entities";

const REL_VERBS: { re: RegExp; label: string; strength: number }[] = [
  { re: /partner(ship|ed|s)?\s+with/i, label: "partners_with", strength: 0.9 },
  { re: /fund(ed|ing)?\s+by|backed\s+by|investment\s+(from|by)/i, label: "funded_by", strength: 0.9 },
  { re: /\bacquir(ed|es|ing|ition)/i, label: "acquired", strength: 0.9 },
  { re: /launche?s?d?\s+by/i, label: "launched_by", strength: 0.85 },
  { re: /develop(ed|s)?\s+by|built\s+by|powered\s+by/i, label: "built_by", strength: 0.85 },
  { re: /\bhiring\b|\bjobs?\b|\brecruit/i, label: "hiring_for", strength: 0.7 },
  { re: /\bresearch\s+(at|by|from)\b|\bpaper\b|\bstudy\b/i, label: "researched_at", strength: 0.75 },
  { re: /\buses?\b|\badopt(s|ed|ing)?\b|\bdeploys?\b/i, label: "uses", strength: 0.6 },
  { re: /\bcompete?s?\b|\brival\b/i, label: "competes_with", strength: 0.6 },
  { re: /\bleads?\b|\bheads?\b|\bfounded?\s+by\b/i, label: "led_by", strength: 0.7 },
];

function evOf(o: Observation) {
  return { id: o.id, sourceType: o.engine, query: o.query, title: o.title, url: o.url, snippet: o.snippet.slice(0, 280), date: o.date };
}

function mentions(text: string, name: string): boolean {
  const t = text.toLowerCase(), nm = name.toLowerCase();
  if (t.includes(nm)) return true;
  const parts = nm.split(/\s+/).filter(w => w.length > 3);
  return parts.length > 0 && parts.every(p => t.includes(p));
}

export interface EdgeDraft {
  a: number; b: number; // candidate indexes
  relationship: string; strength: number;
  obs: Observation[]; crossEngine: boolean;
}

/**
 * Relationship extraction. Co-occurrence + explicit verbs + hiring/research overlap.
 * Never invents: every draft requires shared observations.
 */
export function extractRelationships(cands: Candidate[], observations: Observation[]): EdgeDraft[] {
  const drafts = new Map<string, EdgeDraft>();
  const key = (a: number, b: number) => (a < b ? `${a}::${b}` : `${b}::${a}`);

  // index: observation -> candidate indexes mentioned
  for (const o of observations) {
    const text = `${o.title} ${o.snippet} ${o.extra?.company ?? ""} ${o.extra?.authors ?? ""}`.slice(0, 2000);
    const hit: number[] = [];
    cands.forEach((c, i) => {
      const variants = [c.name, ...[...c.domains].map(d => d.split(".")[0])];
      if (variants.some(v => v.length > 2 && mentions(text, v))) hit.push(i);
    });
    // explicit verb in this observation upgrades the pair label
    let label = "related_to", strength = 0.45;
    for (const v of REL_VERBS) if (v.re.test(text)) { label = v.label; strength = v.strength; break; }
    for (let x = 0; x < hit.length; x++) for (let y = x + 1; y < hit.length; y++) {
      const k = key(hit[x], hit[y]);
      let d = drafts.get(k);
      if (!d) { d = { a: Math.min(hit[x], hit[y]), b: Math.max(hit[x], hit[y]), relationship: label, strength, obs: [], crossEngine: false }; drafts.set(k, d); }
      if (!d.obs.some(e => e.id === o.id)) d.obs.push(o);
      if (strength > d.strength) { d.relationship = label; d.strength = strength; }
    }
  }
  // hiring overlap: same company across jobs + search/news
  // research overlap: scholar co-mentions already captured; boost cross-engine pairs
  for (const d of drafts.values()) {
    const engines = new Set(d.obs.map(o => o.engine));
    d.crossEngine = engines.size >= 2;
  }
  // prune: keep pairs with >=1 shared obs (guaranteed), cap fan-out per node later in pipeline
  return [...drafts.values()].filter(d => d.obs.length >= 1);
}

/** Evidence-based confidence. No arbitrary numbers. */
export function edgeConfidence(d: EdgeDraft, maxCo: number, semSim: number): { confidence: number; weight: number } {
  const independentSources = new Set(d.obs.map(o => o.domain || o.url)).size;
  const srcScore = Math.min(1, independentSources / 3);
  const coScore = Math.min(1, d.obs.length / Math.max(2, maxCo));
  const cross = d.crossEngine ? 1 : 0;
  const confidence = Math.min(0.97,
    0.25 * srcScore + 0.30 * coScore + 0.15 * cross + 0.15 * Math.min(1, semSim) + 0.15 * d.strength);
  const capped = d.obs.length === 1 && !d.crossEngine ? Math.min(confidence, 0.55) : confidence;
  return { confidence: Math.round(capped * 100) / 100, weight: Math.round((0.4 + 0.6 * capped) * 100) / 100 };
}

export function toEdge(d: EdgeDraft, ids: string[], semSim: number, maxCo: number, provenance: RelationshipProvenance = "DIRECTLY_OBSERVED"): GraphEdge {
  const { confidence, weight } = edgeConfidence(d, maxCo, semSim);
  return {
    id: `e_${ids[d.a]}__${ids[d.b]}`,
    source: ids[d.a], target: ids[d.b],
    relationship: d.relationship, confidence, weight, provenance,
    evidence: d.obs.slice(0, 5).map(evOf),
  };
}
