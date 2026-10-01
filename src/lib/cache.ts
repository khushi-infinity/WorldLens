import { createHash } from "crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const DIR = join(process.cwd(), ".cache", "serpapi");
const TTL_MS = Number(process.env.SERPAPI_CACHE_TTL_HOURS ?? 24) * 3600_000;

function ensureDir() {
  try { mkdirSync(DIR, { recursive: true }); } catch { /* noop */ }
}

export function cacheKey(engine: string, query: string, extra = ""): string {
  return createHash("sha1").update(`${engine}::${query.toLowerCase().trim()}::${extra}`).digest("hex");
}

export function cacheGet<T>(key: string): T | null {
  try {
    ensureDir();
    const p = join(DIR, `${key}.json`);
    if (!existsSync(p)) return null;
    const raw = JSON.parse(readFileSync(p, "utf8")) as { savedAt: number; data: T };
    if (Date.now() - raw.savedAt > TTL_MS) return null;
    return raw.data;
  } catch { return null; }
}

export function cacheSet(key: string, data: unknown): void {
  try {
    ensureDir();
    writeFileSync(join(DIR, `${key}.json`), JSON.stringify({ savedAt: Date.now(), data }));
  } catch { /* cache is best-effort */ }
}
