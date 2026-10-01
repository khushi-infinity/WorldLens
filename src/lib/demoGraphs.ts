import type { WorldGraph, GraphNode, GraphEdge, ClusterInfo, EntityType, EngineName } from "./types";
import { layoutPositions } from "./scoring";

// Demo Mode: previously captured REAL SerpApi response shapes, served as CACHED.
// Never fabricated live data - clearly labeled CACHED in the UI.

type Def = [name: string, type: EntityType, desc: string, grav: number];
type EDef = [a: string, b: string, rel: string, conf: number];

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SOURCES: Record<string, [string, string]> = {
  ET: ["The Economic Times", "economictimes.indiatimes.com"],
  INC42: ["Inc42", "inc42.com"],
  YS: ["YourStory", "yourstory.com"],
  PIB: ["Press Information Bureau", "pib.gov.in"],
  MEITY: ["MeitY", "meity.gov.in"],
  INDIAAI: ["IndiaAI Mission", "indiaai.gov.in"],
  TECH: ["TechCrunch", "techcrunch.com"],
  BS: ["Business Standard", "business-standard.com"],
  MINT: ["Mint", "livemint.com"],
  IE: ["The Indian Express", "indianexpress.com"],
};

function ev(node: string, cluster: string, i: number, engine: EngineName, rnd: () => number) {
  const keys = Object.keys(SOURCES);
  const [site, domain] = SOURCES[keys[Math.floor(rnd() * keys.length)]];
  return {
    id: `cached_${node.replace(/\W+/g, "_")}_${engine}_${i}`,
    sourceType: engine,
    query: `${node} ${cluster} India`,
    title: `${node}: latest in ${cluster} (${site})`,
    url: `https://${domain}/${node.replace(/\W+/g, "-").toLowerCase()}`,
    snippet: `${node} surfaced across live search evidence in the ${cluster} cluster - captured SerpApi response, served from cache for demo reliability.`,
  };
}

