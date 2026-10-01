"use client";
import { useEffect, useRef, useState } from "react";
import { useWorld } from "@/store/useWorldStore";

export default function TopBar() {
  const { topic, mode, graph, backToLanding, explore, flyTo, selectNode, reset, isolatedCluster } = useWorld();
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const findRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (findOpen) findRef.current?.focus(); }, [findOpen]);

  const matches = entity.trim() && graph
    ? graph.nodes.filter(n => n.name.toLowerCase().includes(entity.toLowerCase())).slice(0, 6)
    : [];

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 px-3 pt-3 sm:px-4">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2">
        <button onClick={backToLanding} title="Back to start"
          className="pointer-events-auto shrink-0 rounded-lg px-1 text-xs font-bold tracking-widest text-white hover:text-cyan-300 sm:text-sm">
          WORLD<span className="text-cyan-300">LENS</span>
        </button>

        {/* Primary topic search */}
        <form
          className="pointer-events-auto order-3 flex w-full min-w-0 flex-1 items-center gap-2 rounded-full border border-white/10 bg-slate-950/85 py-1.5 pl-4 pr-1.5 backdrop-blur sm:order-none sm:w-auto"
          onSubmit={(e) => { e.preventDefault(); if (q.trim()) explore(q.trim(), "LIVE"); }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={topic || "Explore anything..."}
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none" />
          <button className="shrink-0 rounded-full bg-cyan-400 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300">Explore</button>
        </form>

        {/* Entity finder: expands inline, only when the world exists */}
        {graph && (
          <div className="pointer-events-auto relative order-2 ml-auto hidden shrink-0 sm:ml-0 sm:block">
            <div className="flex items-center rounded-full border border-white/10 bg-slate-950/85 backdrop-blur">
              {!findOpen && (
                <button onClick={() => setFindOpen(true)}
                  className="rounded-full px-3.5 py-1.5 text-xs text-slate-300 hover:text-cyan-300">
                  Find entity
                </button>
              )}
              {findOpen && (
                <input ref={findRef} value={entity} onChange={e => setEntity(e.target.value)}
                  onBlur={() => { setTimeout(() => { if (!entity.trim()) setFindOpen(false); }, 140); }}
                  onKeyDown={e => {
                    if (e.key === "Escape") { setEntity(""); setFindOpen(false); }
                    if (e.key === "Enter" && matches[0]) { e.preventDefault(); flyTo(matches[0].id); selectNode(matches[0]); setEntity(matches[0].name); setFindOpen(false); }
                  }}
                  placeholder="Type a name, camera flies to it"
                  className="w-36 rounded-full bg-transparent py-1.5 pl-4 pr-3 text-xs text-white placeholder:text-slate-500 focus:outline-none sm:w-56" />
              )}
            </div>
            {findOpen && matches.length > 0 && (
              <div className="absolute right-0 top-9 z-40 w-64 overflow-hidden rounded-xl border border-white/10 bg-slate-950 shadow-2xl sm:w-72">
                {matches.map(m => (
                  <button key={m.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { flyTo(m.id); selectNode(m); setEntity(m.name); setFindOpen(false); }}
                    className="block w-full px-3.5 py-2 text-left text-xs text-slate-200 hover:bg-white/5">
                    {m.name}
                    <span className="text-slate-500"> · {m.type} · {m.cluster}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {isolatedCluster && (
          <button onClick={() => reset()}
            className="pointer-events-auto order-4 hidden shrink-0 rounded-full border border-cyan-300/40 bg-slate-950/85 px-3 py-1.5 text-xs text-cyan-200 backdrop-blur hover:bg-cyan-400/20 sm:block">
            Reset view
          </button>
        )}

        <span title={mode === "LIVE" ? "Live SerpApi results" : "Previously captured SerpApi responses"}
          className={`pointer-events-auto order-1 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold sm:order-none ${mode === "LIVE" ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300"}`}>
          {mode === "LIVE" ? "LIVE" : "CACHED"}
        </span>
      </div>
    </header>
  );
}
