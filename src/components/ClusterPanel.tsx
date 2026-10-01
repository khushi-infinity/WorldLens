"use client";
import { useState } from "react";
import { useWorld } from "@/store/useWorldStore";
import { TYPE_COLORS } from "@/components/typeColors";

export default function ClusterPanel() {
  const { graph, isolatedCluster, isolateCluster, hoveredNode } = useWorld();
  const [legendOpen, setLegendOpen] = useState(false);
  if (!graph) return null;
  const emerging = graph.clusters.filter(c => c.emerging);
  const stable = graph.clusters.filter(c => !c.emerging);

  const legend = [
    ["company", "Company"], ["startup", "Startup"], ["technology", "Technology"],
    ["university", "University"], ["researcher", "Researcher"], ["product", "Product"],
    ["institution", "Institution"], ["event", "Event"], ["location", "Location"],
    ["industry", "Industry"], ["person", "Person"], ["topic", "Topic"],
  ] as const;

  return (
    <aside className="pointer-events-auto absolute bottom-4 left-4 top-16 z-20 flex max-h-[calc(100dvh-5rem)] w-72 flex-col gap-3">
      {/* Legend: how to read the world */}
      <div className="shrink-0 rounded-xl border border-white/10 bg-slate-950/85 p-3 backdrop-blur">
        <button onClick={() => setLegendOpen(o => !o)} className="flex w-full items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">How to read this</span>
          <span className="text-[10px] text-slate-500">{legendOpen ? "−" : "+"}</span>
        </button>
        <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
          Node size = <b className="text-cyan-300">Search Gravity</b> (combined evidence strength).
          Edges only appear when backed by evidence.
        </p>
        {legendOpen && (
          <div className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1">
            {legend.map(([k, label]) => (
              <span key={k} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TYPE_COLORS[k] }} />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Clusters */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/85 p-3 backdrop-blur [scrollbar-width:thin]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">
          Clusters · {graph.nodes.length} entities · {graph.edges.length} links
        </p>
        <p className="mt-1 text-[11px] text-slate-500">Click a cluster to isolate it. Click again to show everything.</p>

        {emerging.length > 0 && (
          <>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300/90">
              Emerging · {emerging.length}
            </p>
            <div className="mt-1.5 space-y-1.5">
              {emerging.map(c => (
                <button key={c.id}
                  onClick={() => isolateCluster(isolatedCluster === c.id ? null : c.id)}
                  className={`block w-full rounded-lg border p-2 text-left transition ${isolatedCluster === c.id ? "border-cyan-300 bg-cyan-400/15" : "border-amber-400/25 bg-amber-400/[0.07] hover:border-amber-300/50"}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-amber-100">{c.label}</span>
                    <span className="shrink-0 rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                      E {c.emergenceScore.toFixed(2)}
                    </span>
                  </span>
                  <span className="mt-1 block text-[10px] leading-snug text-amber-200/70">
                    {c.whyDetected.join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {stable.length > 0 && (
          <>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Established</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {stable.map(c => (
                <button key={c.id} title={c.whyDetected.join(" · ")}
                  onClick={() => isolateCluster(isolatedCluster === c.id ? null : c.id)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] ${isolatedCluster === c.id ? "border-cyan-300 bg-cyan-400/20 text-white" : "border-white/10 bg-white/5 text-slate-300 hover:border-cyan-300/40"}`}>
                  {c.label} <span className="text-slate-500">{c.size}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* What is currently visible */}
        {isolatedCluster && (
          <p className="mt-3 rounded-lg bg-cyan-400/10 p-2 text-[11px] text-cyan-200">
            Showing <b>{graph.clusters.find(c => c.id === isolatedCluster)?.label}</b> only.
          </p>
        )}
        {hoveredNode && !isolatedCluster && (
          <p className="mt-3 truncate text-[11px] text-slate-500">
            Hovering <b className="text-slate-300">{graph.nodes.find(n => n.id === hoveredNode)?.name}</b>
          </p>
        )}
      </div>

      {/* Camera hints: only when nothing is focused */}
      {!hoveredNode && (
        <p className="shrink-0 rounded-xl border border-white/10 bg-slate-950/85 px-3 py-2 text-[10px] text-slate-500 backdrop-blur">
          Drag to orbit · scroll to zoom · right-drag to pan · click a node or a gold dot
        </p>
      )}
    </aside>
  );
}
