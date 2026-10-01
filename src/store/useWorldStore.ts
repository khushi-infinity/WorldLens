"use client";
import { create } from "zustand";
import type { WorldGraph, ExploreMeta, GraphNode, GraphEdge } from "@/lib/types";
import { DEMO_GRAPHS, DEMO_TOPICS } from "@/lib/demoGraphs";
import { saveSnapshot, listSnapshots, type Snapshot } from "@/lib/snapshots";

export type Stage = "landing" | "loading" | "world" | "error";

interface WorldState {
  stage: Stage;
  topic: string;
  mode: WorldGraph["mode"];
  graph: WorldGraph | null;
  meta: ExploreMeta | null;
  loading: { message: string; progress: number; engines?: ExploreMeta["engines"]; observations?: number; entities?: number };
  selectedNode: GraphNode | null;
  selectedEdge: GraphEdge | null;
  hoveredNode: string | null;
  isolatedCluster: string | null;
  searchFly: string | null;
  error: string | null;
  snapshots: Snapshot[];
  demoTopics: string[];

  explore: (topic: string, mode: WorldGraph["mode"]) => Promise<void>;
  selectNode: (n: GraphNode | null) => void;
  selectEdge: (e: GraphEdge | null) => void;
  setHovered: (id: string | null) => void;
  isolateCluster: (id: string | null) => void;
  flyTo: (id: string | null) => void;
  reset: () => void;
  backToLanding: () => void;
  refreshSnapshots: () => void;
}

async function readStream(res: Response, onEvent: (e: any) => void) {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Streaming unsupported");
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.trim()) continue;
      try { onEvent(JSON.parse(l)); } catch { /* partial */ }
    }
  }
}

export const useWorld = create<WorldState>((set, get) => ({
  stage: "landing",
  topic: "",
  mode: "LIVE",
  graph: null,
  meta: null,
  loading: { message: "Warming up...", progress: 0 },
  selectedNode: null,
  selectedEdge: null,
  hoveredNode: null,
  isolatedCluster: null,
  searchFly: null,
  error: null,
  snapshots: [],
  demoTopics: DEMO_TOPICS,

  explore: async (topic, mode) => {
    set({ stage: mode === "CACHED" ? "world" : "loading", topic, mode, error: null, graph: null, selectedNode: null, selectedEdge: null, isolatedCluster: null, loading: { message: mode === "CACHED" ? "Loading cached world..." : "Understanding ecosystem...", progress: 0.02 } });
    try {
      // CACHED demo graphs load instantly, no network
      if (mode === "CACHED" && DEMO_GRAPHS[topic]) {
        await new Promise(r => setTimeout(r, 500)); // beat for transition polish
        set({ graph: DEMO_GRAPHS[topic], stage: "world" });
        try { set({ snapshots: saveSnapshot(DEMO_GRAPHS[topic]) }); } catch { /* ssr-safe */ }
        return;
      }
      const res = await fetch("/api/explore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, mode }) });
      if (!res.ok && res.headers.get("content-type")?.includes("json")) {
        const j = await res.json();
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      const ctype = res.headers.get("content-type") ?? "";
      if (ctype.includes("application/json")) {
        const j = await res.json();
        if (j.done) {
          set({ graph: j.graph, meta: j.meta, stage: "world" });
          try { set({ snapshots: saveSnapshot(j.graph) }); } catch { /* noop */ }
          return;
        }
        throw new Error(j.error ?? "Exploration failed");
      }
      await readStream(res, (e) => {
        if (e.done) {
          set({ graph: e.graph, meta: e.meta, stage: "world" });
          try { set({ snapshots: saveSnapshot(e.graph) }); } catch { /* noop */ }
        } else if (e.stage === "error") {
          set({ stage: "error", error: e.message });
        } else {
          // Later stages omit fields they did not change. Merge instead of replacing,
          // otherwise a stage that omits `engines` would wipe the live engine status
          // and the loading UI would show every engine as still pending.
          set(s => ({
            loading: {
              message: e.message,
              progress: e.progress ?? s.loading.progress,
              engines: e.engines ?? s.loading.engines,
              observations: e.observations ?? s.loading.observations,
              entities: e.entities ?? s.loading.entities,
            },
          }));
        }
      });
      if (get().stage === "loading") set({ stage: "error", error: "Stream ended without a graph. Please retry." });
    } catch (err: any) {
      set({ stage: "error", error: err?.message ?? "Exploration failed" });
    }
  },

  selectNode: (n) => set({ selectedNode: n, selectedEdge: n ? null : get().selectedEdge }),
  selectEdge: (e) => set({ selectedEdge: e, selectedNode: e ? null : get().selectedNode }),
  setHovered: (id) => set({ hoveredNode: id }),
  isolateCluster: (id) => set({ isolatedCluster: id }),
  flyTo: (id) => set({ searchFly: id }),
  reset: () => set({ selectedNode: null, selectedEdge: null, isolatedCluster: null, searchFly: null }),
  backToLanding: () => set({ stage: "landing", graph: null, selectedNode: null, selectedEdge: null, isolatedCluster: null }),
  refreshSnapshots: () => { try { set({ snapshots: listSnapshots() }); } catch { /* noop */ } },
}));