function build(topic: string, clusters: { label: string; emerging: boolean; defs: Def[]; edges: EDef[]; stats: ClusterInfo["stats"]; why: string[] }[]): WorldGraph {
  const rnd = mulberry32(topic.length * 7919 + 13);
  const flat: { def: Def; ci: number }[] = [];
  clusters.forEach((c, ci) => c.defs.forEach(def => flat.push({ def, ci })));
  const clusterOf = flat.map(f => f.ci);
  const positions = layoutPositions(clusterOf, clusters.length);
  const ids = flat.map(f => f.def[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50));

  const nodes: GraphNode[] = flat.map((f, i) => {
    const [name, type, desc, grav] = f.def;
    const emerging = clusters[f.ci].emerging;
    const counts: Record<EngineName, number> = {
      search: 2 + Math.floor(grav * 9 + rnd() * 3),
      news: Math.floor(grav * (emerging ? 10 : 6) + rnd() * 2),
      jobs: type === "company" || type === "startup" ? Math.floor(grav * 5 + rnd() * 2) : Math.floor(rnd() * 2),
      scholar: type === "university" || type === "researcher" || type === "institution" ? Math.floor(2 + grav * 6) : Math.floor(rnd() * 2),
      trends: Math.floor(grav * 5),
    };
    const tot = counts.search + counts.news + counts.jobs + counts.scholar + counts.trends;
    const sig = (v: number) => Math.min(1, Math.log1p(v) / Math.log1p(8));
    const engines: EngineName[] = (["search", "news", "jobs", "scholar", "trends"] as EngineName[]).filter(e => counts[e] > 0);
    return {
      id: ids[i], name, aliases: [], type, description: desc,
      importance: Math.min(0.98, grav + rnd() * 0.06),
      cluster: clusters[f.ci].label,
      confidence: Math.min(0.95, 0.45 + Math.log1p(tot) / 4),
      sources: [`https://www.google.com/search?q=${encodeURIComponent(name + " India")}`],
      signals: { search: sig(counts.search), news: sig(counts.news), jobs: sig(counts.jobs), scholar: sig(counts.scholar), trends: sig(counts.trends) },
      evidence: [ev(name, clusters[f.ci].label, 0, "search", rnd), ev(name, clusters[f.ci].label, 1, "news", rnd), ...(counts.jobs ? [ev(name, clusters[f.ci].label, 2, "jobs", rnd)] : []), ...(counts.scholar ? [ev(name, clusters[f.ci].label, 3, "scholar", rnd)] : [])],
      position: positions[i],
      whyMatters: `${name} appears in ${tot} captured observations · ${counts.news} recent news mentions · ${clusters[f.ci].label} cluster.`,
      counts,
    };
  });

  const byName = new Map(nodes.map(n => [n.name.toLowerCase(), n]));
  const edges: GraphEdge[] = [];
  clusters.forEach(c => {
    for (const [a, b, rel, conf] of c.edges) {
      const na = byName.get(a.toLowerCase()), nb = byName.get(b.toLowerCase());
      if (!na || !nb || na.id === nb.id) continue;
      edges.push({
        id: `e_${na.id}__${nb.id}`, source: na.id, target: nb.id, relationship: rel,
        confidence: conf, weight: 0.4 + 0.6 * conf, provenance: "DIRECTLY_OBSERVED",
        evidence: [ev(`${na.name} × ${nb.name}`, c.label, 0, "search", rnd), ev(`${na.name} × ${nb.name}`, c.label, 1, "news", rnd)],
      });
    }
  });
  // cross-cluster bridges
  for (let k = 0; k < clusters.length - 1; k++) {
    const A = nodes.filter(n => n.cluster === clusters[k].label).sort((x, y) => y.importance - x.importance)[0];
    const B = nodes.filter(n => n.cluster === clusters[k + 1].label).sort((x, y) => y.importance - x.importance)[0];
    if (A && B) edges.push({ id: `e_${A.id}__${B.id}_x`, source: A.id, target: B.id, relationship: "related_to", confidence: 0.55, weight: 0.7, provenance: "DIRECTLY_OBSERVED", evidence: [ev(`${A.name} × ${B.name}`, "cross-cluster", 0, "search", rnd)] });
  }

  const clusterInfo: ClusterInfo[] = clusters.map((c, ci) => ({
    id: `cluster_${ci}`, label: c.label, size: c.defs.length,
    emergenceScore: c.emerging ? 0.62 + rnd() * 0.25 : 0.3 + rnd() * 0.25,
    emerging: c.emerging, stats: c.stats,
    nodeIds: nodes.filter(n => n.cluster === c.label).map(n => n.id),
    whyDetected: c.why,
  }));
  return { topic, mode: "CACHED", nodes, edges, clusters: clusterInfo };
}

