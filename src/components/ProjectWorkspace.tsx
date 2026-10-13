"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { api, fileUrl, projectUrl } from "@/lib/client";
import type { Aspect, Project, Settings } from "@/lib/types";
import FootageStep from "./FootageStep";
import { Button, Card, ErrorNote, Field, StepBadge, inputClass } from "./ui";

interface Voice {
  name: string;
  locale: string;
  gender: string;
  label: string;
}

interface Cue {
  start: number;
  end: number;
  text: string;
}

const WORDS_PER_SECOND = 2.5;

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
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

export default function ProjectWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params);
  const id = decodeURIComponent(rawId);

  const [project, setProject] = useState<Project | null>(null);
  const [folder, setFolder] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable drafts; saved with PATCH before any step that depends on them.
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [language, setLanguage] = useState("");
  const [targetSeconds, setTargetSeconds] = useState(50);
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [keywordCount, setKeywordCount] = useState(8);

  const [voices, setVoices] = useState<Voice[]>([]);
  const [voice, setVoice] = useState("");
  const [voiceFilter, setVoiceFilter] = useState("en-");
  const [ratePercent, setRatePercent] = useState(0);
  const [pitchHz, setPitchHz] = useState(0);

  const [charsPerLine, setCharsPerLine] = useState(32);
  const [linesPerCue, setLinesPerCue] = useState(1);
  const [maxCueSeconds, setMaxCueSeconds] = useState(3);
  const [cues, setCues] = useState<Cue[] | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [copied, setCopied] = useState(false);

  const loadDrafts = useCallback((p: Project) => {
    setTopic(p.topic);
    setScript(p.script);
    setKeywordsText(p.keywords.join("\n"));
    setLanguage(p.language);
    setTargetSeconds(p.targetSeconds);
    setAspect(p.aspect);
  }, []);

  useEffect(() => {
    Promise.all([
      api<{ project: Project; folder: string }>(projectUrl(id)),
      api<Settings>("/api/settings"),
    ])
      .then(([{ project, folder }, s]) => {
        setProject(project);
        setFolder(folder);
        loadDrafts(project);
        setSettings(s);
        setKeywordCount(s.defaults.keywordCount);
        setVoice(project.voiceover?.voice ?? s.defaults.voice);
        setRatePercent(project.voiceover?.ratePercent ?? s.defaults.ratePercent);
        setPitchHz(project.voiceover?.pitchHz ?? s.defaults.pitchHz);
        setCharsPerLine(project.subtitles?.charsPerLine ?? s.defaults.charsPerLine);
        setLinesPerCue(project.subtitles?.linesPerCue ?? s.defaults.linesPerCue);
        setMaxCueSeconds(project.subtitles?.maxCueSeconds ?? s.defaults.maxCueSeconds);
      })
      .catch((e) => setLoadError(e.message));
    api<Voice[]>("/api/voices")
      .then(setVoices)
      .catch(() => setVoices([]));
  }, [id, loadDrafts]);

  const keywords = useMemo(
    () => keywordsText.split("\n").map((k) => k.trim()).filter(Boolean),
    [keywordsText],
  );

  const dirty =
    !!project &&
    (topic !== project.topic ||
      script !== project.script ||
      keywords.join("\n") !== project.keywords.join("\n") ||
      language !== project.language ||
      targetSeconds !== project.targetSeconds ||
      aspect !== project.aspect);

  async function save(): Promise<Project> {
    if (!dirty && project) return project;
    const { project: p } = await api<{ project: Project }>(projectUrl(id), {
      method: "PATCH",
      body: { topic, script, keywords, language, targetSeconds, aspect },
    });
    setProject(p);
    return p;
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
  if (!project || !settings) return <p className="text-fg-soft">Loading project…</p>;

  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const voiceStale = !!project.voiceover && project.voiceover.scriptSnapshot !== project.script;
  const subsStale =
    !!project.subtitles && !!project.voiceover && project.subtitles.generatedAt < project.voiceover.generatedAt;
  const filteredVoices = voices.filter(
    (v) => !voiceFilter || `${v.name} ${v.label}`.toLowerCase().includes(voiceFilter.toLowerCase()),
  );
  const llmReady = settings.llm.provider === "gemini" ? !!settings.llm.gemini.apiKey : true;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href="/" className="text-sm text-fg-soft hover:text-fg">
            ← Projects
          </Link>
          <h1 className="mt-1 truncate text-2xl font-semibold">{project.title}</h1>
          <p className="truncate font-mono text-xs text-fg-soft" title={folder}>
            {folder}
          </p>
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
            disabled={!!busy}
            onClick={() =>
              run("script", async () => {
                if (script.trim() && !confirm("Replace the current script with a new AI draft?")) return;
                await save();
                const { project: p } = await api<{ project: Project }>(projectUrl(id, "/script"), { body: {} });
                setProject(p);
                setScript(p.script);
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
            disabled={!!busy || !script.trim()}
            onClick={() =>
              run("keywords", async () => {
                if (keywords.length && !confirm("Replace the current keywords?")) return;
                await save();
                const { project: p } = await api<{ project: Project }>(projectUrl(id, "/keywords"), {
                  body: { count: keywordCount },
                });
                setProject(p);
                setKeywordsText(p.keywords.join("\n"));
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
        disabled={!!busy && busy !== "footage"}
        onBeforeSearch={save}
        onProject={setProject}
        header={
          <StepHeader n={3} done={project.footage.downloads.length > 0} title="Footage">
            Search every keyword, untick clips you don&apos;t want, then download. Clips land in{" "}
            <code className="font-mono">03_footage/NN_keyword/</code>.
          </StepHeader>
        }
      />

      {/* 4. Voiceover */}
      <Card>
        <StepHeader n={4} done={!!project.voiceover} title="Voiceover">
          Free Microsoft Edge neural voices. Word timings are captured for the subtitles.
        </StepHeader>
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
            <select className={inputClass} value={voice} onChange={(e) => setVoice(e.target.value)}>
              {!filteredVoices.some((v) => v.name === voice) && <option value={voice}>{voice}</option>}
              {filteredVoices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} — {v.gender}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Speed ${ratePercent > 0 ? "+" : ""}${ratePercent}%`}>
            <input
              type="range"
              min={-50}
              max={50}
              step={5}
              value={ratePercent}
              onChange={(e) => setRatePercent(Number(e.target.value))}
            />
          </Field>
          <Field label={`Pitch ${pitchHz > 0 ? "+" : ""}${pitchHz} Hz`}>
            <input
              type="range"
              min={-20}
              max={20}
              step={1}
              value={pitchHz}
              onChange={(e) => setPitchHz(Number(e.target.value))}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            busy={busy === "voiceover"}
            disabled={!!busy || !script.trim()}
            onClick={() =>
              run("voiceover", async () => {
                await save();
                const { project: p } = await api<{ project: Project }>(projectUrl(id, "/voiceover"), {
                  body: { voice, ratePercent, pitchHz },
                });
                setProject(p);
              })
            }
          >
            {project.voiceover ? "Regenerate voiceover" : "Generate voiceover"}
          </Button>
          {project.voiceover && (
            <span className="text-sm text-fg-soft">
              {fmt(project.voiceover.durationSec)} · {project.voiceover.voice}
            </span>
          )}
        </div>
        {voiceStale && (
          <p className="mt-3 text-sm text-warn">The script changed after this voiceover was made. Regenerate it.</p>
        )}
        {project.voiceover && (
          <audio
            key={project.voiceover.generatedAt}
            controls
            className="mt-4 w-full"
            src={fileUrl(id, project.voiceover.file, project.voiceover.generatedAt)}
          />
        )}
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
                const res = await api<{ project: Project; cues: Cue[] }>(projectUrl(id, "/subtitles"), {
                  body: { charsPerLine, linesPerCue, maxCueSeconds },
                });
                setProject(res.project);
                setCues(res.cues);
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
          done={
            !!project.script.trim() &&
            project.footage.downloads.length > 0 &&
            !!project.voiceover &&
            !!project.subtitles
          }
          title="Hand off to the editor"
        >
          Everything is already in the project folder. Open it in your editor, or download a zip.
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
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(folder);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy folder path"}
          </Button>
          <a
            href={projectUrl(id, "/zip")}
            className="inline-flex items-center rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-strong"
          >
            Download as .zip
          </a>
        </div>
      </Card>
    </div>
  );
}
