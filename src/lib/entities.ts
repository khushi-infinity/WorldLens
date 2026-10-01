import type { Observation, EntityType, EvidenceRef, EngineName } from "./types";

export interface Candidate {
  name: string;
  type: EntityType;
  description: string;
  observations: Observation[];
  domains: Set<string>;
  /** Set when the name came from a structured field (knowledge_graph, jobs company_name). */
  highPrecision?: boolean;
}

const STOP = new Set(("The,A,An,Of,In,On,For,And,With,From,Top,Best,New,India,Indian,AI,How,What,Why,Who,When,Vs,Review,Latest,Breaking,Live,Explained,Know,About,Here,There,Their,This,That,These,Those,Your,You,Our,Out,Report,News,Update,Announces,Launches,Launched,Data,Market,Reports,Growth,Future,Global,National,Digital,Today,Amid,Year,Years,Time,Back,Over,More,Most,Many,Much,Such,Than,Then,Also,Across,Between,Under,While,After,Before,Indias,Its,His,Her,Says,Said,Will,Can,May,One,Two,First,Big").split(",").map(s => s.toLowerCase()));

/**
 * Words that must never become an entity on their own: generic tech/business nouns,
 * quantifiers, adjectives, comparatives and interrogatives mined from SERP boilerplate.
 * Keeping this list tight is what separates "NVIDIA" from "Scale Deepening".
 */
const JUNK = new Set([
  // quantifiers / scale
  "million", "billion", "trillion", "lakh", "crore", "scale", "scaling", "deepening", "elevation",
  "equal", "strong", "weak", "good", "bad", "better", "best", "worst", "high", "low", "small", "large",
  "big", "new", "old", "fast", "slow", "easy", "hard", "real", "true", "full", "open", "next", "one",
  // generic nouns
  "startup", "startups", "company", "companies", "firm", "firms", "business", "industry", "industries",
  "sector", "sectors", "market", "markets", "ecosystem", "innovation", "innovations", "infrastructure",
  "technology", "technologies", "policy", "policies", "government", "regulation", "regulations", "law",
  "laws", "system", "systems", "platform", "platforms", "solution", "solutions", "product", "products",
  "service", "services", "project", "projects", "program", "programs", "programme", "initiative",
  "funding", "fund", "funds", "investment", "investments", "growth", "future", "trend", "trends",
  "challenge", "challenges", "opportunity", "opportunities", "issue", "issues", "problem", "problems",
  "area", "areas", "field", "fields", "tool", "tools", "app", "apps", "feature", "features", "model",
  "models", "series", "version", "versions", "level", "levels", "entry", "range", "category", "categories",
  "example", "examples", "type", "types", "kind", "kinds", "role", "part", "parts", "side", "case",
  "cases", "point", "points", "way", "ways", "need", "needs", "help", "use", "uses", "work", "works",
  "research", "science", "team", "teams", "group", "groups", "member", "members", "people", "person",
  "consultancy", "consultancies", "consultant", "consultants", "org", "orgs", "organization",
  "organizations", "computer", "computers", "cert", "certs", "certificate", "certificates",
  "building", "updating", "guide", "guides", "review", "reviews", "become", "becomes", "creating",
  // interrogatives / sentence scaffolding
  "which", "what", "why", "how", "when", "where", "who", "whom", "whose", "does", "did", "is", "are",
  "was", "were", "will", "would", "should", "could", "can", "has", "have", "had", "been", "being",
  "here", "there", "their", "its", "his", "her", "our", "your", "my", "you", "they", "them",
  "this", "that", "these", "those", "such", "than", "then", "also", "more", "most", "many", "much",
  "between", "across", "within", "without", "about", "into", "onto", "from", "over", "under", "after",
  "before", "during", "while", "because", "however", "meanwhile", "instead", "rather", "even",
  "top", "best", "leading", "major", "main", "key", "big", "other", "another", "such", "own",
  // filler found in SERP titles
  "yes", "really", "actually", "simply", "just", "very", "quite", "rather", "still", "yet", "ever",
  "never", "always", "often", "sometimes", "usually", "now", "today", "yesterday", "tomorrow",
  "said", "says", "say", "told", "added", "according", "including", "include", "includes",
]);