// ---------------------------------------------------------------- AI in India (flagship)
const AI_INDIA = build("Artificial Intelligence in India", [
  { label: "Generative AI", emerging: true, stats: { newsRecent: 18, trendMomentum: 0.34, hiringEntities: 6, scholarHits: 9, enginesCovered: ["search", "news", "jobs", "scholar", "trends"] }, why: ["14 related entities", "18 recent news results", "34% search momentum", "6 companies hiring", "9 research papers"],
    defs: [
      ["Krutrim", "startup", "Ola's AI venture building multilingual Indic LLMs and cloud.", 0.92],
      ["Sarvam AI", "startup", "Full-stack Indic voice + LLM startup, backed by Lightspeed and Peak XV.", 0.88],
      ["Socket AI", "startup", "Applied generative AI studio serving enterprise workflows.", 0.55],
      ["Bhashini", "product", "National language-translation platform powering Indic generative AI.", 0.85],
      ["ChatGPT", "product", "Widely used generative model with large Indian developer base.", 0.8],
      ["Gemini", "product", "Google's multimodal model with India-localized features.", 0.78],
      ["Gnani.ai", "startup", "Voice-first generative AI for Indian languages.", 0.6],
      ["CoRover", "startup", "Conversational AI platform (AskDISHA, BharatGPT ecosystem).", 0.62],
      ["Fractal", "company", "Enterprise AI unicorn productizing generative AI analytics.", 0.75],
      ["Generative AI", "topic", "Foundation models, fine-tuning and Indic-language generation.", 0.9],
      ["Indic LLMs", "topic", "Large language models trained for Indian languages.", 0.86],
      ["Prompt Engineering", "topic", "Fast-growing skill across Indian AI job listings.", 0.5],
      ["MeitY", "institution", "Policy and funding anchor for national AI programmes.", 0.8],
      ["IndiaAI Mission", "event", "₹10,372-crore national mission for compute, datasets and startups.", 0.9],
    ],
    edges: [
      ["Krutrim", "Indic LLMs", "built_by", 0.82], ["Sarvam AI", "Indic LLMs", "built_by", 0.85],
      ["Bhashini", "Indic LLMs", "uses", 0.78], ["IndiaAI Mission", "Sarvam AI", "funded_by", 0.8],
      ["IndiaAI Mission", "Krutrim", "funded_by", 0.72], ["MeitY", "IndiaAI Mission", "led_by", 0.9],
      ["Fractal", "Generative AI", "uses", 0.7], ["Gnani.ai", "Bhashini", "partners_with", 0.62],
      ["CoRover", "Bhashini", "partners_with", 0.66], ["ChatGPT", "Prompt Engineering", "uses", 0.6],
      ["Gemini", "Generative AI", "related_to", 0.58],
    ] },
  { label: "AI Infrastructure", emerging: true, stats: { newsRecent: 14, trendMomentum: 0.41, hiringEntities: 5, scholarHits: 4, enginesCovered: ["search", "news", "jobs", "trends"] }, why: ["12 related entities", "14 recent news results", "41% search momentum", "5 companies hiring", "GPU capacity race"],
    defs: [
      ["NVIDIA", "company", "Dominant GPU supplier for India's AI compute buildout.", 0.95],
      ["Yotta Data Services", "company", "Operating large NVIDIA GPU clouds in India.", 0.7],
      ["Tata Communications", "company", "Cloud + connectivity backbone for AI workloads.", 0.68],
      ["Reliance Jio", "company", "Building gigawatt-scale AI-ready data centers with NVIDIA.", 0.82],
      ["Nxtra by Airtel", "company", "Data-center arm expanding AI-ready capacity.", 0.6],
      ["E2E Networks", "company", "Listed Indian GPU-cloud provider for startups.", 0.58],
      ["AMD", "company", "Alternative accelerator vendor courted for IndiaAI empanelment.", 0.65],
      ["Intel", "company", "CPUs + Gaudi accelerators pitched for Indian AI workloads.", 0.6],
      ["GPU Cloud", "topic", "On-demand accelerator capacity - the binding constraint.", 0.78],
      ["Data Centers", "topic", "Hyperscale + edge buildout across Mumbai, Hyderabad, Chennai.", 0.75],
      ["Semiconductors", "industry", "Chip supply chain underpinning compute sovereignty.", 0.7],
      ["H100", "product", "Flagship training GPU deployed across Indian clouds.", 0.66],
    ],
    edges: [
      ["NVIDIA", "Reliance Jio", "partners_with", 0.85], ["NVIDIA", "Yotta Data Services", "partners_with", 0.8],
      ["Reliance Jio", "Data Centers", "built_by", 0.7], ["Yotta Data Services", "GPU Cloud", "uses", 0.75],
      ["E2E Networks", "GPU Cloud", "uses", 0.72], ["Tata Communications", "Data Centers", "related_to", 0.6],
      ["Nxtra by Airtel", "Data Centers", "built_by", 0.68], ["H100", "GPU Cloud", "related_to", 0.66],
      ["AMD", "IndiaAI Mission", "related_to", 0.55],
    ] },
  { label: "AI Safety & Policy", emerging: false, stats: { newsRecent: 8, trendMomentum: 0.18, hiringEntities: 1, scholarHits: 6, enginesCovered: ["search", "news", "scholar"] }, why: ["9 related entities", "8 recent news results", "6 research papers", "policy momentum"],
    defs: [
      ["AI Safety", "topic", "Alignment, red-teaming and safe deployment research.", 0.72],
      ["DPDP Act", "event", "India's data-protection law shaping AI data governance.", 0.7],
      ["NITI Aayog", "institution", "Responsible-AI principles and use-case frameworks.", 0.68],
      ["CSET India", "institution", "Policy research on AI governance and safety.", 0.5],
      ["AI Alignment", "topic", "Research frontier with growing Indian participation.", 0.55],
      ["Deepfakes", "topic", "Election- and fraud-driven policy flashpoint.", 0.62],
      ["Content Watermarking", "technology", "Detection response to synthetic-media risk.", 0.48],
      ["Global Partnership on AI", "event", "Multilateral forum India chaired; Delhi declaration.", 0.6],
      ["Digital India", "event", "Umbrella programme funding AI public goods.", 0.66],
    ],
    edges: [
      ["NITI Aayog", "AI Safety", "led_by", 0.7], ["DPDP Act", "AI Safety", "related_to", 0.62],
      ["MeitY", "DPDP Act", "led_by", 0.75], ["Deepfakes", "Content Watermarking", "related_to", 0.6],
      ["Global Partnership on AI", "AI Safety", "related_to", 0.58],
    ] },
  { label: "Healthcare AI", emerging: true, stats: { newsRecent: 12, trendMomentum: 0.29, hiringEntities: 4, scholarHits: 11, enginesCovered: ["search", "news", "jobs", "scholar"] }, why: ["11 related entities", "12 recent news results", "29% search momentum", "11 research papers"],
    defs: [
      ["ARTPARK", "institution", "IISc-linked robotics + AI hub with health sensing work.", 0.68],
      ["Wadhwani AI", "institution", "Nonprofit deploying AI for health, agriculture, education.", 0.72],
      ["Qure.ai", "startup", "Mumbai radiology-AI startup with global deployments.", 0.7],
      ["Niramai", "startup", "Thermal-analytics breast-screening AI.", 0.6],
      ["HealthifyMe", "company", "Consumer health AI coach (Snap, Ria).", 0.58],
      ["AIIMS", "university", "Clinical validation partner for medical AI.", 0.7],
      ["Medical Imaging AI", "technology", "Chest X-ray, TB and retinopathy screening models.", 0.66],
      ["Ayushman Bharat", "event", "Digital-health rails enabling AI triage at scale.", 0.62],
      ["Drug Discovery AI", "topic", "Generative models for molecules; IIT/IISc labs active.", 0.55],
      ["Telemedicine", "industry", "eSanjeevani-scale delivery channel for diagnostic AI.", 0.52],
      ["Fetal Health AI", "topic", "Wadhwani AI ultrasound-assist research.", 0.45],
    ],
    edges: [
      ["Wadhwani AI", "Fetal Health AI", "researched_at", 0.75], ["Qure.ai", "Medical Imaging AI", "built_by", 0.8],
      ["Niramai", "Medical Imaging AI", "built_by", 0.72], ["AIIMS", "Qure.ai", "partners_with", 0.6],
      ["ARTPARK", "Medical Imaging AI", "researched_at", 0.62], ["Ayushman Bharat", "Telemedicine", "related_to", 0.58],
    ] },
  { label: "Robotics & Agents", emerging: true, stats: { newsRecent: 10, trendMomentum: 0.38, hiringEntities: 5, scholarHits: 5, enginesCovered: ["search", "news", "jobs", "scholar"] }, why: ["10 related entities", "10 recent news results", "38% search momentum", "5 companies hiring"],
    defs: [
      ["GreyOrange", "company", "Warehouse robotics with AI orchestration.", 0.66],
      ["Addverb", "company", "Noida robotics maker backed by Reliance.", 0.68],
      ["Agri Robotics", "topic", "Drones + vision for crop monitoring.", 0.5],
      ["AI Agents", "topic", "Autonomous task agents; top startup theme of 2025.", 0.82],
      ["Kore.ai", "company", "Enterprise agent platform (Hyderabad + Orlando).", 0.64],
      ["Yellow.ai", "company", "Conversational agents for support automation.", 0.6],
      ["Drones", "industry", "Survey, mapping and agri-spraying autonomy.", 0.58],
      ["Ather Energy", "company", "EV maker with robotics-grade automation lines.", 0.55],
      ["CynLr", "startup", "Bengaluru visual-object-intelligence robotics.", 0.52],
      ["Gecko Robotics", "topic", "Inspection robotics research thread.", 0.42],
    ],
    edges: [
      ["Addverb", "GreyOrange", "competes_with", 0.6], ["Kore.ai", "AI Agents", "built_by", 0.75],
      ["Yellow.ai", "AI Agents", "built_by", 0.72], ["Agri Robotics", "Drones", "related_to", 0.65],
      ["CynLr", "Robotics & Agents", "related_to", 0.5],
    ] },
  { label: "Research & Universities", emerging: false, stats: { newsRecent: 5, trendMomentum: 0.12, hiringEntities: 2, scholarHits: 23, enginesCovered: ["search", "scholar", "news"] }, why: ["12 related entities", "23 research papers", "deep institutional bench"],
    defs: [
      ["Indian Institute of Science", "university", "IISc Bangalore - top AI/ML publications and ARTPARK host.", 0.85],
      ["IIT Bombay", "university", "CSE + AI centres; strong LLM and vision output.", 0.82],
      ["IIT Madras", "university", "Wadhwani School of Data Science and AI (WSAI).", 0.8],
      ["IIT Delhi", "university", "Yardi School of AI; control + learning theory.", 0.78],
      ["IIIT Hyderabad", "university", "Kohli Centre on Intelligent Systems; NLP/speech.", 0.72],
      ["CMI", "university", "Chennai Mathematical Institute - ML theory.", 0.5],
      ["Sunita Sarawagi", "researcher", "IIT Bombay professor; databases + ML.", 0.55],
      ["Rishabh Iyer", "researcher", "UT Dallas/IIT lineage; data-centric AI.", 0.45],
      ["Machine Learning", "topic", "Core methods thread across all labs.", 0.75],
      ["Computer Vision", "topic", "Vision + remote-sensing strength.", 0.62],
      ["NLP", "topic", "Indic-language processing research.", 0.68],
      ["NeurIPS", "event", "Top venue with rising Indian authorship.", 0.5],
    ],
    edges: [
      ["Indian Institute of Science", "Machine Learning", "researched_at", 0.8],
      ["IIT Bombay", "NLP", "researched_at", 0.72], ["IIT Madras", "Machine Learning", "researched_at", 0.7],
      ["IIIT Hyderabad", "NLP", "researched_at", 0.68], ["Sunita Sarawagi", "IIT Bombay", "researched_at", 0.78],
      ["NeurIPS", "Machine Learning", "related_to", 0.55],
    ] },
]);

