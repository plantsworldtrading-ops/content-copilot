import "server-only";
import { HttpError } from "./http";
import type { LlmSettings } from "../types";

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/** fetch with a couple of backed-off retries for rate limits and "high demand" errors. */
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  for (let i = 1; ; i++) {
    const res = await fetch(url, init);
    if (!RETRYABLE.has(res.status) || i >= attempts) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, retryAfter > 0 ? Math.min(retryAfter, 20) * 1000 : 2000 * i));
  }
}

async function complete(llm: LlmSettings, system: string, prompt: string): Promise<string> {

  if (llm.provider === "gemini") {
    if (!llm.gemini.apiKey) throw new HttpError(400, "Add a Gemini API key in Settings first");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      llm.gemini.model,
    )}:generateContent`;
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": llm.gemini.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8 },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new HttpError(502, `Gemini error ${res.status}: ${data?.error?.message ?? res.statusText}`);
    }
    const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? "").join("").trim();
    if (!text) throw new HttpError(502, "Gemini returned an empty response");
    return text;
  }

  if (!llm.openai.apiKey && !/localhost|127\.0\.0\.1/.test(llm.openai.baseUrl)) {
    throw new HttpError(400, "Add an API key for the OpenAI-compatible provider in Settings first");
  }
  const res = await fetchWithRetry(`${llm.openai.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(llm.openai.apiKey ? { Authorization: `Bearer ${llm.openai.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: llm.openai.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new HttpError(502, `LLM error ${res.status}: ${data?.error?.message ?? res.statusText}`);
  }
  const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new HttpError(502, "The LLM returned an empty response");
  return text;
}

export async function generateScript(llm: LlmSettings, opts: {
  title: string;
  topic: string;
  language: string;
  targetSeconds: number;
}): Promise<string> {
  const words = Math.round(opts.targetSeconds * 2.5); // ~150 words per minute
  const system =
    "You write voiceover narration for short social videos. Output only the words to be spoken: " +
    "no title, no headings, no scene directions, no emojis, no hashtags, no markdown. " +
    "Separate paragraphs with a blank line.";
  const prompt = [
    `Video title: ${opts.title}`,
    `Topic / brief: ${opts.topic || opts.title}`,
    `Language: ${opts.language}`,
    `Length: about ${words} words (${opts.targetSeconds} seconds spoken).`,
    "Open with a hook in the first sentence, keep sentences short and concrete, end with a clear call to action.",
  ].join("\n");
  return (await complete(llm, system, prompt)).replace(/^```\w*\n?|```$/g, "").trim();
}

export async function generateKeywords(llm: LlmSettings, script: string, count: number): Promise<string[]> {
  const system =
    "You choose search terms for stock-footage sites like Pexels and Pixabay. " +
    "Respond with a JSON array of strings only.";
  const prompt = [
    `Give ${count} English search terms for stock video clips that illustrate this narration, in the order the ideas appear.`,
    "Rules:",
    "- Describe what is literally visible on camera (subject + action/setting), 2-5 words each.",
    "- Prefer terms that stock sites actually have footage for; avoid niche jargon that returns unrelated clips.",
    "- No duplicates, no abstract concepts.",
    "",
    "Narration:",
    script,
  ].join("\n");
  const raw = await complete(llm, system, prompt);
  const match = raw.match(/\[[\s\S]*\]/);
  let terms: unknown = [];
  try {
    terms = JSON.parse(match ? match[0] : raw);
  } catch {
    terms = raw.split("\n");
  }
  if (!Array.isArray(terms)) throw new HttpError(502, "Could not read keywords from the LLM response");
  const seen = new Set<string>();
  return terms
    .map((t) => String(t).replace(/^[\s\-*\d.)"]+|["\s]+$/g, "").trim())
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
    .slice(0, count);
}
