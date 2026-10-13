import "server-only";
import path from "path";
import { FOLDERS, writeProjectFile } from "./projects";
import type { Project } from "./types";

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function readme(p: Project): string {
  const lines: string[] = [];
  lines.push(p.title, "=".repeat(p.title.length), "");
  lines.push(`Aspect ratio: ${p.aspect}`);
  if (p.voiceover) {
    lines.push(`Voiceover: ${formatDuration(p.voiceover.durationSec)} (${p.voiceover.voice})`);
  }
  lines.push(`Footage clips: ${p.footage.downloads.length}`, `Updated: ${p.updatedAt}`, "");

  lines.push("WHAT'S IN THIS FOLDER", "");
  lines.push(`  ${FOLDERS.script}/script.txt           The narration, exactly as spoken`);
  lines.push(`  ${FOLDERS.keywords}/keywords.txt       Search terms used for the footage`);
  lines.push(`  ${FOLDERS.footage}/NN_keyword/         Stock clips, grouped by keyword in script order`);
  lines.push(`  ${FOLDERS.footage}/credits.csv         Source page and creator for every clip`);
  lines.push(`  ${FOLDERS.voiceover}/voiceover.mp3     Narration audio (starts at 00:00:00)`);
  lines.push(`  ${FOLDERS.subtitles}/subtitles.srt     Captions timed to the voiceover`);
  lines.push(`  ${FOLDERS.subtitles}/subtitles.vtt     Same captions in WebVTT`);
  lines.push(`  ${FOLDERS.subtitles}/subtitles_word_by_word.srt   One word per caption, for animated captions`);
  lines.push("");

  lines.push("HOW TO EDIT", "");
  lines.push("1. Put voiceover.mp3 on the timeline at 00:00:00.");
  lines.push("2. Import subtitles.srt and place it at 00:00:00 so it lines up with the voiceover.");
  lines.push("3. Lay footage over the voiceover. Folders 01, 02, 03... follow the order of the script.");
  lines.push("");
  lines.push("The .srt files contain only text and timing, no styling. Font, size, colour,");
  lines.push("outline and position are all set in your editor and can be changed at any time:");
  lines.push("");
  lines.push("  Premiere Pro     File > Import the .srt -> drag to timeline as a caption track.");
  lines.push("                   Style it in the Properties / Essential Graphics panel; save as a");
  lines.push("                   Track Style to restyle every caption at once.");
  lines.push("  DaVinci Resolve  Import the .srt into the Media Pool -> drag onto the timeline.");
  lines.push("                   Select the subtitle track -> Inspector > Track > Style (applies to all).");
  lines.push("  Final Cut Pro    File > Import > Captions -> choose the .srt. Style in the Captions inspector.");
  lines.push("  CapCut           Text > Captions > Import captions (or drag the .srt in), then edit the style");
  lines.push("                   and apply it to all captions.");
  lines.push("");
  lines.push("FOOTAGE LICENCE", "");
  lines.push("Pexels and Pixabay clips are free to use commercially without attribution.");
  lines.push("credits.csv lists every source in case you want to credit creators.");
  lines.push("");
  return lines.join("\n");
}

/** (Re)write the human-facing files editors open: script, keywords, credits and README. */
export async function writeEditorFiles(p: Project): Promise<void> {
  await writeProjectFile(p.id, path.posix.join(FOLDERS.script, "script.txt"), p.script.trim() + "\n");
  await writeProjectFile(
    p.id,
    path.posix.join(FOLDERS.keywords, "keywords.txt"),
    p.keywords.map((k, i) => `${String(i + 1).padStart(2, "0")}  ${k}`).join("\n") + "\n",
  );
  if (p.footage.downloads.length) {
    const rows = [
      ["file", "keyword", "provider", "source_page", "creator", "creator_page", "duration_sec", "width", "height"],
      ...[...p.footage.downloads]
        .sort((a, b) => a.file.localeCompare(b.file))
        .map((d) => [
          path.posix.relative(FOLDERS.footage, d.file),
          d.keyword,
          d.provider,
          d.pageUrl,
          d.author,
          d.authorUrl,
          d.duration,
          d.width,
          d.height,
        ]),
    ];
    await writeProjectFile(
      p.id,
      path.posix.join(FOLDERS.footage, "credits.csv"),
      rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n",
    );
  }
  await writeProjectFile(p.id, "README.txt", readme(p));
}
