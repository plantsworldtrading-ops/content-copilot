"use client";

import { useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { downloadClip } from "@/lib/browser/footage";
import { removeProjectFile } from "@/lib/browser/workspace";
import type { FootageCandidate, Project, Settings } from "@/lib/types";
import { Button, Card, ErrorNote } from "./ui";

const CONCURRENCY = 3;

type ClipState = "queued" | "error" | number; // number = download progress 0..1
const CUT_SECONDS = 5;

function ClipCard({
  clip,
  selected,
  downloaded,
  state,
  onToggle,
  onRemove,
}: {
  clip: FootageCandidate;
  selected: boolean;
  downloaded: boolean;
  state?: ClipState;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hover, setHover] = useState(false);
  const portrait = clip.height > clip.width;

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border bg-muted ${
        downloaded ? "border-ok" : selected ? "border-accent" : "border-line opacity-60"
      }`}
      onMouseEnter={() => {
        setHover(true);
        void videoRef.current?.play().catch(() => {});
      }}
      onMouseLeave={() => {
        setHover(false);
        videoRef.current?.pause();
      }}
    >
      <div className={portrait ? "aspect-[9/16]" : "aspect-video"}>
        {/* eslint-disable-next-line @next/next/no-img-element -- remote stock thumbnails */}
        {clip.thumbnail && <img src={clip.thumbnail} alt="" loading="lazy" className="size-full object-cover" />}
        {hover && (
          <video
            ref={videoRef}
            src={clip.previewUrl}
            muted
            loop
            playsInline
            autoPlay
            className="absolute inset-0 size-full object-cover"
          />
        )}
      </div>
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-1.5">
        {downloaded ? (
          <span className="rounded bg-ok px-1.5 py-0.5 text-[11px] font-medium text-white">Downloaded</span>
        ) : (
          <label className="flex cursor-pointer items-center rounded bg-black/55 p-1">
            <input type="checkbox" checked={selected} onChange={onToggle} aria-label="Include this clip" />
          </label>
        )}
        <span className="rounded bg-black/55 px-1.5 py-0.5 font-mono text-[11px] text-white">{clip.duration}s</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/75 to-transparent p-1.5 pt-6 text-[11px] text-white">
        <a href={clip.pageUrl} target="_blank" rel="noreferrer" className="truncate hover:underline">
          {clip.provider} · {clip.author || "unknown"}
        </a>
        {downloaded && (
          <button onClick={onRemove} className="shrink-0 rounded bg-black/55 px-1.5 py-0.5 hover:bg-danger">
            Remove
          </button>
        )}
      </div>
      {state !== undefined && state !== "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-xs font-medium text-white">
          {state === "queued" ? "Queued" : `Downloading ${Math.round(state * 100)}%`}
          {typeof state === "number" && (
            <div className="h-1 w-3/4 overflow-hidden rounded bg-white/30">
              <div className="h-full bg-white" style={{ width: `${Math.round(state * 100)}%` }} />
            </div>
          )}
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-x-0 bottom-7 mx-1.5 rounded bg-danger px-1.5 py-0.5 text-[11px] text-white">
          Failed
        </div>
      )}
    </div>
  );
}

export default function FootageStep({
  project,
  settings,
  root,
  disabled,
  header,
  onBeforeSearch,
  commit,
}: {
  project: Project;
  settings: Settings;
  root: FileSystemDirectoryHandle;
  disabled: boolean;
  header: React.ReactNode;
  onBeforeSearch: () => Promise<Project>;
  commit: (mutate: (p: Project) => void) => Promise<Project>;
}) {
  const id = project.id;
  const [unselected, setUnselected] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Record<string, ClipState>>({});
  const [searching, setSearching] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const downloadedKeys = useMemo(() => new Set(project.footage.downloads.map((d) => d.key)), [project.footage.downloads]);
  const groups = useMemo(() => {
    const map = new Map<number, { keyword: string; clips: FootageCandidate[] }>();
    for (const c of project.footage.candidates) {
      if (!map.has(c.keywordIndex)) map.set(c.keywordIndex, { keyword: c.keyword, clips: [] });
      map.get(c.keywordIndex)!.clips.push(c);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
  }, [project.footage.candidates]);

  const toDownload = project.footage.candidates.filter((c) => !downloadedKeys.has(c.key) && !unselected.has(c.key));

  // Same rule MoneyPrinterTurbo uses: one clip per CUT_SECONDS of voiceover, plus one.
  const words = project.script.trim() ? project.script.trim().split(/\s+/).length : 0;
  const voiceSeconds = project.voiceover?.durationSec ?? words / 2.5;
  const clipsNeeded = voiceSeconds > 0 ? Math.floor(voiceSeconds / CUT_SECONDS) + 1 : 0;

  const toggle = (key: string) =>
    setUnselected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const setGroup = (clips: FootageCandidate[], on: boolean) =>
    setUnselected((prev) => {
      const next = new Set(prev);
      for (const c of clips) {
        if (on) next.delete(c.key);
        else next.add(c.key);
      }
      return next;
    });

  async function search() {
    if (project.footage.candidates.length && !confirm("Search again? Unticked choices are reset; downloaded clips stay.")) {
      return;
    }
    setSearching(true);
    setError(null);
    setWarnings([]);
    try {
      const p = await onBeforeSearch();
      const res = await api<{ candidates: FootageCandidate[]; errors: string[] }>("/api/footage/search", {
        body: { stock: settings.stock, keywords: p.keywords, aspect: p.aspect },
      });
      await commit((d) => {
        d.footage.candidates = res.candidates;
        d.footage.searchedAt = new Date().toISOString();
      });
      setUnselected(new Set());
      setWarnings(res.errors);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function downloadSelected() {
    const queue = [...toDownload];
    setDownloading(true);
    setError(null);
    setStates(Object.fromEntries(queue.map((c) => [c.key, "queued" as const])));
    let failures = 0;
    const worker = async () => {
      for (let clip = queue.shift(); clip; clip = queue.shift()) {
        const key = clip.key;
        setStates((s) => ({ ...s, [key]: 0 }));
        try {
          const downloaded = await downloadClip(root, id, clip, (fraction) =>
            setStates((s) => ({ ...s, [key]: fraction })),
          );
          await commit((d) => {
            d.footage.downloads = d.footage.downloads.filter((x) => x.key !== key);
            d.footage.downloads.push(downloaded);
          });
          setStates((s) => {
            const next = { ...s };
            delete next[key];
            return next;
          });
        } catch {
          failures++;
          setStates((s) => ({ ...s, [key]: "error" }));
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setDownloading(false);
    if (failures) setError(`${failures} clip(s) failed to download. Try again to retry them.`);
  }

  async function remove(key: string) {
    try {
      const file = project.footage.downloads.find((d) => d.key === key)?.file;
      if (file) await removeProjectFile(root, id, file);
      await commit((d) => {
        d.footage.downloads = d.footage.downloads.filter((x) => x.key !== key);
      });
      setUnselected((prev) => new Set(prev).add(key));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const providers = settings.stock.providers.filter((p) =>
    p === "pexels" ? settings.stock.pexelsApiKey : settings.stock.pixabayApiKey,
  );

  return (
    <Card>
      {header}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          busy={searching}
          disabled={disabled || downloading || project.keywords.length === 0 || providers.length === 0}
          onClick={search}
        >
          {project.footage.candidates.length ? "Search again" : "Search footage"}
        </Button>
        <Button busy={downloading} disabled={disabled || searching || toDownload.length === 0} onClick={downloadSelected}>
          Download selected ({toDownload.length})
        </Button>
        <span className="text-sm text-fg-soft">
          {project.footage.downloads.length} downloaded
          {clipsNeeded > 0 && (
            <>
              {" "}
              · a {Math.round(voiceSeconds)}s voiceover with {CUT_SECONDS}s cuts needs about{" "}
              <strong className="text-fg">{clipsNeeded}</strong>
            </>
          )}
        </span>
      </div>
      {providers.length === 0 && (
        <p className="mt-3 text-sm text-warn">Add a Pexels or Pixabay key in Settings to search footage.</p>
      )}
      {project.keywords.length === 0 && <p className="mt-3 text-sm text-fg-soft">Save some keywords first.</p>}
      <div className="mt-3 flex flex-col gap-2">
        <ErrorNote message={error} />
        {warnings.map((w) => (
          <p key={w} className="text-sm text-warn">
            {w}
          </p>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-6">
        {groups.map((g, gi) => {
          const selectable = g.clips.filter((c) => !downloadedKeys.has(c.key));
          return (
            <div key={gi}>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
                <h3 className="text-sm font-medium">
                  <span className="font-mono text-fg-soft">{String(g.clips[0].keywordIndex + 1).padStart(2, "0")}</span>{" "}
                  {g.keyword}
                </h3>
                {selectable.length > 0 && (
                  <span className="flex gap-2 text-xs">
                    <button className="text-accent hover:underline" onClick={() => setGroup(selectable, true)}>
                      all
                    </button>
                    <button className="text-accent hover:underline" onClick={() => setGroup(selectable, false)}>
                      none
                    </button>
                  </span>
                )}
              </div>
              <div
                className={`grid gap-2 ${
                  project.aspect === "9:16"
                    ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6"
                    : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
                }`}
              >
                {g.clips.map((c) => (
                  <ClipCard
                    key={c.key}
                    clip={c}
                    selected={!unselected.has(c.key)}
                    downloaded={downloadedKeys.has(c.key)}
                    state={states[c.key]}
                    onToggle={() => toggle(c.key)}
                    onRemove={() => remove(c.key)}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {project.footage.searchedAt && groups.length === 0 && (
          <p className="text-sm text-fg-soft">No clips matched. Try simpler, more visual keywords.</p>
        )}
      </div>
    </Card>
  );
}
