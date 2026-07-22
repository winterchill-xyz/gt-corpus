// Minimal OpenRouter chat-completions call using the USER's own key (.env.local).

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const MODEL = () => process.env.GT_MODEL || "google/gemini-3.5-flash";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class OpenRouterError extends Error {}

export async function complete(messages: ChatMessage[], maxTokens = 3000): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new OpenRouterError(
      "OPENROUTER_API_KEY is not set — copy .env.example to .env.local and add your key (openrouter.ai/settings/keys).",
    );
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 120_000);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/winterchill-xyz/gt-corpus",
        "X-Title": "gt-corpus local",
      },
      body: JSON.stringify({ model: MODEL(), max_tokens: maxTokens, messages }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new OpenRouterError(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new OpenRouterError("OpenRouter returned an empty completion");
    }
    return content;
  } finally {
    clearTimeout(t);
  }
}
