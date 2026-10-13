import { connection } from "next/server";
import { handle, readJson } from "@/lib/http";
import { applySettingsUpdate, publicSettings, readSettings, writeSettings } from "@/lib/settings";
import type { Settings } from "@/lib/types";

export async function GET() {
  await connection();
  return handle(async () => publicSettings(await readSettings()));
}

export async function PUT(req: Request) {
  return handle(async () => {
    const next = applySettingsUpdate(await readSettings(), await readJson<Settings>(req));
    await writeSettings(next);
    return publicSettings(next);
  });
}
