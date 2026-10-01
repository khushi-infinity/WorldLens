"use client";
import { useEffect, useMemo, useState } from "react";
import { useWorld } from "@/store/useWorldStore";
import { diffSnapshots } from "@/lib/snapshots";
import { TYPE_COLORS } from "@/components/typeColors";

type Tab = "entity" | "relation" | "time";

function SignalBars({ signals }: { signals: Record<string, number> }) {
  const rows: [string, number, string][] = [
    ["Search", signals.search, "search"], ["News", signals.news, "news"],
    ["Jobs", signals.jobs, "jobs"], ["Research", signals.scholar, "scholar"],
    ["Trend", signals.trends, "trends"],
  ];
  return (
    <div className="space-y-1.5">
      {rows.map(([label, v]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[10px] text-slate-400">{label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-300"
              style={{ width: `${Math.round((v ?? 0) * 100)}%` }} />
          </div>
          <span className="w-6 shrink-0 text-right text-[10px] tabular-nums text-slate-500">{Math.round((v ?? 0) * 100)}</span>
        </div>
      ))}
    </div>
  );
}

function EvidenceList({ items, limit = 4 }: { items: any[]; limit?: number }) {
  if (!items.length) return <p className="text-[11px] text-slate-500">No evidence collected.</p>;
  return (
    <ul className="space-y-1.5">
      {items.slice(0, limit).map(e => (
        <li key={e.id} className="rounded-lg bg-white/[0.06] p-2">
          <div className="flex items-start gap-1.5">
            <span className="mt-0.5 shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-300">
              {e.sourceType}
            </span>
            <span className="min-w-0 flex-1 text-[11px] leading-snug text-slate-200">
              {e.title}
              {e.url && (
                <a href={e.url} target="_blank" rel="noreferrer"
                  className="ml-1 whitespace-nowrap text-cyan-300 underline underline-offset-2">open</a>
              )}
            </span>
          </div>
          {e.snippet && <p className="mt-1 line-clamp-3 text-[10px] leading-snug text-slate-500">{e.snippet}</p>}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function TimeTravel() {
  const { snapshots } = useWorld();
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  const diff = useMemo(() => {
    if (!a || !b || a === b) return null;
    const sa = snapshots.find(s => s.id === a), sb = snapshots.find(s => s.id === b);
    return sa && sb ? diffSnapshots(sa, sb) : null;
  }, [a, b, snapshots]);

  if (snapshots.length < 2) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 p-4 text-center">
        <p className="text-xs font-medium text-slate-300">Not enough captures yet</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          Explore a topic, then explore it again later (or try a different topic). Each run is saved
          as an immutable capture. Two captures unlock the diff.
        </p>
        <p className="mt-2 text-[11px] text-slate-500">Captures stored: {snapshots.length} / 10</p>
      </div>
    );
  }

  const label = (s: (typeof snapshots)[number]) =>
    `${s.topic.slice(0, 20)}${s.topic.length > 20 ? "..." : ""} · ${new Date(s.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;

  const sel = "w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-[11px] text-slate-200 focus:border-cyan-300/50 focus:outline-none";
  const rows: [string, string, string][] = diff ? [
    ["+ New entities", diff.added.join(", ") || "none", "text-emerald-300"],
    ["− Removed entities", diff.removed.join(", ") || "none", "text-red-300"],
    ["↗ Strengthened links", diff.strengthened.length ? `${diff.strengthened.length} links grew more confident` : "none", "text-cyan-300"],
    ["↘ Weakened links", diff.weakened.length ? `${diff.weakened.length} links lost confidence` : "none", "text-amber-300"],
    ["✦ Growing clusters", diff.growingClusters.join(", ") || "none", "text-violet-300"],
  ] : [];

  return (
    <div>
      <div className="rounded-xl border border-violet-400/25 bg-violet-400/[0.07] p-3">
        <p className="text-[11px] font-semibold text-violet-200">What this does</p>
        <p className="mt-1 text-[11px] leading-relaxed text-violet-200/70">
          Web search results change over time. Pick any two captures to see exactly what moved:
          which entities appeared or vanished, which relationships became better supported, and
          which clusters grew. WorldLens only ever compares genuine past captures, never
          fabricated history.
        </p>
      </div>

      <Section title="Compare captures">
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-[10px] text-slate-500">Earlier (A)</label>
            <select className={sel} value={a} onChange={e => setA(e.target.value)}>
              <option value="">Select a capture...</option>
              {snapshots.map(s => <option key={s.id} value={s.id}>{label(s)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-slate-500">Later (B)</label>
            <select className={sel} value={b} onChange={e => setB(e.target.value)}>
              <option value="">Select a capture...</option>
              {snapshots.map(s => <option key={s.id} value={s.id}>{label(s)}</option>)}
            </select>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">{snapshots.length} / 10 captures stored on this device</p>
      </Section>

      {diff && (
        <Section title="What changed">
          <ul className="space-y-1.5">
            {rows.map(([k, v, cls]) => (
              <li key={k} className="rounded-lg bg-white/[0.05] p-2">
                <span className={`text-[10px] font-semibold ${cls}`}>{k}</span>
                <p className="mt-0.5 line-clamp-4 text-[11px] leading-snug text-slate-300">{v}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/** `embedded` drops the fixed right-rail positioning so the panel can live inside the mobile bottom sheet. */
export default function Inspector({ embedded = false }: { embedded?: boolean }) {
  const { selectedNode, selectedEdge, selectNode, selectEdge, graph, flyTo } = useWorld();
  const [tab, setTab] = useState<Tab>("entity");
  const [userPicked, setUserPicked] = useState(false);

  // A new selection hands control back to the automatic tab so clicking a node or
  // an edge always shows the right view, even after the user picked a tab manually.
  useEffect(() => { setUserPicked(false); }, [selectedNode?.id, selectedEdge?.id]);

  // Follow the selection until the user explicitly picks a tab: clicking an edge
  // opens the Link view, but a manual Time travel choice is never overridden.
  const autoTab: Tab = selectedEdge ? "relation" : selectedNode ? "entity" : tab;
  const active: Tab = userPicked ? tab : autoTab;

  if (!graph) return null;

  const tabs: { key: Tab; label: string; hint: string }[] = [
    { key: "entity", label: "Entity", hint: "Signals, connections, evidence" },
    { key: "relation", label: "Link", hint: "Why two entities are connected" },
    { key: "time", label: "Time travel", hint: "Compare two captures" },
  ];

  return (
    <aside className={`pointer-events-auto flex flex-col overflow-hidden bg-slate-950/90 backdrop-blur ${embedded ? "h-full w-full rounded-t-2xl" : "absolute bottom-4 right-4 top-16 z-20 w-80 rounded-2xl border border-white/10"}`}>
      {/* Tabs */}
      <div className="flex shrink-0 border-b border-white/10">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setUserPicked(true); }} title={t.hint}
            className={`flex-1 border-b-2 px-1 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition ${active === t.key ? "border-cyan-300 text-cyan-200" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {active === "time" && <TimeTravel />}

        {active === "entity" && !selectedNode && (
          <div className="py-6 text-center">
            <p className="text-xs font-medium text-slate-300">Nothing selected</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              Click any sphere in the world to inspect it. You will see its evidence signals,
              its strongest connections, and the search results it came from.
            </p>
          </div>
        )}

        {active === "entity" && selectedNode && (() => {
          const n = selectedNode;
          const byId = new Map(graph.nodes.map(x => [x.id, x]));
          const connected = graph.edges
            .filter(e => e.source === n.id || e.target === n.id)
            .sort((x, y) => y.confidence - x.confidence).slice(0, 8);
          const totalObs = Object.values(n.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0);
          return (
            <div>
              <button onClick={() => selectNode(null)} className="float-right -mt-1 text-xs text-slate-500 hover:text-white">✕</button>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TYPE_COLORS[n.type] ?? "#94a3b8" }} />
                <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{n.type}</span>
              </div>
              <h2 className="mt-1 text-lg font-semibold leading-tight text-white">{n.name}</h2>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{n.description}</p>

              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-300">{n.cluster}</span>
                <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-cyan-300">
                  Gravity {n.importance.toFixed(2)}
                </span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-300">{totalObs} observations</span>
              </div>

              <Section title="Evidence signals (normalized 0-100)">
                <SignalBars signals={n.signals as unknown as Record<string, number>} />
                <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                  Log-normalized counts from {Object.entries(n.counts ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(", ") || "no engine hits"}.
                </p>
              </Section>

              <Section title={`Strongest connections (${connected.length})`}>
                {connected.length === 0
                  ? <p className="text-[11px] text-slate-500">No evidence-backed links yet.</p>
                  : (
                    <ul className="space-y-1">
                      {connected.map(e => {
                        const other = byId.get(e.source === n.id ? e.target : e.source);
                        if (!other) return null;
                        return (
                          <li key={e.id} className="flex items-center gap-1">
                            <button onClick={() => { selectNode(other); flyTo(other.id); }}
                              className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5">
                              <span className="min-w-0 flex-1 truncate text-[11px] text-slate-200">{other.name}</span>
                              <span className="shrink-0 text-[10px] text-slate-500">
                                {e.relationship.replace(/_/g, " ")} · {Math.round(e.confidence * 100)}%
                              </span>
                            </button>
                            {/* The 3D gold dots are small, so expose the same
                                evidence panel here. This is the primary way to
                                audit a relationship. */}
                            <button onClick={() => selectEdge(e)} title="Why is this link here?"
                              className="shrink-0 rounded-lg px-1.5 py-1 text-[10px] text-amber-300/80 hover:bg-amber-400/15 hover:text-amber-200">
                              why?
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
              </Section>

              {n.whyMatters && (
                <Section title="Why it matters">
                  <p className="rounded-lg bg-cyan-400/[0.07] p-2.5 text-[11px] leading-relaxed text-cyan-100/90">{n.whyMatters}</p>
                </Section>
              )}

              <Section title={`Sources (${n.evidence.length})`}>
                <EvidenceList items={n.evidence} />
              </Section>
            </div>
          );
        })()}

        {active === "relation" && !selectedEdge && (
          <div className="py-6 text-center">
            <p className="text-xs font-medium text-slate-300">No link selected</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              Gold dots sit on the strongest relationships. Click one to see the exact search
              results that justify the link.
            </p>
          </div>
        )}

        {active === "relation" && selectedEdge && (() => {
          const a = graph.nodes.find(n => n.id === selectedEdge.source);
          const b = graph.nodes.find(n => n.id === selectedEdge.target);
          return (
            <div>
              <button onClick={() => selectEdge(null)} className="float-right -mt-1 text-xs text-slate-500 hover:text-white">✕</button>
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/90">Relationship</p>
              <h2 className="mt-1 text-sm font-semibold leading-snug text-white">
                {a?.name} <span className="text-slate-500">↔</span> {b?.name}
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-amber-200">
                  {selectedEdge.relationship.replace(/_/g, " ")}
                </span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-300">
                  confidence {Math.round(selectedEdge.confidence * 100)}%
                </span>
                <span className={`rounded-full px-2 py-0.5 ${selectedEdge.provenance === "AI_INFERRED" ? "bg-violet-500/20 text-violet-200" : "bg-emerald-400/15 text-emerald-300"}`}>
                  {selectedEdge.provenance === "AI_INFERRED" ? "AI-inferred" : "Directly observed"}
                </span>
              </div>

              {selectedEdge.provenance === "AI_INFERRED" && (
                <p className="mt-2.5 rounded-lg bg-violet-500/15 p-2.5 text-[11px] leading-relaxed text-violet-200">
                  <b>AI-inferred relationship.</b> The two entities were not explicitly linked in a
                  source. The inference used only the evidence listed below.
                </p>
              )}

              <Section title="Why is this here?">
                <div className="rounded-lg bg-white/[0.05] p-2.5 text-[11px] leading-relaxed text-slate-300">
                  {a?.name} and {b?.name} co-appear in <b>{selectedEdge.evidence.length}</b> collected
                  results across{" "}
                  <b>{new Set(selectedEdge.evidence.map(e => e.sourceType)).size}</b> engine
                  {new Set(selectedEdge.evidence.map(e => e.sourceType)).size === 1 ? "" : "s"}.
                  Confidence combines independent sources, co-occurrence rate, cross-engine
                  agreement, endpoint similarity and relation-pattern strength.
                </div>
              </Section>

              <Section title={`Evidence (${selectedEdge.evidence.length})`}>
                <EvidenceList items={selectedEdge.evidence} limit={6} />
              </Section>
            </div>
          );
        })()}
      </div>
    </aside>
  );
}
