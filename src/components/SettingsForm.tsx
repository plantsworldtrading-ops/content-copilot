"use client";

import { useState } from "react";
import { createTeamCode, readTeamCode } from "@/lib/browser/settings";
import type { Settings, StockProvider } from "@/lib/types";
import { useSettings } from "./AppProviders";
import ElevenLabsVoicePicker from "./ElevenLabsVoicePicker";
import { Button, Card, ErrorNote, Field, inputClass } from "./ui";

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2">
      <input
        type={show ? "text" : "password"}
        autoComplete="off"
        spellCheck={false}
        className={`${inputClass} font-mono`}
        placeholder={placeholder ?? "Paste key"}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
      />
      <Button type="button" variant="secondary" onClick={() => setShow((s) => !s)} className="w-16">
        {show ? "Hide" : "Show"}
      </Button>
    </div>
  );
}

function TeamCode({ settings, onImport }: { settings: Settings; onImport: (s: Settings) => void }) {
  const [passcode, setPasscode] = useState("");
  const [code, setCode] = useState("");
  const [incoming, setIncoming] = useState("");
  const [incomingPass, setIncomingPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function make() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const c = await createTeamCode(settings, passcode);
      setCode(c);
      await navigator.clipboard.writeText(c).then(
        () => setMessage("Team code copied. Send it to editors, and tell them the passcode separately."),
        () => setMessage("Team code created. Copy it below."),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const s = await readTeamCode(incoming, incomingPass);
      if (!confirm("Replace all settings in this browser with the team settings?")) return;
      onImport(s);
      setIncoming("");
      setIncomingPass("");
      setMessage("Team settings loaded.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-semibold">Team setup code</h2>
      <p className="mt-1 text-sm text-fg-soft">
        Set up keys once, then share them: the code is your settings encrypted with a passcode. Editors paste it here
        and they&apos;re ready to go.
      </p>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Share these settings</h3>
          <p className="-mt-2 text-xs text-fg-soft">Uses the last saved settings, so click Save settings first.</p>
          <Field label="Passcode (at least 6 characters)">
            <input
              type="password"
              className={inputClass}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Button type="button" variant="secondary" busy={busy} disabled={passcode.length < 6} onClick={make}>
            Create & copy team code
          </Button>
          {code && (
            <textarea readOnly className={`${inputClass} h-20 font-mono text-xs`} value={code} onFocus={(e) => e.target.select()} />
          )}
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Join with a team code</h3>
          <Field label="Team code">
            <textarea
              className={`${inputClass} h-20 font-mono text-xs`}
              value={incoming}
              onChange={(e) => setIncoming(e.target.value)}
              placeholder="CCTEAM1:…"
            />
          </Field>
          <Field label="Passcode">
            <input
              type="password"
              className={inputClass}
              value={incomingPass}
              onChange={(e) => setIncomingPass(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Button type="button" busy={busy} disabled={!incoming.trim() || !incomingPass} onClick={join}>
            Load team settings
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {message && <p className="text-sm text-ok">{message}</p>}
        <ErrorNote message={error} />
      </div>
    </Card>
  );
}

function Form({ initial, onSave }: { initial: Settings; onSave: (s: Settings) => void }) {
  const [s, setS] = useState<Settings>(initial);
  const [saved, setSaved] = useState(false);

  const update = (fn: (draft: Settings) => void) => {
    const next = structuredClone(s);
    fn(next);
    setS(next);
    setSaved(false);
  };
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const toggleProvider = (p: StockProvider, on: boolean) =>
    update((d) => {
      d.stock.providers = on ? [...new Set([...d.stock.providers, p])] : d.stock.providers.filter((x) => x !== p);
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(s);
        setSaved(true);
      }}
      className="flex flex-col gap-6"
    >
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
              <option value="openai">OpenAI-compatible (OpenAI, Groq, OpenRouter…)</option>
            </select>
          </Field>
          <div className="hidden sm:block" />
          {s.llm.provider === "gemini" ? (
            <>
              <Field label="Gemini API key" hint="Free key at aistudio.google.com/app/apikey">
                <SecretInput value={s.llm.gemini.apiKey} onChange={(v) => update((d) => void (d.llm.gemini.apiKey = v))} />
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
              <Field label="Base URL" hint="e.g. https://api.groq.com/openai/v1">
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
              <Field label="API key">
                <SecretInput value={s.llm.openai.apiKey} onChange={(v) => update((d) => void (d.llm.openai.apiKey = v))} />
              </Field>
            </>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">Stock footage</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Pexels API key" hint="Free at pexels.com/api">
            <SecretInput value={s.stock.pexelsApiKey} onChange={(v) => update((d) => void (d.stock.pexelsApiKey = v))} />
          </Field>
          <Field label="Pixabay API key" hint="Free at pixabay.com/api/docs">
            <SecretInput value={s.stock.pixabayApiKey} onChange={(v) => update((d) => void (d.stock.pixabayApiKey = v))} />
          </Field>
          <fieldset className="flex flex-col gap-1.5 text-sm">
            <legend className="mb-1.5 font-medium">Search on</legend>
            {(["pexels", "pixabay"] as StockProvider[]).map((p) => (
              <label key={p} className="flex items-center gap-2 capitalize">
                <input type="checkbox" checked={s.stock.providers.includes(p)} onChange={(e) => toggleProvider(p, e.target.checked)} />
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
        <h2 className="font-semibold">Voiceover</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Default voice service">
            <select
              className={inputClass}
              value={s.voice.provider}
              onChange={(e) => update((d) => void (d.voice.provider = e.target.value as Settings["voice"]["provider"]))}
            >
              <option value="edge">Microsoft Edge voices (free, for drafts)</option>
              <option value="elevenlabs">ElevenLabs (best quality)</option>
            </select>
          </Field>
          <div className="hidden sm:block" />
          <Field
            label="ElevenLabs API key"
            hint={
              <>
                elevenlabs.io → Developers → API keys. The free plan is for testing only: it isn&apos;t licensed for
                commercial videos. Starter or higher is.
              </>
            }
          >
            <SecretInput
              value={s.voice.elevenlabs.apiKey}
              onChange={(v) => update((d) => void (d.voice.elevenlabs.apiKey = v))}
            />
          </Field>
          <Field label="ElevenLabs model">
            <select
              className={inputClass}
              value={s.voice.elevenlabs.model}
              onChange={(e) => update((d) => void (d.voice.elevenlabs.model = e.target.value))}
            >
              <option value="eleven_multilingual_v2">Multilingual v2 (most natural)</option>
              <option value="eleven_flash_v2_5">Flash v2.5 (half the credits, slightly less natural)</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <ElevenLabsVoicePicker
              apiKey={s.voice.elevenlabs.apiKey}
              voiceId={s.voice.elevenlabs.voiceId}
              onPick={(id, name) =>
                update((d) => {
                  d.voice.elevenlabs.voiceId = id;
                  d.voice.elevenlabs.voiceName = name;
                })
              }
            />
          </div>
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

      <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-line bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <Button type="submit">Save settings</Button>
        {saved && <span className="text-sm text-ok">Saved in this browser</span>}
      </div>
    </form>
  );
}

export default function SettingsForm() {
  const [settings, setSettings] = useSettings();
  // Re-mount the form when settings are replaced from outside (team code, another tab).
  const [version, setVersion] = useState(0);
  if (!settings) return <p className="text-fg-soft">Loading settings…</p>;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-fg-soft">
          Saved only in this browser. Keys are sent to the app&apos;s server just to make each request, and are never
          stored there.
        </p>
      </div>
      <TeamCode
        settings={settings}
        onImport={(s) => {
          setSettings(s);
          setVersion((v) => v + 1);
        }}
      />
      <Form key={version} initial={settings} onSave={setSettings} />
    </div>
  );
}
