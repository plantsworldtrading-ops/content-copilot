import "server-only";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { HttpError } from "./http";
import type { WordTiming } from "../types";

// 48 kbit/s constant bitrate, so duration = bytes * 8 / 48000.
const FORMAT = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
const BYTES_PER_SECOND = 48_000 / 8;
const TICKS_PER_SECOND = 10_000_000; // Edge reports offsets in 100 ns units
const MAX_CHUNK_CHARS = 2000;

export interface VoiceInfo {
  name: string;
  locale: string;
  gender: string;
  label: string;
}

let voiceCache: VoiceInfo[] | null = null;

export async function listVoices(): Promise<VoiceInfo[]> {
  if (voiceCache) return voiceCache;
  const tts = new MsEdgeTTS();
  try {
    const voices = await tts.getVoices();
    voiceCache = voices
      .map((v) => ({
        name: v.ShortName,
        locale: v.Locale,
        gender: v.Gender,
        label: `${v.ShortName.split("-").slice(2).join("-").replace(/Neural$/, "")} · ${v.Gender} · ${(v as { LocaleName?: string }).LocaleName ?? v.Locale}`,
      }))
      .sort((a, b) => a.locale.localeCompare(b.locale) || a.name.localeCompare(b.name));
    return voiceCache;
  } finally {
    tts.close();
  }
}

/** Split narration into paragraph-sized chunks Edge TTS handles reliably. */
export function chunkScript(script: string): string[] {
  const chunks: string[] = [];
  for (const para of script.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim())) {
    if (!para) continue;
    if (para.length <= MAX_CHUNK_CHARS) {
      chunks.push(para);
      continue;
    }
    let current = "";
    for (const sentence of para.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [para]) {
      if (current && (current + sentence).length > MAX_CHUNK_CHARS) {
        chunks.push(current.trim());
        current = "";
      }
      current += sentence;
    }
    if (current.trim()) chunks.push(current.trim());
  }
  return chunks;
}

interface EdgeMetadata {
  Metadata: { Type: string; Data: { Offset: number; Duration: number; text: { Text: string } } }[];
}

export async function synthesize(opts: {
  script: string;
  voice: string;
  ratePercent: number;
  pitchHz: number;
}): Promise<{ audio: Buffer; words: WordTiming[]; durationSec: number }> {
  const chunks = chunkScript(opts.script);
  if (chunks.length === 0) throw new HttpError(400, "The script is empty");

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "content-copilot-tts-"));
  const tts = new MsEdgeTTS();
  const audioParts: Buffer[] = [];
  const words: WordTiming[] = [];
  let offset = 0;
  try {
    await tts.setMetadata(opts.voice, FORMAT, { wordBoundaryEnabled: true });
    const prosody = {
      rate: `${opts.ratePercent >= 0 ? "+" : ""}${Math.round(opts.ratePercent)}%`,
      pitch: `${opts.pitchHz >= 0 ? "+" : ""}${Math.round(opts.pitchHz)}Hz`,
    };
    for (const [i, chunk] of chunks.entries()) {
      const dir = path.join(workDir, String(i));
      await fs.mkdir(dir);
      const { audioFilePath, metadataFilePath } = await tts.toFile(dir, chunk, prosody);
      const audio = await fs.readFile(audioFilePath);
      if (audio.length === 0) throw new HttpError(502, `Edge TTS returned no audio for paragraph ${i + 1}`);
      audioParts.push(audio);

      if (metadataFilePath) {
        const meta = JSON.parse(await fs.readFile(metadataFilePath, "utf8")) as EdgeMetadata;
        for (const m of meta.Metadata ?? []) {
          if (m.Type !== "WordBoundary") continue;
          const start = offset + m.Data.Offset / TICKS_PER_SECOND;
          words.push({
            text: m.Data.text.Text,
            start,
            end: start + m.Data.Duration / TICKS_PER_SECOND,
          });
        }
      }
      offset += audio.length / BYTES_PER_SECOND;
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, `Voice generation failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    tts.close();
    await fs.rm(workDir, { recursive: true, force: true });
  }

  return { audio: Buffer.concat(audioParts), words, durationSec: offset };
}
