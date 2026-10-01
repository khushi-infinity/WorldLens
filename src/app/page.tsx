"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useWorld } from "@/store/useWorldStore";
import Landing from "@/components/Landing";
import LoadingSequence from "@/components/LoadingSequence";
import TopBar from "@/components/TopBar";
import ClusterPanel from "@/components/ClusterPanel";
import Inspector from "@/components/Inspector";

const WorldCanvas = dynamic(() => import("@/components/WorldCanvas"), { ssr: false });

export default function Home() {
  const { stage, explore, error, topic, refreshSnapshots, selectedNode, selectedEdge, backToLanding, isolatedCluster, reset } = useWorld();
  const [narrow, setNarrow] = useState(false);

  useEffect(() => { refreshSnapshots(); }, [refreshSnapshots]);
  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (stage === "landing") {
    return <div className="min-h-screen bg-[#05070f]"><Landing onExplore={explore} /></div>;
  }
  if (stage === "loading") {
    return <div className="min-h-screen bg-[#05070f]"><LoadingSequence /></div>;
  }
  if (stage === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#05070f] px-6 text-center">
        <p className="text-[11px] uppercase tracking-[0.3em] text-red-300/80">Exploration failed</p>
        <h2 className="mt-2 max-w-lg text-xl font-semibold text-white">{error ?? "Something went wrong"}</h2>
        <div className="mt-6 flex gap-2">
          <button onClick={() => explore(topic, "LIVE")} className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">Retry live search</button>
          <button onClick={() => explore("Artificial Intelligence in India", "CACHED")} className="rounded-full border border-white/15 px-5 py-2 text-sm text-slate-200 hover:border-cyan-300/40">Open Demo Mode</button>
        </div>
      </div>
    );
  }

  // Mobile / tablet: side panels would cover the world, so collapse to a bottom sheet.
  if (narrow) {
    const hasSelection = !!selectedNode || !!selectedEdge;
    return (
      <div className="relative h-[100dvh] w-screen overflow-hidden bg-[#05070f]">
        <WorldCanvas />
        <TopBar />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-950/90 p-3 backdrop-blur">
            <p className="w-full text-[11px] text-slate-400">
              {hasSelection ? "Details below" : "Tap a sphere to inspect it"}
            </p>
            <button onClick={backToLanding} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-200">Start over</button>
            {isolatedCluster && (
              <button onClick={() => reset()} className="rounded-full border border-cyan-300/40 px-3 py-1.5 text-xs text-cyan-200">Reset view</button>
            )}
            <span className="ml-auto text-[10px] text-slate-500">Drag to orbit · pinch to zoom</span>
          </div>
        </div>
        {hasSelection && (
          <div className="pointer-events-auto absolute inset-x-0 bottom-20 z-30 max-h-[52vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-slate-950/95 backdrop-blur">
            <Inspector embedded />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#05070f]">
      <WorldCanvas />
      <TopBar />
      <ClusterPanel />
      <Inspector />
    </div>
  );
}
