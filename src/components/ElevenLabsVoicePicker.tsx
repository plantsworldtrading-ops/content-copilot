"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button, ErrorNote, Field, inputClass } from "./ui";

interface Voice {
  id: string;
  name: string;
  label: string;
  previewUrl: string;
}

// Voice lists rarely change; keep them for the session per API key.
const cache = new Map<string, Voice[]>();

export default function ElevenLabsVoicePicker({
  apiKey,
  voiceId,
  onPick,
}: {
  apiKey: string;
  voiceId: string;
  onPick: (id: string, name: string) => void;
}) {
  const [voices, setVoices] = useState<Voice[] | null>(() => cache.get(apiKey) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await api<Voice[]>("/api/voices/elevenlabs", { body: { apiKey } });
      cache.set(apiKey, list);
      setVoices(list);
      if (!voiceId && list[0]) onPick(list[0].id, list[0].name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const selected = voices?.find((v) => v.id === voiceId);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field label="ElevenLabs voice">
            {voices ? (
              <select
                className={inputClass}
                value={voiceId}
                onChange={(e) => {
                  const v = voices.find((x) => x.id === e.target.value);
                  if (v) onPick(v.id, v.name);
                }}
              >
                {!selected && <option value={voiceId}>{voiceId ? "Saved voice" : "Choose a voice"}</option>}
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className={`${inputClass} text-fg-soft`}>{voiceId ? "Saved voice" : "Load voices to choose one"}</div>
            )}
          </Field>
        </div>
        <Button type="button" variant="secondary" busy={loading} disabled={!apiKey} onClick={load}>
          {voices ? "Reload voices" : "Load voices"}
        </Button>
        {selected?.previewUrl && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const a = audioRef.current;
              if (!a) return;
              a.src = selected.previewUrl;
              void a.play();
            }}
          >
            ▶ Preview
          </Button>
        )}
      </div>
      {!apiKey && <p className="text-xs text-fg-soft">Add an ElevenLabs API key to list voices.</p>}
      <audio ref={audioRef} className="hidden" />
      <ErrorNote message={error} />
    </div>
  );
}
