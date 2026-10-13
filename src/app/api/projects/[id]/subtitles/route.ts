import { promises as fs } from "fs";
import path from "path";
import { handle, readJson } from "@/lib/http";
import {
  FOLDERS,
  HttpError,
  STATE_DIR,
  projectPath,
  readProject,
  updateProject,
  writeProjectFile,
} from "@/lib/projects";
import { readSettings } from "@/lib/settings";
import { alignToScript, buildCues, toSrt, toVtt, wordCues } from "@/lib/subtitles";
import { writeEditorFiles } from "@/lib/export";
import type { WordTiming } from "@/lib/types";

export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/subtitles">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson<{ charsPerLine?: number; linesPerCue?: number; maxCueSeconds?: number }>(req);
    const { defaults } = await readSettings();
    const current = await readProject(id);
    if (!current.voiceover) throw new HttpError(400, "Generate the voiceover first");

    const raw = await fs
      .readFile(await projectPath(id, path.posix.join(STATE_DIR, "words.json")), "utf8")
      .catch(() => {
        throw new HttpError(409, "Word timings are missing; generate the voiceover again");
      });
    const words = alignToScript(current.voiceover.scriptSnapshot, JSON.parse(raw) as WordTiming[]);
    if (!words.length) throw new HttpError(502, "The voiceover has no word timings");

    const opts = {
      charsPerLine: Math.max(10, Math.min(80, Math.round(body.charsPerLine ?? defaults.charsPerLine))),
      linesPerCue: Math.max(1, Math.min(3, Math.round(body.linesPerCue ?? defaults.linesPerCue))),
      maxCueSeconds: Math.max(1, Math.min(10, Number(body.maxCueSeconds ?? defaults.maxCueSeconds))),
    };
    const cues = buildCues(words, opts);
    const files = {
      [path.posix.join(FOLDERS.subtitles, "subtitles.srt")]: toSrt(cues),
      [path.posix.join(FOLDERS.subtitles, "subtitles.vtt")]: toVtt(cues),
      [path.posix.join(FOLDERS.subtitles, "subtitles_word_by_word.srt")]: toSrt(wordCues(words)),
    };
    for (const [file, content] of Object.entries(files)) await writeProjectFile(id, file, content);

    const project = await updateProject(id, (p) => {
      p.subtitles = {
        ...opts,
        files: Object.keys(files),
        cueCount: cues.length,
        generatedAt: new Date().toISOString(),
      };
    });
    await writeEditorFiles(project);
    return { project, cues };
  });
}
