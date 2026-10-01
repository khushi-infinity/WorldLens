import type { PlannedQuery } from "./types";

const GEO_RE = /\b(in|of|for|across)\s+india\b/i;

/** Split "Semiconductor ecosystem in India" -> { core, geo }. */
export function splitTopic(topic: string): { core: string; geo: string } {
  const t = topic.trim();
  const m = t.match(/^(.*?)\s+((in|of|for|across)\s+india)$/i);
  if (m) return { core: m[1].trim() || t, geo: "India" };
  if (/india/i.test(t)) return { core: t.replace(/india/ig, "").replace(/\s{2,}/g, " ").trim() || t, geo: "India" };
  return { core: t, geo: "" };
}

const FACETS: { facet: string; suffix: (core: string, geo: string) => string; engines: PlannedQuery["engines"] }[] = [
  { facet: "startups", suffix: (c, g) => `${c} startups ${g}`.trim(), engines: ["search", "news"] },
  { facet: "companies", suffix: (c, g) => `${c} companies ${g}`.trim(), engines: ["search"] },
  { facet: "research", suffix: (c, g) => `${c} research labs ${g}`.trim(), engines: ["search", "scholar"] },
  { facet: "universities", suffix: (c, g) => `${c} universities ${g}`.trim(), engines: ["search", "scholar"] },
  { facet: "funding", suffix: (c, g) => `${c} funding ${g}`.trim(), engines: ["search", "news"] },
  { facet: "jobs", suffix: (c, g) => `${c} jobs ${g}`.trim(), engines: ["jobs", "search"] },
  { facet: "policy", suffix: (c, g) => `${c} policy ${g}`.trim(), engines: ["search", "news"] },
  { facet: "momentum", suffix: (c, g) => `${c} ${g}`.trim(), engines: ["trends", "news"] },
  { facet: "infrastructure", suffix: (c, g) => `${c} infrastructure ${g}`.trim(), engines: ["search", "news"] },
];

/**
 * Topic-aware query plan. Max 9 subqueries so SerpApi spend stays bounded.
 * Different engines serve different purposes (see ARCHITECTURE.md).
 */
export function planQueries(topic: string, max = 10): PlannedQuery[] {
  const { core, geo } = splitTopic(topic);
  const seen = new Set<string>();
  const out: PlannedQuery[] = [];
  // Always include the raw topic as a search+news query first.
  const push = (query: string, engines: PlannedQuery["engines"], facet: string) => {
    const key = query.toLowerCase();
    if (seen.has(key) || out.length >= max) return;
    seen.add(key);
    out.push({ query, engines, facet });
  };
  push(topic.trim(), ["search", "news"], "core");
  for (const f of FACETS) {
    push(f.suffix(core, geo).replace(/\s+/g, " "), f.engines, f.facet);
    if (out.length >= max) break;
  }
  return out;
}

export { GEO_RE };
