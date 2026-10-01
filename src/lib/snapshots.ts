import type { WorldGraph } from "./types";

export interface Snapshot { id: string; topic: string; mode: WorldGraph["mode"]; createdAt: string; graph: WorldGraph }
export interface SnapshotDiff {
  added: string[]; removed: string[];
  strengthened: { id: string; label: string }[]; weakened: { id: string; label: string }[];
  growingClusters: string[];
}

const KEY = "worldlens.snapshots.v1";
const MAX = 10;

export function listSnapshots(): Snapshot[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

export function saveSnapshot(graph: WorldGraph): Snapshot[] {
  const snaps = listSnapshots();
  snaps.unshift({ id: `snap_${Date.now().toString(36)}`, topic: graph.topic, mode: graph.mode, createdAt: new Date().toISOString(), graph });
  const trimmed = snaps.slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(trimmed)); } catch { /* quota */ }
  return trimmed;
}

export function diffSnapshots(a: Snapshot, b: Snapshot): SnapshotDiff {
  const an = new Map(a.graph.nodes.map(n => [n.id, n]));
  const bn = new Map(b.graph.nodes.map(n => [n.id, n]));
  const added = [...bn.keys()].filter(id => !an.has(id)).map(id => bn.get(id)!.name);
  const removed = [...an.keys()].filter(id => !bn.has(id)).map(id => an.get(id)!.name);
  const ae = new Map(a.graph.edges.map(e => [e.id, e]));
  const strengthened: SnapshotDiff["strengthened"] = [];
  const weakened: SnapshotDiff["weakened"] = [];
  for (const e of b.graph.edges) {
    const old = ae.get(e.id);
    if (!old) continue;
    if (e.confidence > old.confidence + 0.05) strengthened.push({ id: e.id, label: `${e.source} ↔ ${e.target}` });
    else if (e.confidence < old.confidence - 0.05) weakened.push({ id: e.id, label: `${e.source} ↔ ${e.target}` });
  }
  const ac = new Map(a.graph.clusters.map(c => [c.label, c.size]));
  const growingClusters = b.graph.clusters.filter(c => (ac.get(c.label) ?? 0) < c.size).map(c => c.label);
  return { added, removed, strengthened, weakened, growingClusters };
}
