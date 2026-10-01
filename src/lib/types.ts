// WorldLens core graph schema. Every relationship must carry provenance.

export type EntityType =
  | "company"
  | "startup"
  | "technology"
  | "researcher"
  | "university"
  | "topic"
  | "product"
  | "industry"
  | "person"
  | "location"
  | "event"
  | "institution";

export type EngineName = "search" | "news" | "jobs" | "scholar" | "trends";

export interface EvidenceRef {
  id: string;
  sourceType: EngineName;
  query: string;
  title: string;
  url: string;
  snippet: string;
  date?: string;
}

export interface EntitySignals {
  search: number; // 0..1 normalized
  news: number;
  jobs: number;
  scholar: number;
  trends: number;
}

export interface GraphNode {
  id: string;
  name: string;
  aliases: string[];
  type: EntityType;
  description: string;
  importance: number; // Search Gravity 0..1
  cluster: string;
  confidence: number; // 0..1 evidence-based
  sources: string[]; // urls
  signals: EntitySignals;
  evidence: EvidenceRef[];
  position: [number, number, number];
  whyMatters?: string;
  // raw counts (never shown as invented metrics; used for normalization + WHY panels)
  counts: Record<EngineName, number>;
}

export type RelationshipProvenance = "DIRECTLY_OBSERVED" | "AI_INFERRED";

export interface GraphEdge {
  id: string;
  source: string; // node id
  target: string; // node id
  relationship: string;
  confidence: number;
  weight: number;
  provenance: RelationshipProvenance;
  evidence: EvidenceRef[];
}

export interface ClusterInfo {
  id: string;
  label: string;
  size: number;
  emergenceScore: number;
  emerging: boolean;
  // real counts backing the emergence score
  stats: {
    newsRecent: number;
    trendMomentum: number | null; // 0..1 relative lift, null when unsupported
    hiringEntities: number;
    scholarHits: number;
    enginesCovered: EngineName[];
  };
  nodeIds: string[];
  whyDetected: string[];
}

export interface WorldGraph {
  topic: string;
  mode: "LIVE" | "CACHED" | "MOCK";
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: ClusterInfo[];
  snapshots?: never; // snapshots live client-side; graph stays immutable
}

export interface Observation {
  id: string;
  engine: EngineName;
  query: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  date?: string;
  extra?: Record<string, string>;
}

export interface ExploreMeta {
  mode: "LIVE" | "CACHED" | "MOCK";
  topic: string;
  plannedQueries: PlannedQuery[];
  observations: number;
  uniqueEntities: number;
  apiUsage: { engine: EngineName; query: string; cached: boolean }[];
  engines: Record<EngineName, "pending" | "ok" | "error" | "skipped">;
  warnings: string[];
  tookMs: number;
}

export interface PlannedQuery {
  query: string;
  engines: EngineName[];
  facet: string;
}

export type ProgressEvent =
  | { stage: string; message: string; progress: number; engines?: ExploreMeta["engines"]; observations?: number; entities?: number }
  | { done: true; graph: WorldGraph; meta: ExploreMeta };
