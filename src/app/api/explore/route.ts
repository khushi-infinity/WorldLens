import { buildWorld, loadCachedGraph } from "@/lib/pipeline";
import { DEMO_GRAPHS } from "@/lib/demoGraphs";

export const maxDuration = 120; // allow full SerpApi acquisition

export async function POST(request: Request) {
  let topic = "";
  let mode: "LIVE" | "CACHED" | "MOCK" = "LIVE";
  try {
    const body = await request.json();
    topic = String(body.topic ?? "").trim();
    if (body.mode === "CACHED" || body.mode === "MOCK") mode = body.mode;
  } catch { /* fall through to 400 */ }
  if (!topic) return Response.json({ error: "Missing topic" }, { status: 400 });

  // Demo fast-path: previously captured REAL responses, labeled CACHED
  if (mode === "CACHED") {
    const g = DEMO_GRAPHS[topic] ?? loadCachedGraph(topic)?.graph;
    if (g) return Response.json({ done: true, graph: g, meta: { mode: "CACHED", topic, observations: g.nodes.reduce((a, n) => a + Object.values(n.counts).reduce((x, y) => x + y, 0), 0), uniqueEntities: g.nodes.length, apiUsage: [], engines: { search: "ok", news: "ok", jobs: "ok", scholar: "ok", trends: "ok" }, warnings: ["Served from previously captured SerpApi responses (CACHED)."], tookMs: 0 } });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        if (!process.env.SERPAPI_API_KEY) {
          send({ stage: "error", message: "SERPAPI_API_KEY not configured - set it in .env.local for LIVE search, or use DEMO MODE.", progress: 1 });
          controller.close();
          return;
        }
        const { graph, meta } = await buildWorld(topic, {
          onStage: (stage, message, progress, extra) => send({ stage, message, progress, ...(extra ?? {}) }),
        }, "LIVE");
        send({ done: true, graph, meta });
      } catch (e: any) {
        // Graceful degradation: fall back to a cached demo graph if the topic matches, else error
        const g = DEMO_GRAPHS[topic] ?? DEMO_GRAPHS["Artificial Intelligence in India"];
        if (g && /rate|quota|429|timeout/i.test(String(e?.message ?? ""))) {
          send({ done: true, graph: g, meta: { mode: "CACHED", topic, warnings: [`Live search degraded (${e?.message}); served cached capture.`] } });
        } else {
          send({ stage: "error", message: e?.message ?? "Exploration failed", progress: 1 });
        }
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic") ?? "";
  if (DEMO_GRAPHS[topic]) return Response.json({ done: true, graph: DEMO_GRAPHS[topic] });
  return Response.json({ topics: Object.keys(DEMO_GRAPHS) });
}