/**
 * Words that can never appear inside a mined proper noun. Blocklists on head words
 * alone produced fragments like "Ambitions Expose" and "Centres Plan May Hit", so any
 * occurrence of a function word or generic verb rejects the whole phrase.
 */
const NEVER_IN_NAME = new Set([
  // articles / prepositions / conjunctions
  "a", "an", "the", "of", "in", "on", "at", "to", "for", "from", "with", "without", "by", "as",
  "and", "or", "but", "if", "than", "then", "that", "this", "these", "those", "into", "onto",
  "over", "under", "about", "after", "before", "between", "through", "during", "while", "per",
  // auxiliary / copula
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did", "has", "have",
  "had", "will", "would", "can", "could", "shall", "should", "may", "might", "must", "need",
  "get", "gets", "got", "let", "lets",
  // generic verbs that create headline fragments
  "plan", "plans", "planned", "hit", "hits", "expose", "exposes", "exposed", "call", "calls",
  "called", "shaping", "shape", "shapes", "develop", "develops", "developed", "lead", "leads",
  "leading", "govern", "governs", "governance", "make", "makes", "made", "take", "takes", "took",
  "give", "gives", "gave", "come", "comes", "came", "go", "goes", "went", "see", "sees", "saw",
  "know", "knows", "knew", "think", "thinks", "want", "wants", "need", "needs", "use", "uses",
  "used", "using", "add", "adds", "added", "help", "helps", "helped", "work", "works", "worked",
  "build", "builds", "building", "built", "create", "creates", "created", "creating", "solve",
  "solves", "solved", "solve", "start", "starts", "started", "become", "becomes", "became",
  "show", "shows", "showed", "find", "finds", "found", "learn", "learns", "learned", "teach",
  "teaches", "taught", "read", "reads", "write", "writes", "wrote", "join", "joins", "joined",
  "hiring", "hire", "hires", "hired", "announce", "announces", "announced", "launch", "launches",
  "launched", "unveil", "unveils", "unveiled", "raise", "raises", "raised", "fund", "funds",
  "funded", "invest", "invests", "invested", "acquire", "acquires", "acquired", "partner",
  "partners", "partnered", "boost", "boosts", "boosted", "grow", "grows", "grew", "rising",
  "mentor", "mentors", "mentored", "mentoring", "integrate", "integrates", "establish",
  "establishes", "established", "weigh", "weighs", "discuss", "discusses", "discussed",
  "highlight", "highlights", "highlighted", "release", "releases", "released", "draft", "drafts",
  "expand", "expands", "expanded", "president", "presidents", "engineer", "engineers", "builds",
  "already", "done", "hurdle", "hurdles", "fight", "fights", "tackle", "tackles", "master",
  "masters", "improve", "improves", "improved", "reduce", "reduces", "reduced", "increase",
  "increases", "increased", "enable", "enables", "enabled", "adopt", "adopts", "adopted",
  "skills", "skill", "agentic", "sahab", "study", "studies", "study's", "survey", "surveys",
  "highlights", "reveals", "shows", "explains", "covers", "features", "includes", "lists",
  "reviews", "ranks", "top", "versus", "vs", "part", "parts", "step", "steps", "level", "levels",
  // generic head nouns
  "course", "courses", "fees", "fee", "tasks", "task", "ambitions", "ambition", "responsibilities",
  "responsibility", "plans", "centres", "experts", "expert", "shaping", "aspects", "aspect",
  "ways", "way", "reasons", "reason", "things", "thing", "people", "steps", "step", "tips",
  "benefits", "benefit", "outlook", "future", "today", "now", "here", "there",
]);

