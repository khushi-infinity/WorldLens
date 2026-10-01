import type { Observation, EngineName } from "./types";

let n = 0;
const nid = () => `obs_${++n}_${Date.now().toString(36)}`;

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function pick(...vals: (string | undefined | null)[]): string {
  for (const v of vals) if (v && String(v).trim()) return String(v).trim();
  return "";
}

/** Normalize the five engine payload shapes into flat observations. */
export function normalizeResults(engine: EngineName, query: string, data: any): Observation[] {
  if (!data) return [];
  const out: Observation[] = [];
  const push = (o: Omit<Observation, "id" | "engine" | "query">) =>
    out.push({ ...o, id: nid(), engine, query });

  if (engine === "search") {
    const kg = data.knowledge_graph as any | undefined;
    if (kg?.title) push({
      title: kg.title, url: pick(kg.website, kg.source?.link), domain: domainOf(pick(kg.website, kg.source?.link)),
      snippet: pick(kg.description, kg.type), extra: { kind: "knowledge_graph", type: kg.type ?? "" },
    });
    for (const r of data.organic_results ?? []) push({
      title: pick(r.title), url: pick(r.link), domain: domainOf(pick(r.link)),
      snippet: pick(r.snippet, r.rich_snippet?.top?.detected_extensions as any),
      extra: { kind: "organic", position: String(r.position ?? "") },
    });
    for (const r of data.related_questions ?? []) push({
      title: pick(r.question), url: pick(r.link), domain: domainOf(pick(r.link)),
      snippet: pick(r.snippet, r.answer), extra: { kind: "related_question" },
    });
  } else if (engine === "news") {
    for (const r of data.news_results ?? []) push({
      title: pick(r.title), url: pick(r.link), domain: domainOf(pick(r.link)),
      snippet: pick(r.snippet), date: pick(r.date),
      extra: { kind: "news", source: r.source?.name ?? "" },
    });
  } else if (engine === "jobs") {
    for (const r of data.jobs_results ?? []) push({
      title: pick(r.title), url: pick(r.link, r.job_id ? `https://serpapi.com/jobs/${r.job_id}` : ""),
      domain: domainOf(pick(r.link)), snippet: pick(r.description, r.extensions?.join(" ")),
      extra: { kind: "job", company: r.company_name ?? "", location: r.location ?? "", via: r.via ?? "" },
    });
  } else if (engine === "scholar") {
    for (const r of data.organic_results ?? []) push({
      title: pick(r.title), url: pick(r.link), domain: domainOf(pick(r.link)),
      snippet: pick(r.snippet, r.publication_info?.summary),
      extra: {
        kind: "paper", authors: (r.publication_info?.authors ?? []).map((a: any) => a.name).join("; "),
        citedBy: String(r.inline_links?.cited_by?.total ?? ""),
      },
    });
  } else if (engine === "trends") {
    const tl = data.interest_over_time?.timeline_data ?? [];
    const nums: number[] = tl.map((p: any) => {
      const v = p?.values?.[0];
      const n = Number(v?.extracted_value ?? v?.value ?? 0);
      return Number.isFinite(n) ? n : 0;
    });
    push({
      title: `Search interest trend: ${query}`, url: "", domain: "trends.google.com",
      snippet: tl.length ? `Relative interest series (0-100, NOT absolute volume) with ${tl.length} points; series=${nums.join(",")}` : "No trend series returned",
      extra: { kind: "trend", points: String(tl.length) },
    });
  }
  return out.filter(o => o.title || o.snippet);
}
