// TF-IDF embeddings + cosine similarity. Zero-dep, explainable, fast for <=150 entities.

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

export interface EmbeddingSet { vectors: number[][]; vocab: string[] }

export function tfidf(docs: string[]): EmbeddingSet {
  const toks = docs.map(tokenize);
  const df = new Map<string, number>();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  const vocab = [...df.keys()];
  const N = docs.length;
  const vectors = toks.map(t => {
    const tf = new Map<string, number>();
    for (const w of t) tf.set(w, (tf.get(w) ?? 0) + 1);
    return vocab.map(w => {
      const f = (tf.get(w) ?? 0) / Math.max(1, t.length);
      const idf = Math.log(1 + N / (1 + (df.get(w) ?? 0)));
      return f * idf;
    });
  });
  return { vectors, vocab };
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function similarityMatrix(vectors: number[][]): number[][] {
  return vectors.map((a, i) => vectors.map((b, j) => (i === j ? 1 : cosine(a, b))));
}
