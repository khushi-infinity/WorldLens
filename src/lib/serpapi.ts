import { cacheGet, cacheSet, cacheKey } from "./cache";
import type { EngineName } from "./types";

export interface SerpResult { ok: boolean; engine: EngineName; query: string; cached: boolean; data: any; error?: string }

const inflight = new Map<string, Promise<SerpResult>>();
const API_KEY = () => process.env.SERPAPI_API_KEY ?? "";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** SerpApi `engine` parameter per WorldLens engine. */
const SERP_ENGINE: Record<EngineName, string> = {
  search: "google",
  news: "google_news",
  jobs: "google_jobs",
  scholar: "google_scholar",
  trends: "google_trends",
};

async function fetchSerp(engine: EngineName, params: Record<string, string>, query: string): Promise<SerpResult> {
  const key = cacheKey(engine, query, JSON.stringify(params));
  const hit = cacheGet<any>(key);
  if (hit) return { ok: true, engine, query, cached: true, data: hit };
  if (inflight.has(key)) return inflight.get(key)!;

  const p = (async (): Promise<SerpResult> => {
    if (!API_KEY()) return { ok: false, engine, query, cached: false, data: null, error: "Missing SERPAPI_API_KEY" };
    const qs = new URLSearchParams({ engine: SERP_ENGINE[engine], api_key: API_KEY(), ...params });
    let lastErr = "unknown";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`https://serpapi.com/search.json?${qs.toString()}`);
        if (res.status === 429) { lastErr = "rate_limited"; await sleep(1200 * (attempt + 1)); continue; }
        if (!res.ok) { lastErr = `http_${res.status}`; await sleep(600 * (attempt + 1)); continue; }
        const data = await res.json();
        if ((data as any).error) { lastErr = String((data as any).error); break; }
        cacheSet(key, data);
        return { ok: true, engine, query, cached: false, data };
      } catch (e: any) { lastErr = e?.message ?? "fetch_failed"; await sleep(600 * (attempt + 1)); }
    }
    return { ok: false, engine, query, cached: false, data: null, error: lastErr };
  })();
  inflight.set(key, p);
  try { return await p; } finally { inflight.delete(key); }
}

// ---- Adapters: each engine has a distinct purpose (see ARCHITECTURE.md) ----
export const adapters = {
  /** Entity discovery + general relationships */
  search: (q: string) => fetchSerp("search", { q, num: "20", hl: "en", gl: "in" }, q),
  /** Recent developments + co-occurrence relationships */
  news: (q: string) => fetchSerp("news", { q, hl: "en", gl: "in" }, q),
  /** Hiring signals, skills, growth */
  jobs: (q: string) => fetchSerp("jobs", { q, location: "India" }, q),
  /** Research areas, researchers, institutions, papers */
  scholar: (q: string) => fetchSerp("scholar", { q, num: "20", hl: "en" }, q),
  /** Momentum / emerging topics (relative interest only) */
  trends: (q: string) => fetchSerp("trends", { q, data_type: "TIMESERIES", date: "today 12-m", geo: "IN" }, q),
};

/** Run one planned query against its engines with per-engine fault isolation. */
export async function runPlannedQuery(query: string, engines: EngineName[]): Promise<SerpResult[]> {
  const tasks = engines.map((e) => {
    switch (e) {
      case "search": return adapters.search(query);
      case "news": return adapters.news(query);
      case "jobs": return adapters.jobs(query);
      case "scholar": return adapters.scholar(query);
      case "trends": return adapters.trends(query);
    }
  });
  return Promise.all(tasks);
}
