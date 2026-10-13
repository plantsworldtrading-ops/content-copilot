import { handle, HttpError, readJson } from "@/lib/server/http";
import { synthesize } from "@/lib/server/edge-tts";
import { synthesizeElevenLabs } from "@/lib/server/elevenlabs";
import type { VoiceoverResult, VoiceSettings } from "@/lib/types";

export const maxDuration = 120;

// Vercel caps function responses at 4.5 MB; leave room for the JSON around the audio.
const MAX_RESPONSE_AUDIO_BYTES = 3_200_000;

export async function POST(req: Request) {
  return handle(async () => {
    const { script, voice } = await readJson<{ script: string; voice: VoiceSettings }>(req);
    if (!script?.trim()) throw new HttpError(400, "Write or generate the script first");
    if (!voice) throw new HttpError(400, "Missing voice settings");

    const result =
      voice.provider === "elevenlabs"
        ? await synthesizeElevenLabs(script, voice.elevenlabs)
        : await synthesize({
            script,
            voice: voice.edgeVoice,
            ratePercent: Math.max(-50, Math.min(100, Number(voice.ratePercent) || 0)),
            pitchHz: Math.max(-50, Math.min(50, Number(voice.pitchHz) || 0)),
          });

    if (result.audio.length > MAX_RESPONSE_AUDIO_BYTES) {
      throw new HttpError(413, "The voiceover is too long for one request. Split the script into shorter videos.");
    }
    const body: VoiceoverResult = {
      audioBase64: result.audio.toString("base64"),
      words: result.words,
      durationSec: result.durationSec,
    };
    return body;
  });
}
