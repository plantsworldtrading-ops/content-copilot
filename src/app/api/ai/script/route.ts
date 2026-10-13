import { handle, HttpError, readJson } from "@/lib/server/http";
import { generateScript } from "@/lib/server/llm";
import type { LlmSettings } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{
      llm: LlmSettings;
      title: string;
      topic: string;
      language: string;
      targetSeconds: number;
    }>(req);
    if (!body.llm) throw new HttpError(400, "Missing AI settings");
    if (!body.topic?.trim() && !body.title?.trim()) throw new HttpError(400, "Describe the video topic first");
    const script = await generateScript(body.llm, {
      title: String(body.title ?? ""),
      topic: String(body.topic ?? ""),
      language: String(body.language || "English"),
      targetSeconds: Math.max(10, Math.min(600, Number(body.targetSeconds) || 50)),
    });
    return { script };
  });
}
