import { handle, HttpError, readJson } from "@/lib/server/http";
import { generateKeywords } from "@/lib/server/llm";
import type { LlmSettings } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ llm: LlmSettings; script: string; count: number }>(req);
    if (!body.llm) throw new HttpError(400, "Missing AI settings");
    if (!body.script?.trim()) throw new HttpError(400, "Write or generate the script first");
    const count = Math.max(1, Math.min(30, Math.round(Number(body.count) || 8)));
    return { keywords: await generateKeywords(body.llm, body.script, count) };
  });
}
