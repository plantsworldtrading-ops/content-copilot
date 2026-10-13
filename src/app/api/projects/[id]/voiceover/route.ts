import path from "path";
import { handle, readJson } from "@/lib/http";
import { FOLDERS, HttpError, STATE_DIR, readProject, updateProject, writeProjectFile } from "@/lib/projects";
import { readSettings } from "@/lib/settings";
import { synthesize } from "@/lib/tts";
import { writeEditorFiles } from "@/lib/export";

export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/voiceover">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson<{ voice?: string; ratePercent?: number; pitchHz?: number }>(req);
    const { defaults } = await readSettings();
    const current = await readProject(id);
    if (!current.script.trim()) throw new HttpError(400, "Write or generate the script first");

    const voice = body.voice || defaults.voice;
    const ratePercent = Math.max(-50, Math.min(100, Number(body.ratePercent ?? defaults.ratePercent) || 0));
    const pitchHz = Math.max(-50, Math.min(50, Number(body.pitchHz ?? defaults.pitchHz) || 0));
    const { audio, words, durationSec } = await synthesize({
      script: current.script,
      voice,
      ratePercent,
      pitchHz,
    });

    const file = path.posix.join(FOLDERS.voiceover, "voiceover.mp3");
    await writeProjectFile(id, file, audio);
    await writeProjectFile(id, path.posix.join(STATE_DIR, "words.json"), JSON.stringify(words));
    const project = await updateProject(id, (p) => {
      p.voiceover = {
        voice,
        ratePercent,
        pitchHz,
        file,
        durationSec,
        generatedAt: new Date().toISOString(),
        scriptSnapshot: current.script,
      };
    });
    await writeEditorFiles(project);
    return { project };
  });
}
