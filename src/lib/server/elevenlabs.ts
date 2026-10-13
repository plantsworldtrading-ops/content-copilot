import "server-only";
import { HttpError } from "./http";
import { chunkScript } from "./edge-tts";
import type { ElevenLabsSettings, WordTiming } from "../types";

const API = "https://api.elevenlabs.io";
// 64 kbit/s constant bitrate keeps the JSON response small (~0.5 MB per minute).
const OUTPUT_FORMAT = "mp3_44100_64";
const BYTES_PER_SECOND = 64_000 / 8;
const MAX_REQUEST_CHARS = 4500;

export interface ElevenLabsVoice {
  id: string;
  name: string;
  label: string;
  previewUrl: string;
}

async function elevenlabsError(res: Response): Promise<HttpError> {
  const data = await res.json().catch(() => ({}));
  const detail = data?.detail;
  const message =
    typeof detail === "string" ? detail : detail?.message ?? (Array.isArray(detail) ? detail[0]?.msg : res.statusText);
  if (res.status === 401) return new HttpError(401, `ElevenLabs rejected the API key: ${message}`);
  return new HttpError(502, `ElevenLabs error ${res.status}: ${message}`);
}

export async function listElevenLabsVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
  if (!apiKey) throw new HttpError(400, "Add an ElevenLabs API key in Settings first");
  const voices: ElevenLabsVoice[] = [];
  let token: string | null = null;
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({ page_size: "100", include_total_count: "false" });
    if (token) params.set("next_page_token", token);
    const res = await fetch(`${API}/v2/voices?${params}`, { headers: { "xi-api-key": apiKey } });
    if (!res.ok) throw await elevenlabsError(res);
    const data = await res.json();
    for (const v of data.voices ?? []) {
      const labels = Object.values((v.labels ?? {}) as Record<string, string>).filter(Boolean);
      voices.push({
        id: v.voice_id,
        name: v.name,
        label: [v.name, ...labels.slice(0, 3)].join(" · "),
        previewUrl: v.preview_url ?? "",
      });
    }
    if (!data.has_more || !data.next_page_token) break;
    token = data.next_page_token;
  }
  return voices.sort((a, b) => a.name.localeCompare(b.name));
}

/** Group ElevenLabs character timings into word timings. */
function charsToWords(chars: string[], starts: number[], ends: number[], offset: number): WordTiming[] {
  const words: WordTiming[] = [];
  let current: WordTiming | null = null;
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (current) words.push(current);
      current = null;
      return;
    }
    if (!current) current = { text: "", start: offset + starts[i], end: offset + ends[i] };
    current.text += ch;
    current.end = offset + ends[i];
  });
  if (current) words.push(current);
  return words;
}

/** Split long scripts into requests ElevenLabs accepts, keeping paragraph boundaries. */
function requestChunks(script: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const para of chunkScript(script)) {
    if (current && current.length + para.length + 2 > MAX_REQUEST_CHARS) {
      out.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${para}` : para;
  }
  if (current) out.push(current);
  return out;
}

export async function synthesizeElevenLabs(
  script: string,
  s: ElevenLabsSettings,
): Promise<{ audio: Buffer; words: WordTiming[]; durationSec: number }> {
  if (!s.apiKey) throw new HttpError(400, "Add an ElevenLabs API key in Settings first");
  if (!s.voiceId) throw new HttpError(400, "Pick an ElevenLabs voice first");
  const chunks = requestChunks(script);
  if (!chunks.length) throw new HttpError(400, "The script is empty");

  const audioParts: Buffer[] = [];
  const words: WordTiming[] = [];
  let offset = 0;
  for (const [i, text] of chunks.entries()) {
    const res = await fetch(
      `${API}/v1/text-to-speech/${encodeURIComponent(s.voiceId)}/with-timestamps?output_format=${OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: { "xi-api-key": s.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: s.model,
          voice_settings: {
            stability: s.stability,
            similarity_boost: s.similarity,
            speed: s.speed,
          },
          // Keeps intonation continuous across chunk boundaries.
          ...(i > 0 ? { previous_text: chunks[i - 1].slice(-500) } : {}),
          ...(i < chunks.length - 1 ? { next_text: chunks[i + 1].slice(0, 500) } : {}),
        }),
      },
    );
    if (!res.ok) throw await elevenlabsError(res);
    const data = await res.json();
    const audio = Buffer.from(String(data.audio_base64 ?? ""), "base64");
    if (!audio.length) throw new HttpError(502, "ElevenLabs returned no audio");
    audioParts.push(audio);

    const a = data.alignment ?? data.normalized_alignment;
    if (a?.characters) {
      words.push(
        ...charsToWords(a.characters, a.character_start_times_seconds, a.character_end_times_seconds, offset),
      );
    }
    offset += audio.length / BYTES_PER_SECOND;
  }
  return { audio: Buffer.concat(audioParts), words, durationSec: offset };
}
