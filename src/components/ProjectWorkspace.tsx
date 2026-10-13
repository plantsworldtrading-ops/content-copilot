"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { readProject, readProjectFile, saveProject, writeProjectFile, type Workspace } from "@/lib/browser/workspace";
import { exportProjectZip } from "@/lib/browser/zip";
import { alignToScript, buildCues, toSrt, toVtt, wordCues, type Cue } from "@/lib/subtitles";
import { FOLDERS, STATE_DIR } from "@/lib/types";
import type { Aspect, Project, Settings, VoiceoverResult, VoiceSettings, WordTiming } from "@/lib/types";
import { useSettings } from "./AppProviders";
import ElevenLabsVoicePicker from "./ElevenLabsVoicePicker";
import FootageStep from "./FootageStep";
import WorkspaceGate from "./WorkspaceGate";
import { Button, Card, ErrorNote, Field, StepBadge, inputClass } from "./ui";

interface EdgeVoice {
  name: string;
  locale: string;
  gender: string;
  label: string;
}

const WORDS_PER_SECOND = 2.5;
const VOICE_FILE = `${FOLDERS.voiceover}/voiceover.mp3`;
const WORDS_FILE = `${STATE_DIR}/words.json`;

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function StepHeader({ n, done, title, children }: { n: number; done: boolean; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <StepBadge n={n} done={done} />
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold leading-7">{title}</h2>
        {children && <p className="text-sm text-fg-soft">{children}</p>}
      </div>
    </div>
  );
}