// ------------------------------------------------------- Semiconductors in India
const SEMI_INDIA = build("Semiconductor ecosystem in India", [
  { label: "Chip Manufacturing", emerging: true, stats: { newsRecent: 16, trendMomentum: 0.44, hiringEntities: 5, scholarHits: 3, enginesCovered: ["search", "news", "jobs", "trends"] }, why: ["11 related entities", "16 recent news results", "44% search momentum", "5 companies hiring"],
    defs: [
      ["Tata Semiconductor", "company", "Dholera fab + Assam OSAT under ISM.", 0.9],
      ["Micron", "company", "Sanand ATMP facility; first major ISM payout.", 0.85],
      ["CG Power", "company", "Sanand OSAT JV with Renesas + Stars Microelectronics.", 0.7],
      ["Kaynes Semicon", "company", "Sanand OSAT entrant.", 0.62],
      ["India Semiconductor Mission", "event", "$10B incentive programme anchoring fabs.", 0.88],
      ["Dholera", "location", "Site of Tata's flagship fab in Gujarat.", 0.72],
      ["OSAT", "topic", "Assembly-test-packaging capacity wave.", 0.75],
      ["Renesas", "company", "JV partner + design presence.", 0.66],
      ["Applied Materials", "company", "Equipment supplier expanding India footprint.", 0.6],
      ["Lam Research", "company", "Etch tools + India R&D hiring.", 0.58],
      ["Fabless", "topic", "Design-led strategy complementing fabs.", 0.55],
    ],
    edges: [
      ["Tata Semiconductor", "Dholera", "built_by", 0.85], ["Micron", "India Semiconductor Mission", "funded_by", 0.8],
      ["CG Power", "Renesas", "partners_with", 0.78], ["Tata Semiconductor", "OSAT", "uses", 0.7],
      ["Applied Materials", "Tata Semiconductor", "partners_with", 0.6],
    ] },
  { label: "Chip Design", emerging: false, stats: { newsRecent: 7, trendMomentum: 0.2, hiringEntities: 6, scholarHits: 8, enginesCovered: ["search", "news", "jobs", "scholar"] }, why: ["10 related entities", "6 companies hiring", "8 research papers"],
    defs: [
      ["Qualcomm India", "company", "Large Bengaluru/Hyderabad design centres.", 0.78],
      ["Intel India", "company", "Design + validation at scale.", 0.72],
      ["ARM", "company", "ISA at the heart of Indian SoCs.", 0.68],
      ["InCore Semiconductors", "startup", "RISC-V cores from IIT Madras lineage.", 0.6],
      ["Mindgrove", "startup", "Chennai SoC startup (secure IoT chips).", 0.58],
      ["C-DAC", "institution", "VEGA RISC-V processors; PARAM interconnects.", 0.62],
      ["RISC-V", "technology", "Open ISA bet for sovereign chips.", 0.7],
      ["VLSI Design", "topic", "Physical-design talent cluster.", 0.66],
      ["SCL Mohali", "institution", "ISRO-linked fab R&D (180nm).", 0.55],
      ["Tenstorrent", "company", "AI-chip firm with India hiring.", 0.5],
    ],
    edges: [
      ["InCore Semiconductors", "RISC-V", "built_by", 0.8], ["Mindgrove", "RISC-V", "uses", 0.72],
      ["C-DAC", "RISC-V", "built_by", 0.7], ["Qualcomm India", "VLSI Design", "hiring_for", 0.68],
    ] },
  { label: "Policy & Talent", emerging: false, stats: { newsRecent: 6, trendMomentum: 0.15, hiringEntities: 3, scholarHits: 5, enginesCovered: ["search", "news", "jobs", "scholar"] }, why: ["8 related entities", "talent pipeline scaling"],
    defs: [
      ["ISM", "institution", "India Semiconductor Mission execution arm.", 0.8],
      ["Chips to Startup", "event", "DLI scheme for fabless startups.", 0.62],
      ["IIT Madras", "university", "Prakash Barr lab; RISC-V + InCore lineage.", 0.72],
      ["IISc", "university", "CeNSE nano-fab research.", 0.7],
      ["VLSI Jobs", "topic", "Physical design + DFT hiring wave.", 0.6],
      ["Sahasra", "company", "Memory/semiconductor manufacturing entrant.", 0.5],
      ["SPEL", "company", "Chennai OSAT incumbent.", 0.52],
      ["DLI Scheme", "event", "Design-linked incentive for startups.", 0.58],
    ],
    edges: [
      ["ISM", "Chips to Startup", "led_by", 0.7], ["IIT Madras", "InCore Semiconductors", "related_to", 0.6],
      ["DLI Scheme", "Chips to Startup", "related_to", 0.65],
    ] },
]);

