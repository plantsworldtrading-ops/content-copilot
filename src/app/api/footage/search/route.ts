import { handle, HttpError, readJson } from "@/lib/server/http";
import { searchFootage } from "@/lib/server/stock";
import type { Aspect, StockSettings } from "@/lib/types";

export const maxDuration = 60;

const ASPECTS: Aspect[] = ["9:16", "16:9", "1:1"];

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ stock: StockSettings; keywords: string[]; aspect: Aspect }>(req);
    if (!body.stock) throw new HttpError(400, "Missing stock footage settings");
    if (!ASPECTS.includes(body.aspect)) throw new HttpError(400, "Unsupported aspect ratio");
    const keywords = (body.keywords ?? []).map((k) => String(k).trim()).filter(Boolean).slice(0, 30);
    if (!keywords.length) throw new HttpError(400, "Add keywords first");
    const stock: StockSettings = {
      ...body.stock,
      clipsPerKeyword: Math.max(1, Math.min(20, Number(body.stock.clipsPerKeyword) || 6)),
      minClipSeconds: Math.max(1, Math.min(60, Number(body.stock.minClipSeconds) || 4)),
    };
    return searchFootage(keywords, body.aspect, stock);
  });
}
