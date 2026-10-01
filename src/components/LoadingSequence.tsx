"use client";
import { useWorld } from "@/store/useWorldStore";

const ENGINES = [
  ["search", "Google Search"], ["news", "Google News"], ["jobs", "Google Jobs"],
  ["scholar", "Google Scholar"], ["trends", "Google Trends"],
] as const;

export default function LoadingSequence() {
  const { loading, topic } = useWorld();
  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-950/80 p-8 backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300/80">Constructing world</p>
        <h2 className="mt-2 text-xl font-semibold text-white">{topic}</h2>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-all duration-500" style={{ width: `${Math.round(loading.progress * 100)}%` }} />
        </div>
        <p className="mt-3 min-h-5 text-sm text-slate-300">{loading.message}</p>
        <div className="mt-5 space-y-2">
          {ENGINES.map(([key, label]) => {
            // Before the first engine report arrives, show a neutral pulse rather
            // than a false "pending", so the panel never implies a stalled engine.
            const st = loading.engines?.[key] ?? "pending";
            return (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{label}</span>
                <span className={st === "ok" ? "text-emerald-400" : st === "error" ? "text-red-400" : st === "skipped" ? "text-slate-600" : "text-amber-300 animate-pulse"}>
                  {st === "ok" ? "✓" : st === "error" ? "✕ degraded" : st === "skipped" ? "–" : "●"}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex gap-6 text-xs text-slate-500">
          {loading.observations != null && <span><b className="text-slate-200">{loading.observations}</b> observations</span>}
          {loading.entities != null && <span><b className="text-slate-200">{loading.entities}</b> entities</span>}
        </div>
      </div>
    </div>
  );
}

