import { NextResponse } from "next/server";
import { lexicalSearch, semanticSearch, type Passage } from "@/lib/corpus";
import { complete, MODEL, OpenRouterError, type ChatMessage } from "@/lib/openrouter";

// Local RAG chat: retrieve from the bundled corpus (semantic when VOYAGE_API_KEY
// is set, else FTS5), answer with the user's own OpenRouter key. No auth, no
// rate limiting — this app runs on YOUR machine with YOUR keys.
export const dynamic = "force-dynamic";

const KEEP = 10;

const SYSTEM_PROMPT = [
  "You are a local assistant answering questions about the UK Global Talent visa (digital",
  "technology route / Tech Nation endorsement), grounded in excerpts from the UK Tech Nation",
  "Visa Forum — real threads about endorsements, rejections, evidence, Stage 2, and life",
  "around the visa.",
  "",
  "Rules: prefer the excerpts and cite them inline as [1], [2] … using ONLY the numbers you",
  "were given. Community anecdotes are experiences, not official policy — say so when it",
  "matters. When the excerpts don't cover the question, say that plainly and answer from",
  "general knowledge with a clear caveat. Be concise and concrete. You are not an immigration",
  "adviser — for decisions that hinge on personal circumstances, recommend checking GOV.UK or",
  "a qualified adviser.",
].join("\n");

type Turn = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  let body: { question?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 4000) : "";
  if (question.length < 3) {
    return NextResponse.json({ error: "Ask a fuller question." }, { status: 400 });
  }
  const history: Turn[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (t: any): t is Turn =>
            t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string",
        )
        .slice(-6)
    : [];

  let passages: Passage[] | null = null;
  let mode: "semantic" | "lexical" = "lexical";
  try {
    passages = await semanticSearch(question, KEEP);
    if (passages) mode = "semantic";
    else passages = lexicalSearch(question, KEEP);
  } catch (e) {
    console.error("[chat] retrieval failed", e);
    passages = [];
  }

  const excerptBlock = passages.length
    ? "FORUM EXCERPTS:\n\n" +
      passages.map((p, i) => `[${i + 1}] ${p.title}\n${p.url}\n${p.content}`).join("\n\n---\n\n")
    : "FORUM EXCERPTS: none matched — answer from general knowledge with a caveat.";

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }) as ChatMessage),
    { role: "user", content: `${excerptBlock}\n\nQUESTION: ${question}` },
  ];

  try {
    const answer = await complete(messages);
    return NextResponse.json({
      answer: answer.trim(),
      sources: passages.map((p, i) => ({ n: i + 1, title: p.title, url: p.url })),
      mode,
      model: MODEL(),
    });
  } catch (e) {
    const msg = e instanceof OpenRouterError ? e.message : "Chat failed — check the server logs.";
    if (!(e instanceof OpenRouterError)) console.error("[chat]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
