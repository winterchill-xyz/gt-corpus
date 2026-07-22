import Database from "better-sqlite3";
import path from "node:path";

// Read-only access to the bundled corpus (data/gt-corpus.sqlite): FTS5 lexical
// search (zero-config default) and optional semantic search (Voyage query
// embedding + brute-force cosine over the bundled float16 vectors — ~12k rows,
// milliseconds). Everything is cached at module scope: the DB handle and, on
// first semantic query, the decoded embedding matrix (~50 MB fp32).

const DB_PATH = path.join(process.cwd(), "data", "gt-corpus.sqlite");
const PER_TOPIC_CAP = 2;
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

export type Passage = {
  title: string;
  url: string;
  content: string;
  score: number;
};

let _db: Database.Database | null = null;
function db(): Database.Database {
  if (!_db) _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  return _db;
}

export function meta(): Record<string, string> {
  const rows = db().prepare("select key, value from meta").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

type ChunkRow = { topic_id: number; title: string; url: string; content: string };

function capPerTopic<T extends { topic_id: number }>(rows: T[], topK: number): T[] {
  const perTopic = new Map<number, number>();
  const out: T[] = [];
  for (const r of rows) {
    const used = perTopic.get(r.topic_id) ?? 0;
    if (used >= PER_TOPIC_CAP) continue;
    perTopic.set(r.topic_id, used + 1);
    out.push(r);
    if (out.length >= topK) break;
  }
  return out;
}

// --- lexical (FTS5/BM25 — works with zero API keys) ---------------------------

export function lexicalSearch(query: string, topK: number): Passage[] {
  const tokens = query.match(/[A-Za-z0-9]+/g) ?? [];
  if (!tokens.length) return [];
  const match = tokens.map((t) => `"${t}"`).join(" OR ");
  const rows = db()
    .prepare(
      `select c.topic_id, c.title, c.url, c.content, bm25(chunks_fts) as rank
       from chunks_fts join chunks c on c.id = chunks_fts.rowid
       where chunks_fts match ? order by rank limit ?`,
    )
    .all(match, topK * 4) as (ChunkRow & { rank: number })[];
  return capPerTopic(rows, topK).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    score: Math.round(-r.rank * 1000) / 1000,
  }));
}

// --- semantic (Voyage query embed + cosine over the bundled vectors) ----------

// float16 -> float32 lookup table (65536 entries, built once).
let _half: Float32Array | null = null;
function halfTable(): Float32Array {
  if (_half) return _half;
  const t = new Float32Array(65536);
  for (let h = 0; h < 65536; h++) {
    const s = h & 0x8000 ? -1 : 1;
    const e = (h & 0x7c00) >> 10;
    const f = h & 0x03ff;
    if (e === 0) t[h] = s * Math.pow(2, -14) * (f / 1024);
    else if (e === 0x1f) t[h] = f ? NaN : s * Infinity;
    else t[h] = s * Math.pow(2, e - 15) * (1 + f / 1024);
  }
  _half = t;
  return t;
}

let _mat: Float32Array | null = null;
let _matRows: ChunkRow[] | null = null;
let _dim = 0;

function loadMatrix(): { mat: Float32Array; rows: ChunkRow[]; dim: number } {
  if (_mat && _matRows) return { mat: _mat, rows: _matRows, dim: _dim };
  const dim = Number(meta().embedding_dim);
  const raw = db()
    .prepare("select topic_id, title, url, content, embedding from chunks order by id")
    .all() as (ChunkRow & { embedding: Buffer })[];
  const half = halfTable();
  const mat = new Float32Array(raw.length * dim);
  const rows: ChunkRow[] = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const { embedding, ...row } = raw[i];
    rows[i] = row;
    const u16 = new Uint16Array(embedding.buffer, embedding.byteOffset, dim);
    let norm = 0;
    const off = i * dim;
    for (let j = 0; j < dim; j++) {
      const v = half[u16[j]];
      mat[off + j] = v;
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    for (let j = 0; j < dim; j++) mat[off + j] /= norm;
  }
  _mat = mat;
  _matRows = rows;
  _dim = dim;
  return { mat, rows, dim };
}

async function embedQuery(text: string, key: string): Promise<Float32Array | null> {
  const m = meta();
  try {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: [text.slice(0, 32000)],
        model: m.embedding_model,
        input_type: "query",
        output_dimension: Number(m.embedding_dim),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vec = data?.data?.[0]?.embedding;
    if (!Array.isArray(vec)) return null;
    const out = Float32Array.from(vec as number[]);
    let norm = 0;
    for (const v of out) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    for (let j = 0; j < out.length; j++) out[j] /= norm;
    return out;
  } catch {
    return null;
  }
}

/** Semantic search; null when no VOYAGE_API_KEY / the embed call fails (caller
 * falls back to lexical). */
export async function semanticSearch(query: string, topK: number): Promise<Passage[] | null> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) return null;
  const qv = await embedQuery(query, key);
  if (!qv) return null;

  const { mat, rows, dim } = loadMatrix();
  const n = rows.length;
  const scores = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const off = i * dim;
    for (let j = 0; j < dim; j++) s += mat[off + j] * qv[j];
    scores[i] = s;
  }
  const order = Array.from(scores.keys()).sort((a, b) => scores[b] - scores[a]);
  const candidates = order.slice(0, topK * 6).map((i) => ({ ...rows[i], score: scores[i] }));
  return capPerTopic(candidates, topK).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    score: Math.round(r.score * 10000) / 10000,
  }));
}