function Editor({ workspace, id, settings }: { workspace: Workspace; id: string; settings: Settings }) {
  const root = workspace.root;
  const [project, setProject] = useState<Project | null>(null);
  const projectRef = useRef<Project | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable drafts; saved before any step that depends on them.
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [language, setLanguage] = useState("");
  const [targetSeconds, setTargetSeconds] = useState(50);
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [keywordCount, setKeywordCount] = useState(settings.defaults.keywordCount);

  const [voice, setVoice] = useState<VoiceSettings>(settings.voice);
  const [edgeVoices, setEdgeVoices] = useState<EdgeVoice[]>([]);
  const [voiceFilter, setVoiceFilter] = useState("en-");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const [charsPerLine, setCharsPerLine] = useState(settings.defaults.charsPerLine);
  const [linesPerCue, setLinesPerCue] = useState(settings.defaults.linesPerCue);
  const [maxCueSeconds, setMaxCueSeconds] = useState(settings.defaults.maxCueSeconds);
  const [cues, setCues] = useState<Cue[] | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [zipNote, setZipNote] = useState<string | null>(null);

  useEffect(() => {
    readProject(root, id)
      .then((p) => {
        projectRef.current = p;
        setProject(p);
        setTopic(p.topic);
        setScript(p.script);
        setKeywordsText(p.keywords.join("\n"));
        setLanguage(p.language);
        setTargetSeconds(p.targetSeconds);
        setAspect(p.aspect);
        if (p.subtitles) {
          setCharsPerLine(p.subtitles.charsPerLine);
          setLinesPerCue(p.subtitles.linesPerCue);
          setMaxCueSeconds(p.subtitles.maxCueSeconds);
        }
      })
      .catch((e) => setLoadError(e.message));
    api<EdgeVoice[]>("/api/voices/edge")
      .then(setEdgeVoices)
      .catch(() => setEdgeVoices([]));
  }, [root, id]);

  // Play the saved voiceover from the local folder.
  const voiceGeneratedAt = project?.voiceover?.generatedAt;
  useEffect(() => {
    if (!voiceGeneratedAt) return;
    let url: string | null = null;
    let cancelled = false;
    readProjectFile(root, id, VOICE_FILE)
      .then((file) => {
        if (cancelled) return;
        url = URL.createObjectURL(file);
        setAudioUrl(url);
      })
      .catch(() => setAudioUrl(null));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [root, id, voiceGeneratedAt]);

  /** Apply a change to the project, show it, and write it to the folder (queued). */
  const commit = useCallback(
    async (mutate: (p: Project) => void): Promise<Project> => {
      const current = projectRef.current;
      if (!current) throw new Error("Project not loaded");
      const next = structuredClone(current);
      mutate(next);
      next.updatedAt = new Date().toISOString();
      projectRef.current = next;
      setProject(next);
      await saveProject(root, next);
      return next;
    },
    [root],
  );

  const keywords = useMemo(() => keywordsText.split("\n").map((k) => k.trim()).filter(Boolean), [keywordsText]);

  const dirty =
    !!project &&
    (topic !== project.topic ||
      script !== project.script ||
      keywords.join("\n") !== project.keywords.join("\n") ||
      language !== project.language ||
      targetSeconds !== project.targetSeconds ||
      aspect !== project.aspect);

  async function save(): Promise<Project> {
    if (!dirty && projectRef.current) return projectRef.current;
    return commit((p) => {
      p.topic = topic;
      p.script = script;
      p.keywords = keywords;
      p.language = language.trim() || p.language;
      p.targetSeconds = Math.max(10, Math.min(600, Math.round(targetSeconds) || 50));
      p.aspect = aspect;
    });
  }

  async function run(step: string, fn: () => Promise<void>) {
    setBusy(step);
    setErrors((e) => ({ ...e, [step]: null }));
    try {
      await fn();
    } catch (err) {
      setErrors((e) => ({ ...e, [step]: (err as Error).message }));
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-3">
        <ErrorNote message={loadError} />
        <Link href="/" className="text-sm text-accent underline">
          Back to projects
        </Link>
      </div>
    );
  }
  if (!project) return <p className="text-fg-soft">Loading project…</p>;

  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const voiceStale = !!project.voiceover && project.voiceover.scriptSnapshot !== project.script;
  const subsStale =
    !!project.subtitles && !!project.voiceover && project.subtitles.generatedAt < project.voiceover.generatedAt;
  const filteredVoices = edgeVoices.filter(
    (v) => !voiceFilter || `${v.name} ${v.label}`.toLowerCase().includes(voiceFilter.toLowerCase()),
  );
  const llmReady =
    settings.llm.provider === "gemini" ? !!settings.llm.gemini.apiKey : !!settings.llm.openai.baseUrl;
  const location = workspace.mode === "folder" ? `${workspace.name}/${project.id}` : "this browser";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href="/" className="text-sm text-fg-soft hover:text-fg">
            ← Projects
          </Link>
          <h1 className="mt-1 truncate text-2xl font-semibold">{project.title}</h1>
          <p className="truncate font-mono text-xs text-fg-soft">Saved in {location}</p>
        </div>
        {dirty && (
          <Button variant="secondary" busy={busy === "save"} onClick={() => run("save", async () => void (await save()))}>
            Save changes
          </Button>
        )}
      </div>
      <ErrorNote message={errors.save} />
      {!llmReady && (
        <p className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
          No AI key yet. You can still type the script and keywords yourself, or{" "}
          <Link href="/settings" className="underline">
            add a key in Settings
          </Link>
          .
        </p>
      )}

      {/* 1. Script */}
      <Card>
        <StepHeader n={1} done={!!project.script.trim()} title="Script">
          Describe the video and let the AI draft it, or paste your own. Edit freely either way.
        </StepHeader>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto]">
          <Field label="Topic / brief">
            <textarea
              className={`${inputClass} min-h-20`}
              placeholder="What the video is about, who it's for, the call to action…"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </Field>
          <Field label="Language">
            <input className={`${inputClass} sm:w-32`} value={language} onChange={(e) => setLanguage(e.target.value)} />
          </Field>
          <Field label="Length (sec)">
            <input
              type="number"
              min={10}
              max={600}
              className={`${inputClass} sm:w-24`}
              value={targetSeconds}
              onChange={(e) => setTargetSeconds(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Aspect">
            <select className={`${inputClass} sm:w-28`} value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)}>
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
            </select>
          </Field>
        </div>
        <div className="mt-3">
          <Button
            variant="secondary"
            busy={busy === "script"}
            disabled={!!busy || !llmReady}
            onClick={() =>
              run("script", async () => {
                if (script.trim() && !confirm("Replace the current script with a new AI draft?")) return;
                const p = await save();
                const { script: text } = await api<{ script: string }>("/api/ai/script", {
                  body: {
                    llm: settings.llm,
                    title: p.title,
                    topic: p.topic,
                    language: p.language,
                    targetSeconds: p.targetSeconds,
                  },
                });
                await commit((d) => void (d.script = text));
                setScript(text);
              })
            }
          >
            Generate script with AI
          </Button>
        </div>
        <div className="mt-4">
          <Field
            label="Script"
            hint={`${wordCount} words · about ${fmt(wordCount / WORDS_PER_SECOND)} spoken. Blank lines separate paragraphs.`}
          >
            <textarea
              className={`${inputClass} min-h-56 leading-relaxed`}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Paste or write the narration here…"
            />
          </Field>
        </div>
        <ErrorNote message={errors.script} />
      </Card>

      {/* 2. Keywords */}
      <Card>
        <StepHeader n={2} done={project.keywords.length > 0} title="Keywords">
          One stock-footage search per line, in script order. Concrete, visible things work best.
        </StepHeader>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="How many">
            <input
              type="number"
              min={1}
              max={30}
              className={`${inputClass} w-24`}
              value={keywordCount}
              onChange={(e) => setKeywordCount(Number(e.target.value) || 1)}
            />
          </Field>
          <Button
            variant="secondary"
            busy={busy === "keywords"}
            disabled={!!busy || !script.trim() || !llmReady}
            onClick={() =>
              run("keywords", async () => {
                if (keywords.length && !confirm("Replace the current keywords?")) return;
                const p = await save();
                const res = await api<{ keywords: string[] }>("/api/ai/keywords", {
                  body: { llm: settings.llm, script: p.script, count: keywordCount },
                });
                await commit((d) => void (d.keywords = res.keywords));
                setKeywordsText(res.keywords.join("\n"));
              })
            }
          >
            Generate keywords from script
          </Button>
        </div>
        <div className="mt-4">
          <Field label="Keywords" hint={`${keywords.length} keywords`}>
            <textarea
              className={`${inputClass} min-h-40 font-mono`}
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder={"white bugs on plant leaf\nyellowing houseplant leaves\nspraying houseplant"}
            />
          </Field>
        </div>
        <ErrorNote message={errors.keywords} />
      </Card>

      {/* 3. Footage */}
      <FootageStep
        project={project}
        settings={settings}
        root={root}
        disabled={!!busy}
        onBeforeSearch={save}
        commit={commit}
        header={
          <StepHeader n={3} done={project.footage.downloads.length > 0} title="Footage">
            Search every keyword, untick clips you don&apos;t want, then download. Clips go straight from the stock site
            into <code className="font-mono">03_footage/NN_keyword/</code> on this computer.
          </StepHeader>
        }
      />

      {/* 4. Voiceover */}
      <Card>
        <StepHeader n={4} done={!!project.voiceover} title="Voiceover">
          Word timings are captured with the audio so the subtitles line up exactly.
        </StepHeader>
        <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Voice service">
          {(
            [
              ["edge", "Edge voices (free)"],
              ["elevenlabs", "ElevenLabs"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={voice.provider === value}
              onClick={() => setVoice((v) => ({ ...v, provider: value }))}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                voice.provider === value ? "border-accent bg-accent/10 text-fg" : "border-line text-fg-soft hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {voice.provider === "edge" ? (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <Field label="Filter voices">
              <input
                className={inputClass}
                value={voiceFilter}
                onChange={(e) => setVoiceFilter(e.target.value)}
                placeholder="en-US, female, Andrew…"
              />
            </Field>
            <Field label={`Voice (${filteredVoices.length})`}>
              <select
                className={inputClass}
                value={voice.edgeVoice}
                onChange={(e) => setVoice((v) => ({ ...v, edgeVoice: e.target.value }))}
              >
                {!filteredVoices.some((v) => v.name === voice.edgeVoice) && (
                  <option value={voice.edgeVoice}>{voice.edgeVoice}</option>
                )}
                {filteredVoices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} — {v.gender}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Speed ${voice.ratePercent > 0 ? "+" : ""}${voice.ratePercent}%`}>
              <input
                type="range"
                min={-50}
                max={50}
                step={5}
                value={voice.ratePercent}
                onChange={(e) => setVoice((v) => ({ ...v, ratePercent: Number(e.target.value) }))}
              />
            </Field>
            <Field label={`Pitch ${voice.pitchHz > 0 ? "+" : ""}${voice.pitchHz} Hz`}>
              <input
                type="range"
                min={-20}
                max={20}
                step={1}
                value={voice.pitchHz}
                onChange={(e) => setVoice((v) => ({ ...v, pitchHz: Number(e.target.value) }))}
              />
            </Field>
            <p className="text-xs text-fg-soft sm:col-span-2">
              Edge voices are great for drafts. For published videos, ElevenLabs (paid plan) gives commercial rights.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {!settings.voice.elevenlabs.apiKey && (
              <p className="text-sm text-warn">
                Add your ElevenLabs API key in{" "}
                <Link href="/settings" className="underline">
                  Settings
                </Link>{" "}
                first.
              </p>
            )}
            <ElevenLabsVoicePicker
              apiKey={settings.voice.elevenlabs.apiKey}
              voiceId={voice.elevenlabs.voiceId}
              onPick={(voiceId, voiceName) =>
                setVoice((v) => ({ ...v, elevenlabs: { ...v.elevenlabs, voiceId, voiceName } }))
              }
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={`Speed ${voice.elevenlabs.speed.toFixed(2)}×`}>
                <input
                  type="range"
                  min={0.7}
                  max={1.2}
                  step={0.05}
                  value={voice.elevenlabs.speed}
                  onChange={(e) =>
                    setVoice((v) => ({ ...v, elevenlabs: { ...v.elevenlabs, speed: Number(e.target.value) } }))
                  }
                />
              </Field>
              <Field label={`Stability ${voice.elevenlabs.stability.toFixed(2)}`} hint="Lower = more expressive">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={voice.elevenlabs.stability}
                  onChange={(e) =>
                    setVoice((v) => ({ ...v, elevenlabs: { ...v.elevenlabs, stability: Number(e.target.value) } }))
                  }
                />
              </Field>
              <Field label={`Similarity ${voice.elevenlabs.similarity.toFixed(2)}`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={voice.elevenlabs.similarity}
                  onChange={(e) =>
                    setVoice((v) => ({ ...v, elevenlabs: { ...v.elevenlabs, similarity: Number(e.target.value) } }))
                  }
                />
              </Field>
            </div>
            <p className="text-xs text-fg-soft">
              Uses about {script.length.toLocaleString()} credits
              {settings.voice.elevenlabs.model === "eleven_flash_v2_5"
                ? ` (${Math.ceil(script.length / 2).toLocaleString()} with Flash)`
                : ""}
              . The free plan (10,000 credits/month) is not licensed for commercial videos.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            busy={busy === "voiceover"}
            disabled={
              !!busy ||
              !script.trim() ||
              (voice.provider === "elevenlabs" && (!settings.voice.elevenlabs.apiKey || !voice.elevenlabs.voiceId))
            }
            onClick={() =>
              run("voiceover", async () => {
                const p = await save();
                // The key always comes from Settings; voice choices come from this panel.
                const payload: VoiceSettings = {
                  ...voice,
                  elevenlabs: {
                    ...voice.elevenlabs,
                    apiKey: settings.voice.elevenlabs.apiKey,
                    model: settings.voice.elevenlabs.model,
                  },
                };
                const res = await api<VoiceoverResult>("/api/voiceover", { body: { script: p.script, voice: payload } });
                await writeProjectFile(root, id, VOICE_FILE, base64ToBytes(res.audioBase64));
                await writeProjectFile(root, id, WORDS_FILE, JSON.stringify(res.words));
                await commit((d) => {
                  d.voiceover = {
                    provider: voice.provider,
                    voice: voice.provider === "edge" ? voice.edgeVoice : voice.elevenlabs.voiceId,
                    voiceLabel:
                      voice.provider === "edge"
                        ? voice.edgeVoice
                        : `ElevenLabs ${voice.elevenlabs.voiceName || voice.elevenlabs.voiceId}`,
                    file: VOICE_FILE,
                    durationSec: res.durationSec,
                    generatedAt: new Date().toISOString(),
                    scriptSnapshot: p.script,
                  };
                });
              })
            }
          >
            {project.voiceover ? "Regenerate voiceover" : "Generate voiceover"}
          </Button>
          {project.voiceover && (
            <span className="text-sm text-fg-soft">
              {fmt(project.voiceover.durationSec)} · {project.voiceover.voiceLabel}
            </span>
          )}
        </div>
        {voiceStale && (
          <p className="mt-3 text-sm text-warn">The script changed after this voiceover was made. Regenerate it.</p>
        )}
        {project.voiceover && audioUrl && <audio key={audioUrl} controls className="mt-4 w-full" src={audioUrl} />}
        <ErrorNote message={errors.voiceover} />
      </Card>

      {/* 5. Subtitles */}
      <Card>
        <StepHeader n={5} done={!!project.subtitles} title="Subtitles">
          Exported as plain .srt/.vtt so the editor sets font, size and colour in their own software.
        </StepHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Characters per line" hint="~32 for vertical, ~42 for landscape">
            <input
              type="number"
              min={10}
              max={80}
              className={inputClass}
              value={charsPerLine}
              onChange={(e) => setCharsPerLine(Number(e.target.value) || 10)}
            />
          </Field>
          <Field label="Lines per caption">
            <select className={inputClass} value={linesPerCue} onChange={(e) => setLinesPerCue(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </Field>
          <Field label="Max seconds per caption">
            <input
              type="number"
              min={1}
              max={10}
              step={0.5}
              className={inputClass}
              value={maxCueSeconds}
              onChange={(e) => setMaxCueSeconds(Number(e.target.value) || 1)}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            busy={busy === "subtitles"}
            disabled={!!busy || !project.voiceover}
            onClick={() =>
              run("subtitles", async () => {
                const vo = projectRef.current?.voiceover;
                if (!vo) throw new Error("Generate the voiceover first");
                let raw: WordTiming[];
                try {
                  raw = JSON.parse(await (await readProjectFile(root, id, WORDS_FILE)).text());
                } catch {
                  throw new Error("Word timings are missing; generate the voiceover again");
                }
                const words = alignToScript(vo.scriptSnapshot, raw);
                if (!words.length) throw new Error("The voiceover has no word timings");
                const opts = {
                  charsPerLine: Math.max(10, Math.min(80, Math.round(charsPerLine))),
                  linesPerCue: Math.max(1, Math.min(3, Math.round(linesPerCue))),
                  maxCueSeconds: Math.max(1, Math.min(10, maxCueSeconds)),
                };
                const built = buildCues(words, opts);
                const files: Record<string, string> = {
                  [`${FOLDERS.subtitles}/subtitles.srt`]: toSrt(built),
                  [`${FOLDERS.subtitles}/subtitles.vtt`]: toVtt(built),
                  [`${FOLDERS.subtitles}/subtitles_word_by_word.srt`]: toSrt(wordCues(words)),
                };
                for (const [path, content] of Object.entries(files)) await writeProjectFile(root, id, path, content);
                await commit((d) => {
                  d.subtitles = {
                    ...opts,
                    files: Object.keys(files),
                    cueCount: built.length,
                    generatedAt: new Date().toISOString(),
                  };
                });
                setCues(built);
              })
            }
          >
            {project.subtitles ? "Regenerate subtitles" : "Generate subtitles"}
          </Button>
          {!project.voiceover && <span className="text-sm text-fg-soft">Needs the voiceover first.</span>}
          {project.subtitles && <span className="text-sm text-fg-soft">{project.subtitles.cueCount} captions</span>}
        </div>
        {subsStale && (
          <p className="mt-3 text-sm text-warn">The voiceover changed after these subtitles were made. Regenerate them.</p>
        )}
        {cues && (
          <ol className="mt-4 max-h-64 overflow-y-auto rounded-md border border-line text-sm">
            {cues.map((c, i) => (
              <li key={i} className="flex gap-3 border-b border-line px-3 py-1.5 last:border-0">
                <span className="w-24 shrink-0 font-mono text-xs leading-5 text-fg-soft">
                  {c.start.toFixed(2)}–{c.end.toFixed(2)}
                </span>
                <span className="whitespace-pre-line">{c.text}</span>
              </li>
            ))}
          </ol>
        )}
        <ErrorNote message={errors.subtitles} />
      </Card>

      {/* 6. Hand-off */}
      <Card>
        <StepHeader
          n={6}
          done={!!project.script.trim() && project.footage.downloads.length > 0 && !!project.voiceover && !!project.subtitles}
          title="Hand off to the editor"
        >
          {workspace.mode === "folder"
            ? `Everything is already saved in ${location}. Open that folder in your editor, or zip it to send to someone.`
            : "Files are stored inside this browser. Download the zip to open them in your editor."}
        </StepHeader>
        <ul className="grid gap-1.5 text-sm">
          {[
            ["01_script/script.txt", !!project.script.trim()],
            ["02_keywords/keywords.txt", project.keywords.length > 0],
            [`03_footage/ (${project.footage.downloads.length} clips + credits.csv)`, project.footage.downloads.length > 0],
            ["04_voiceover/voiceover.mp3", !!project.voiceover],
            ["05_subtitles/subtitles.srt, .vtt, word_by_word.srt", !!project.subtitles],
            ["README.txt (import & styling instructions)", true],
          ].map(([label, ok]) => (
            <li key={String(label)} className="flex items-center gap-2">
              <span className={ok ? "text-ok" : "text-fg-soft"}>{ok ? "✓" : "○"}</span>
              <span className={`font-mono text-xs ${ok ? "" : "text-fg-soft"}`}>{label}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant={workspace.mode === "folder" ? "secondary" : "primary"}
            busy={busy === "zip"}
            disabled={!!busy}
            onClick={() =>
              run("zip", async () => {
                setZipNote(null);
                await save();
                const result = await exportProjectZip(root, id);
                if (result === "saved") setZipNote("Zip saved.");
              })
            }
          >
            Download as .zip
          </Button>
          {zipNote && <span className="text-sm text-ok">{zipNote}</span>}
        </div>
        <ErrorNote message={errors.zip} />
      </Card>
    </div>
  );
}

function Loaded({ workspace, id }: { workspace: Workspace; id: string }) {
  const [settings] = useSettings();
  if (!settings) return <p className="text-fg-soft">Loading…</p>;
  return <Editor workspace={workspace} id={id} settings={settings} />;
}

export default function ProjectWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params);
  const id = decodeURIComponent(rawId);
  return <WorkspaceGate>{(ws) => <Loaded key={`${ws.name}:${id}`} workspace={ws} id={id} />}</WorkspaceGate>;
}
