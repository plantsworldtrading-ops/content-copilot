"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Settings, StockProvider } from "@/lib/types";
import { Button, Card, ErrorNote, Field, inputClass } from "./ui";

function SecretInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const saved = value.startsWith("••••");
  return (
    <div className="flex gap-2">
      <input
        type="password"
        autoComplete="off"
        className={inputClass}
        placeholder={saved ? `Saved (${value})` : "Paste key"}
        value={saved ? "" : value}
        onChange={(e) => onChange(e.target.value)}
      />
      {saved && (
        <Button type="button" variant="secondary" onClick={() => onChange("")}>
          Clear
        </Button>
      )}
    </div>
  );
}

export default function SettingsForm() {
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Settings>("/api/settings")
      .then(setS)
      .catch((e) => setError(e.message));
  }, []);

  if (!s) return error ? <ErrorNote message={error} /> : <p className="text-fg-soft">Loading settings…</p>;

  // Small immutable updater: update((d) => { d.stock.clipsPerKeyword = 4 })
  const update = (fn: (draft: Settings) => void) => {
    const next = structuredClone(s);
    fn(next);
    setS(next);
    setSaved(false);
  };

  const toggleProvider = (p: StockProvider, on: boolean) =>
    update((d) => {
      d.stock.providers = on ? [...new Set([...d.stock.providers, p])] : d.stock.providers.filter((x) => x !== p);
    });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      setS(await api<Settings>("/api/settings", { method: "PUT", body: s }));
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-fg-soft">
          Keys are stored on this machine in <code className="font-mono">data/settings.json</code> and never sent to
          the browser in full.
        </p>
      </div>

      <Card>
        <h2 className="font-semibold">Script & keyword AI</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Provider">
            <select
              className={inputClass}
              value={s.llm.provider}
              onChange={(e) => update((d) => void (d.llm.provider = e.target.value as Settings["llm"]["provider"]))}
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI-compatible (OpenAI, Groq, OpenRouter, Ollama…)</option>
            </select>
          </Field>
          <div />
          {s.llm.provider === "gemini" ? (
            <>
              <Field label="Gemini API key" hint="Free key at aistudio.google.com/app/apikey">
                <SecretInput
                  value={s.llm.gemini.apiKey}
                  onChange={(v) => update((d) => void (d.llm.gemini.apiKey = v))}
                />
              </Field>
              <Field label="Model">
                <input
                  className={inputClass}
                  value={s.llm.gemini.model}
                  onChange={(e) => update((d) => void (d.llm.gemini.model = e.target.value))}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Base URL" hint="e.g. https://api.groq.com/openai/v1 or http://localhost:11434/v1">
                <input
                  className={inputClass}
                  value={s.llm.openai.baseUrl}
                  onChange={(e) => update((d) => void (d.llm.openai.baseUrl = e.target.value))}
                />
              </Field>
              <Field label="Model">
                <input
                  className={inputClass}
                  value={s.llm.openai.model}
                  onChange={(e) => update((d) => void (d.llm.openai.model = e.target.value))}
                />
              </Field>
              <Field label="API key" hint="Leave empty for a local Ollama server">
                <SecretInput
                  value={s.llm.openai.apiKey}
                  onChange={(v) => update((d) => void (d.llm.openai.apiKey = v))}
                />
              </Field>
            </>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">Stock footage</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Pexels API key" hint="Free at pexels.com/api">
            <SecretInput
              value={s.stock.pexelsApiKey}
              onChange={(v) => update((d) => void (d.stock.pexelsApiKey = v))}
            />
          </Field>
          <Field label="Pixabay API key" hint="Free at pixabay.com/api/docs">
            <SecretInput
              value={s.stock.pixabayApiKey}
              onChange={(v) => update((d) => void (d.stock.pixabayApiKey = v))}
            />
          </Field>
          <fieldset className="flex flex-col gap-1.5 text-sm">
            <legend className="mb-1.5 font-medium">Search on</legend>
            {(["pexels", "pixabay"] as StockProvider[]).map((p) => (
              <label key={p} className="flex items-center gap-2 capitalize">
                <input
                  type="checkbox"
                  checked={s.stock.providers.includes(p)}
                  onChange={(e) => toggleProvider(p, e.target.checked)}
                />
                {p}
              </label>
            ))}
          </fieldset>
          <Field label="Download quality" hint="Smallest file that reaches this resolution">
            <select
              className={inputClass}
              value={s.stock.quality}
              onChange={(e) => update((d) => void (d.stock.quality = e.target.value as Settings["stock"]["quality"]))}
            >
              <option value="720p">720p (small files)</option>
              <option value="1080p">1080p (recommended)</option>
              <option value="4k">4K (large files)</option>
            </select>
          </Field>
          <Field label="Clips per keyword">
            <input
              type="number"
              min={1}
              max={20}
              className={inputClass}
              value={s.stock.clipsPerKeyword}
              onChange={(e) => update((d) => void (d.stock.clipsPerKeyword = num(e.target.value)))}
            />
          </Field>
          <Field label="Minimum clip length (seconds)">
            <input
              type="number"
              min={1}
              max={60}
              className={inputClass}
              value={s.stock.minClipSeconds}
              onChange={(e) => update((d) => void (d.stock.minClipSeconds = num(e.target.value)))}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">Defaults for new projects</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Aspect ratio">
            <select
              className={inputClass}
              value={s.defaults.aspect}
              onChange={(e) => update((d) => void (d.defaults.aspect = e.target.value as Settings["defaults"]["aspect"]))}
            >
              <option value="9:16">9:16 vertical (Reels, Shorts, TikTok)</option>
              <option value="16:9">16:9 landscape (YouTube)</option>
              <option value="1:1">1:1 square</option>
            </select>
          </Field>
          <Field label="Script language">
            <input
              className={inputClass}
              value={s.defaults.language}
              onChange={(e) => update((d) => void (d.defaults.language = e.target.value))}
            />
          </Field>
          <Field label="Target length (seconds)">
            <input
              type="number"
              min={10}
              max={600}
              className={inputClass}
              value={s.defaults.targetSeconds}
              onChange={(e) => update((d) => void (d.defaults.targetSeconds = num(e.target.value)))}
            />
          </Field>
          <Field label="Keywords to generate">
            <input
              type="number"
              min={1}
              max={30}
              className={inputClass}
              value={s.defaults.keywordCount}
              onChange={(e) => update((d) => void (d.defaults.keywordCount = num(e.target.value)))}
            />
          </Field>
          <Field label="Voice" hint="Edge voice name, e.g. en-US-AndrewNeural">
            <input
              className={inputClass}
              value={s.defaults.voice}
              onChange={(e) => update((d) => void (d.defaults.voice = e.target.value))}
            />
          </Field>
          <Field label="Subtitle characters per line">
            <input
              type="number"
              min={10}
              max={80}
              className={inputClass}
              value={s.defaults.charsPerLine}
              onChange={(e) => update((d) => void (d.defaults.charsPerLine = num(e.target.value)))}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">Storage</h2>
        <div className="mt-4">
          <Field label="Projects folder" hint="Each project gets a sub-folder named after its title.">
            <input
              className={`${inputClass} font-mono`}
              value={s.projectsDir}
              onChange={(e) => update((d) => void (d.projectsDir = e.target.value))}
            />
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" busy={saving}>
          Save settings
        </Button>
        {saved && <span className="text-sm text-ok">Saved</span>}
      </div>
      <ErrorNote message={error} />
    </form>
  );
}
