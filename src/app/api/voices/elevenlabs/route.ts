import { handle, readJson } from "@/lib/server/http";
import { listElevenLabsVoices } from "@/lib/server/elevenlabs";

export async function POST(req: Request) {
  return handle(async () => {
    const { apiKey } = await readJson<{ apiKey?: string }>(req);
    return listElevenLabsVoices(String(apiKey ?? "").trim());
  });
}