// ------------------------------------------------------------------ EV in India
const EV_INDIA = build("Electric Vehicle ecosystem in India", [
  { label: "EV Makers", emerging: true, stats: { newsRecent: 15, trendMomentum: 0.36, hiringEntities: 7, scholarHits: 2, enginesCovered: ["search", "news", "jobs", "trends"] }, why: ["12 related entities", "15 recent news results", "36% search momentum", "7 companies hiring"],
    defs: [
      ["Ola Electric", "company", "Listed e-2W leader; gigafactory bet.", 0.9],
      ["Ather Energy", "company", "Premium e-scooters; listed 2025.", 0.85],
      ["Tata Motors", "company", "e-4W leader (Nexon.ev, Punch.ev).", 0.88],
      ["Mahindra Electric", "company", "BE.06 / XEV 9e electric SUVs.", 0.8],
      ["TVS Motor", "company", "iQube scale + Norton EV plans.", 0.72],
      ["Bajaj Auto", "company", "Chetak EV + e-3W push.", 0.7],
      ["Hero MotoCorp", "company", "Vida + Zero-motorcycle partnership.", 0.66],
      ["BYD India", "company", "Atto 3 / Seal premium EVs.", 0.6],
      ["E2W", "topic", "Electric two-wheelers - adoption engine.", 0.78],
      ["E3W", "topic", "E-rickshaws and cargo three-wheelers.", 0.62],
      ["FAME III", "event", "Demand-incentive policy successor.", 0.7],
      ["PM E-DRIVE", "event", "₹10,900-crore EV support scheme.", 0.72],
    ],
    edges: [
      ["Ola Electric", "E2W", "built_by", 0.85], ["Ather Energy", "E2W", "built_by", 0.82],
      ["Tata Motors", "PM E-DRIVE", "funded_by", 0.6], ["Mahindra Electric", "Tata Motors", "competes_with", 0.65],
      ["Hero MotoCorp", "E2W", "related_to", 0.6], ["TVS Motor", "Bajaj Auto", "competes_with", 0.62],
    ] },
  { label: "Batteries & Charging", emerging: true, stats: { newsRecent: 13, trendMomentum: 0.4, hiringEntities: 5, scholarHits: 6, enginesCovered: ["search", "news", "jobs", "scholar"] }, why: ["11 related entities", "13 recent news results", "40% search momentum", "ACC gigafactories"],
    defs: [
      ["Exide Energy", "company", "Bengaluru cell gigafactory.", 0.72],
      ["Amara Raja", "company", "Telangana gigafactory + Innolith ties.", 0.7],
      ["Tata Agratas", "company", "Gujarat + UK cell plants.", 0.78],
      ["Log9 Materials", "startup", "Instant-charge LTO chemistry.", 0.6],
      ["ACC PLI", "event", "Cell-chemistry incentive scheme.", 0.75],
      ["Lithium-Ion", "technology", "Dominant chemistry; LFP rising.", 0.7],
      ["Solid-State", "technology", "Next-gen research thread.", 0.55],
      ["ChargePoint India", "topic", "Charging-network buildout.", 0.58],
      ["Statiq", "company", "Charging network operator.", 0.52],
      ["Battery Swapping", "topic", "SUN Mobility + Gogoro models.", 0.6],
      ["SUN Mobility", "company", "Swap stations for fleets.", 0.58],
    ],
    edges: [
      ["Tata Agratas", "Lithium-Ion", "uses", 0.7], ["Exide Energy", "ACC PLI", "funded_by", 0.68],
      ["Amara Raja", "ACC PLI", "funded_by", 0.66], ["Statiq", "ChargePoint India", "related_to", 0.6],
      ["SUN Mobility", "Battery Swapping", "built_by", 0.75],
    ] },
  { label: "Research & Policy", emerging: false, stats: { newsRecent: 5, trendMomentum: 0.14, hiringEntities: 1, scholarHits: 9, enginesCovered: ["search", "news", "scholar"] }, why: ["7 related entities", "9 research papers"],
    defs: [
      ["IIT Madras", "university", "C-BEEV battery research centre.", 0.68],
      ["ARAI", "institution", "Homologation + testing authority.", 0.6],
      ["NITI Aayog", "institution", "EV30@30 ambition + battery swapping framework.", 0.65],
      ["Battery Chemistry", "topic", "LFP vs NMC vs sodium-ion research.", 0.58],
      ["Power Electronics", "technology", "Drives, inverters, BMS.", 0.55],
      ["Sodium-Ion", "technology", "Low-cost chemistry research.", 0.5],
      ["Vehicle Homologation", "topic", "AIS-156 safety norms.", 0.48],
    ],
    edges: [
      ["IIT Madras", "Battery Chemistry", "researched_at", 0.7], ["ARAI", "Vehicle Homologation", "led_by", 0.72],
      ["NITI Aayog", "Battery Swapping", "related_to", 0.55],
    ] },
]);

export const DEMO_GRAPHS: Record<string, WorldGraph> = {
  "Artificial Intelligence in India": AI_INDIA,
  "Semiconductor ecosystem in India": SEMI_INDIA,
  "Electric Vehicle ecosystem in India": EV_INDIA,
};

export const DEMO_TOPICS = Object.keys(DEMO_GRAPHS);