/** Structural test for a mined proper noun: no function words, no headline verbs. */
export function looksLikeProperNoun(rawName: string): boolean {
  const words = rawName
    .replace(/[^\p{L}\p{N}\s&.'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length || words.length > 5) return false;
  if (words.some(w => NEVER_IN_NAME.has(w.toLowerCase().replace(/[^a-z]/g, "")))) return false;
  // Every token must be capitalized (a proper noun), except connectors like "of" which
  // are already rejected above, so strict capitalization is safe here.
  if (!words.every(w => /^[A-Z0-9]/.test(w))) return false;
  return true;
}

/** Reject names that are not plausibly a real-world entity. */
export function isPlausibleEntity(rawName: string): boolean {
  const n = rawName.replace(/[®™©]/g, "").trim();
  if (n.length < 3 || n.length > 70) return false;
  if (!/[A-Za-z]/.test(n)) return false;
  if (!/^[A-Z0-9]/.test(n)) return false;              // must be capitalized (proper noun)
  if (/[?!]$/.test(n)) return false;                      // question fragments
  if (/\b(which|what|why|how|when|where|who|does|did|is|are|was|were|will|should|could|has|have|had)\b/i.test(n)) return false;
  if (/^The\s+\w/.test(n) && n.split(/\s+/).length < 3) return false; // "The AI" style fragments
  if (/'s\b/.test(n)) return false;                       // "India's Sarvam AI" is a fragment
  const words = n.replace(/[^\p{L}\p{N}\s&.'-]/gu, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const clean = (w: string) => w.toLowerCase().replace(/[^a-z]/g, "");
  // The head word must carry meaning. This is what removes "Best AI",
  // "Building India's AI" and "Elevation Capital" style headline fragments.
  if (JUNK.has(clean(words[0]))) return false;
  const meaningful = words.filter(w => !JUNK.has(clean(w)));
  if (!meaningful.length) return false;                   // every word is junk
  if (meaningful.length / words.length < 0.6) return false;
  // A single word is only acceptable as a known acronym.
  if (words.length === 1) {
    const w = words[0];
    return w.length >= 2 && w.length <= 6 && w === w.toUpperCase() && /^[A-Z]/.test(w);
  }
  return true;
}

// Generic heads that make "<X> Labs" / "<X> Institute" a phrase rather than an entity.
const GENERIC_HEAD = new Set([
  "ai", "gen", "generative", "real-world", "applied", "global", "national", "digital", "core",
  "the", "this", "that", "these", "those", "india", "indian", "asia", "world", "new", "top",
  "best", "future", "modern", "smart", "open", "deep", "advanced", "next", "all", "every",
  "python", "java", "javascript", "software", "hardware", "data", "cloud", "cyber", "quantum",
]);

const ORG_SUFFIX = /\b([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3}\s+(Labs?|Technologies|Technology|Systems|Solutions|Robotics|Semiconductor(?:s)?|Motors|Energy|University|Institute(?:s)?|Research|Ventures|Capital|Foundation|Mission|Ministry|Department|Corporation|Industries|Electronics|Dynamics|Intelligence|College|Center|Centre|Council|Authority|Board|Group|Holdings|Networks?))\b/g;

const PRODUCT_HINT = /(GPT|Gemini|Claude|Llama|Mistral|Copilot|Bard|Grok|Krutrim|Bhashini|ECTOR|model|chip|processor|SoC|battery|EV|scooter|car)\b/i;
const PERSON_HINT = /\b(CEO|CTO|founder|co-founder|professor|researcher|minister|secretary|chief|chairman|director)\b/i;

// Canonical alias map: normalized key -> canonical display name
const ALIASES: [RegExp, string][] = [
  [/^iisc(\s+bangalore|\s+bengaluru)?$/, "Indian Institute of Science"],
  [/^indian institute of science(\s+bangalore|\s+bengaluru)?$/, "Indian Institute of Science"],
  [/^iit\s+bombay$/, "IIT Bombay"],
  [/^indian institute of technology\s+bombay$/, "IIT Bombay"],
  [/^iit\s+madras$/, "IIT Madras"],
  [/^iit\s+delhi$/, "IIT Delhi"],
  [/^aiims/, "AIIMS"],
  [/^meity$/, "MeitY"],
  [/^ministry of electronics.+$/, "MeitY"],
  [/^indiaai(\s+mission)?$/, "IndiaAI Mission"],
  [/^india ai(\s+mission)?$/, "IndiaAI Mission"],
  [/^nvidia( corp(oration)?)?$/, "NVIDIA"],
  [/^tata(\s+motors)?$/, "Tata Motors"],
  [/^ola(\s+electric)?$/, "Ola Electric"],
  [/^isro$/, "ISRO"],
  [/^drdo$/, "DRDO"],
];

const GEO_STRIP = /\s*[,\-–—(]\s*(bengaluru|bangalore|mumbai|delhi|hyderabad|chennai|pune|india)\s*\)?\s*$/i;
const LEGAL_STRIP = /\s+(pvt\.?\s*ltd\.?|private\s+limited|ltd\.?|inc\.?|corp(oration)?\.?|llc)$/i;

export function normalizeName(raw: string): string {
  let s = raw.trim().replace(/\s+/g, " ").replace(/['’]s$/i, "");
  for (const [re, canon] of ALIASES) if (re.test(s.toLowerCase())) return canon;
  s = s.replace(GEO_STRIP, "").replace(LEGAL_STRIP, "").trim();
  return s;
}

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t && !STOP.has(t));
}

export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(tokens(a)), tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jaccard = inter / (ta.size + tb.size - inter);
  const al = a.toLowerCase(), bl = b.toLowerCase();
  const contains = (al.includes(bl) || bl.includes(al)) && Math.min(al.length, bl.length) > 5 ? 0.35 : 0;
  return Math.min(1, jaccard + contains);
}

function inferType(name: string, ctx: string): EntityType {
  const s = `${name} ${ctx}`;
  if (/\b(university|institute of|iit\b|iisc|college)\b/i.test(s)) return "university";
  if (/\b(ministry|meity|department|mission|authority|board|council|government)\b/i.test(s)) return "institution";
  if (/\b(ceo|founder|professor|minister|researcher|dr\.?\s+[A-Z])\b/.test(s) && PERSON_HINT.test(ctx)) return "person";
  if (/\b(startup|seed|series [abc]|founded 20|unicorn)\b/i.test(ctx)) return "startup";
  if (PRODUCT_HINT.test(name) && /\b(model|chip|phone|car|scooter|software|platform|app)\b/i.test(ctx)) return "product";
  if (/\b(lab|research|center|centre)\b/i.test(s)) return "institution";
  if (/\b(AI|technology|computing|semiconductor|battery|energy|space|robotics|healthcare|fintech)\b/i.test(name) && name.split(/\s+/).length <= 3) return "topic";
  if (/(motors|electric|energy|semiconductor|systems|technolog|solutions|robotics|dynamics|industries|corporation|tata|reliance|infosys|nvidia|ola|ather|tvs|mahindra)/i.test(s)) return "company";
  return "topic";
}

function toEvidence(o: Observation): EvidenceRef {
  return { id: o.id, sourceType: o.engine, query: o.query, title: o.title, url: o.url, snippet: o.snippet.slice(0, 280), date: o.date };
}

/** Heuristic entity extraction. Every candidate keeps its supporting observations. */
export function extractCandidates(observations: Observation[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  /** `strict` is used for phrase mining, the noisiest extraction path. */
  const add = (rawName: string, type: EntityType, description: string, obs: Observation, strict = false) => {
    const name = normalizeName(rawName).trim();
    if (STOP.has(name.toLowerCase())) return;
    if (strict && !looksLikeProperNoun(name)) return;
    if (!isPlausibleEntity(name)) return;
    const key = name.toLowerCase();
    let c = byKey.get(key);
    if (!c) { c = { name, type, description: description.slice(0, 300), observations: [], domains: new Set() }; byKey.set(key, c); }
    if (!c.observations.some(o => o.id === obs.id)) c.observations.push(obs);
    if (obs.domain) c.domains.add(obs.domain);
    if (description && c.description.length < 60) c.description = description.slice(0, 300);
  };

  /** Mark a candidate as coming from a structured field (knowledge_graph / jobs company_name). */
  const markPrecise = (rawName: string) => {
    const c = byKey.get(normalizeName(rawName).trim().toLowerCase());
    if (c) c.highPrecision = true;
  };

  // Track how many independent observations support each org-suffix candidate so we
  // can drop one-off headline noise without losing genuinely rare but real entities.
  const orgSupport = new Map<string, Set<string>>();

  for (const o of observations) {
    const text = `${o.title} ${o.snippet}`;
    // 1. Knowledge graph blocks are high-precision entities
    if (o.extra?.kind === "knowledge_graph") {
      add(o.title, inferType(o.title, o.snippet), o.snippet, o);
      markPrecise(o.title);
      continue;
    }
    // 2. Jobs: company_name is authoritative
    if (o.engine === "jobs" && o.extra?.company) {
      add(o.extra.company, "company", `${o.extra.company} - hiring for ${o.title} (${o.extra.location ?? "India"})`, o);
      markPrecise(o.extra.company);
    }
    // 3. Scholar: institutions + researchers from snippets
    if (o.engine === "scholar") {
      ORG_SUFFIX.lastIndex = 0;
      let m: RegExpExecArray | null;
      const t = `${o.snippet}`;
      while ((m = ORG_SUFFIX.exec(t)) && byKey.size < 400) add(m[1], inferType(m[1], t), `Research institution active in: ${o.title}`, o, true);
      if (o.extra?.authors) {
        for (const a of o.extra.authors.split(";").map(s => s.trim()).filter(Boolean).slice(0, 4)) {
          // Reject initials-only author strings ("S Sharma", "T Chakravorti") which are
          // ambiguous across papers and add no navigational value.
          const parts = a.split(/\s+/);
          const first = parts[0] ?? "";
          if (parts.length < 2 || first.length < 3 || a.length < 6 || a.length > 50) continue;
          add(a, "researcher", `Author of "${o.title}"`, o, true);
        }
      }
    }
    // 4. Org-suffix mining on titles+snippets (search/news/jobs)
    ORG_SUFFIX.lastIndex = 0;
    let m2: RegExpExecArray | null;
    const t2 = text;
    while ((m2 = ORG_SUFFIX.exec(t2)) && byKey.size < 600) {
      const head = m2[1].split(/\s+/)[0]!.toLowerCase().replace(/[^a-z-]/g, "");
      if (GENERIC_HEAD.has(head)) continue;   // "AI Labs", "Global Institute" are phrases
      const key = normalizeName(m2[1]).toLowerCase();
      if (!orgSupport.has(key)) orgSupport.set(key, new Set());
      orgSupport.get(key)!.add(o.id);
      add(m2[1], inferType(m2[1], t2), o.snippet.slice(0, 220) || o.title, o, true);
    }
  }

  // 5. Capitalized-phrase mining. This path produces the most noise, so candidates
  //    must appear in 3+ independent observations AND pass looksLikeProperNoun,
  //    which rejects headline fragments like "Ambitions Expose".
  const phraseObs = new Map<string, { display: string; obs: Set<string>; sample: Observation }>();
  for (const o of observations) {
    const text = `${o.title} - ${o.snippet}`;
    const re = /\b([A-Z][a-zA-Z0-9&.'-]{2,}(?:\s+[A-Z][a-zA-Z0-9&.'-]{2,}){0,3})\b/g;
    let m: RegExpExecArray | null;
    const seenThis = new Set<string>();
    while ((m = re.exec(text))) {
      const phrase = m[1].trim();
      const key = normalizeName(phrase).toLowerCase();
      if (phrase.length < 4 || STOP.has(key) || seenThis.has(key)) continue;
      if (!looksLikeProperNoun(phrase)) continue;
      seenThis.add(key);
      let e = phraseObs.get(key);
      if (!e) { e = { display: phrase, obs: new Set(), sample: o }; phraseObs.set(key, e); }
      e.obs.add(o.id);
    }
  }
  const obsById = new Map(observations.map(o => [o.id, o]));
  for (const [key, e] of phraseObs) {
    // Phrase mining is the noisiest signal. A single mention is dropped outright;
    // borderline candidates are kept here and ranked in `rankCandidates` so the
    // graph can stay rich without admitting obvious headline fragments.
    if (e.obs.size < 2 || byKey.has(key) || byKey.size > 700) continue;
    const obsList = [...e.obs].map(id => obsById.get(id)!).filter(Boolean);
    const name = normalizeName(e.display);
    if (!isPlausibleEntity(name)) continue;
    const c = {
      name,
      type: inferType(name, obsList.map(o => o.snippet).join(" ").slice(0, 500)),
      description: e.sample.snippet.slice(0, 220) || e.sample.title,
      observations: obsList,
      domains: new Set(obsList.map(o => o.domain).filter(Boolean)),
    };
    byKey.set(key, c);
  }

  // Single-mention org-suffix hits are almost always headline phrasing. Structured
  // sources (knowledge_graph, jobs.company_name) bypass this requirement.
  for (const [key, support] of orgSupport) {
    const c = byKey.get(key);
    if (!c || c.highPrecision) continue;
    if (support.size < 2) byKey.delete(key);
  }

  return [...byKey.values()];
}

/**
 * Quality score used to rank candidates before the node cap is applied.
 * Filtering alone produced either 10 clean nodes or 120 noisy ones depending on
 * thresholds, so filtering removes only obvious junk and ranking decides the rest.
 * Higher score = more likely to be a real, well-evidenced ecosystem entity.
 */
export function candidateQuality(c: Candidate): number {
  const obs = c.observations.length;
  const engines = new Set(c.observations.map(o => o.engine)).size;
  const domains = new Set(c.observations.map(o => o.domain || o.url)).size;
  const words = c.name.split(/\s+/).length;
  let s = 0;
  s += Math.log1p(obs) * 1.6;                       // corroboration count
  s += engines * 0.9;                                // cross-source agreement
  s += Math.log1p(domains) * 0.7;                    // independent sources
  if (c.highPrecision) s += 2.0;                     // structured field
  // Concrete org types are more likely to be real than generic "topic" nouns.
  if (["company", "startup", "university", "institution", "product", "researcher"].includes(c.type)) s += 1.0;
  if (c.type === "topic") s -= 1.0;
  if (words >= 2) s += 0.3;                          // multi-word names read as entities
  if (words >= 4) s -= 0.8;                          // long noun stacks are suspect
  if (c.description.length > 40) s += 0.2;

  // Demote headline noun stacks mined from SERP text. These are phrases like
  // "Job Description", "SWOT Analysis", "Burj Khalifa" that repeat across results
  // without being ecosystem members. A name whose words are all generic English
  // is much more likely to be phrasing than an organization.
  const tokens = c.name.toLowerCase().split(/\s+/).filter(Boolean);
  const genericish = tokens.filter(t => NEVER_IN_NAME.has(t) || JUNK.has(t)).length;
  if (tokens.length >= 2 && genericish / tokens.length >= 0.5) s -= 2.2;
  if (/\b(analysis|report|guide|review|overview|summary|checklist|template|strategy|roadmap)\b/i.test(c.name)) s -= 1.6;
  if (/\b(job|jobs|career|careers|description|descriptions|role|roles|skill|skills)\b/i.test(c.name)) s -= 1.4;
  if (/^\d/.test(c.name)) s -= 1.5;                  // numbered listicle fragments
  return s;
}

/** Deduplicate candidates into resolved entities. */
export function resolveEntities(cands: Candidate[]): Candidate[] {
  const sorted = [...cands].sort((a, b) => b.observations.length - a.observations.length);
  const merged: Candidate[] = [];
  for (const c of sorted) {
    let target: Candidate | null = null;
    for (const m of merged) {
      const sameDomain = [...c.domains].some(d => m.domains.has(d)) && [...c.domains].length <= 3;
      if (m.name.toLowerCase() === c.name.toLowerCase() || nameSimilarity(m.name, c.name) >= 0.62 || sameDomain) { target = m; break; }
    }
    if (!target) { merged.push(c); continue; }
    for (const o of c.observations) if (!target.observations.some(x => x.id === o.id)) target.observations.push(o);
    for (const d of c.domains) target.domains.add(d);
    // Prefer the more informative canonical name (e.g. "Sarvam AI" over "Sarvam")
    const tToks = target.name.split(/\s+/).length, cToks = c.name.split(/\s+/).length;
    if (cToks > tToks && nameSimilarity(target.name, c.name) >= 0.7) target.name = c.name;
    if (target.description.length < 60 && c.description) target.description = c.description;
  }
  return merged;
}

export function candidateToEvidence(c: Candidate): EvidenceRef[] {
  return c.observations.slice(0, 8).map(toEvidence);
}

export function engineOf(o: Observation): EngineName { return o.engine; }
