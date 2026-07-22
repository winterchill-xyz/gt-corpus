# gt-corpus

Run the [gt.winterchill.xyz](https://gt.winterchill.xyz) forum chat **entirely on your own
machine** — no accounts on our side, no infrastructure, just your own OpenRouter key.

The corpus is the **UK Tech Nation Visa Forum**
([discourse.tnvisaforum.org](https://discourse.tnvisaforum.org)): ~3,800 threads on the UK
Global Talent visa — endorsement criteria, evidence critiques, rejections & appeals, Stage 2,
timelines — chunked, embedded, and bundled as a single SQLite file
(`data/gt-corpus.sqlite`).

## Run it

```bash
git clone https://github.com/winterchill-xyz/gt-corpus.git
cd gt-corpus
npm install
cp .env.example .env.local        # add your OPENROUTER_API_KEY
npm run dev                        # open http://localhost:3000
```

That's it: a chat UI over the corpus. Every answer cites the forum threads it drew from,
with links back to the source discussions.

- **OPENROUTER_API_KEY** (required) — get one at
  [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys); you pay OpenRouter
  directly, a typical answer costs well under a cent on the default model
  (`google/gemini-3.5-flash`; change via `GT_MODEL`).
- **VOYAGE_API_KEY** (optional) — free tier at
  [dashboard.voyageai.com](https://dashboard.voyageai.com). Without it retrieval is
  full-text search (FTS5/BM25); with it, semantic vector search over the bundled
  `voyage-4-large` embeddings (noticeably better for conversational questions).

## Under the hood

One SQLite file, three tables: `topics` (metadata + canonical URLs), `chunks` (~12k
retrieval windows with embeddings as float16 blobs — brute-force cosine at this size is
milliseconds, no vector DB needed), an FTS5 index, and `meta` (model/dim/version/export
date). Build your own tools directly on it — embeddings decode with
`np.frombuffer(blob, dtype="<f2")` / a `Uint16Array` + half-float table.

## Data notes

- Threads are community experience, **not official policy and not legal advice** — verify
  against GOV.UK / official Tech Nation guidance before relying on anything.
- Content remains © its forum authors and is provided for personal and research use, with
  per-chunk links back to the source threads. Please don't republish it wholesale stripped
  of attribution.
- The corpus is regenerated from the live forum periodically; `meta.exported_at` is the
  snapshot date. Issues/requests → open an issue here or post on the forum.
