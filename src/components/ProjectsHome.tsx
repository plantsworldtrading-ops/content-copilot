"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createProject, deleteProject, listProjects, type Workspace } from "@/lib/browser/workspace";
import type { ProjectSummary, StepStatus } from "@/lib/types";
import { useSettings } from "./AppProviders";
import WorkspaceGate from "./WorkspaceGate";
import { Button, Card, ErrorNote, inputClass } from "./ui";

const STEP_LABELS: [keyof StepStatus, string][] = [
  ["script", "Script"],
  ["keywords", "Keywords"],
  ["footage", "Footage"],
  ["voiceover", "Voiceover"],
  ["subtitles", "Subtitles"],
];

function Projects({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const [settings] = useSettings();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProjects(workspace.root)
      .then(setProjects)
      .catch((e) => setError(e.message));
  }, [workspace]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      const project = await createProject(workspace.root, title, settings.defaults);
      router.push(`/projects/${encodeURIComponent(project.id)}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function remove(p: ProjectSummary) {
    if (!confirm(`Delete “${p.title}” and all its files from this browser? This can't be undone.`)) return;
    try {
      await deleteProject(workspace.root, p.id);
      setProjects((list) => list?.filter((x) => x.id !== p.id) ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <h1 className="text-xl font-semibold">New project</h1>
        <p className="mt-1 text-sm text-fg-soft">
          The title becomes the folder name inside <strong className="text-fg">{workspace.name}</strong>. Everything the
          editor needs ends up in it.
        </p>
        <form onSubmit={create} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            className={inputClass}
            placeholder="e.g. Mealybugs are killing your houseplants"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
          />
          <Button type="submit" busy={busy} disabled={!title.trim() || !settings} className="sm:w-44">
            Create project
          </Button>
        </form>
        <div className="mt-3">
          <ErrorNote message={error} />
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-soft">Projects</h2>
        {projects === null ? (
          <p className="text-sm text-fg-soft">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-fg-soft">No projects yet. Create one above.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id} className="relative">
                <Link
                  href={`/projects/${encodeURIComponent(p.id)}`}
                  className="block rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent"
                >
                  <div className="truncate pr-6 font-medium">{p.title}</div>
                  <div className="mt-0.5 text-xs text-fg-soft">Updated {new Date(p.updatedAt).toLocaleString()}</div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {STEP_LABELS.map(([key, label]) => (
                      <span
                        key={key}
                        className={`rounded px-1.5 py-0.5 text-[11px] ${
                          p.steps[key] ? "bg-ok/15 text-ok" : "bg-muted text-fg-soft"
                        }`}
                      >
                        {p.steps[key] ? "✓ " : ""}
                        {label}
                      </span>
                    ))}
                  </div>
                </Link>
                {workspace.mode === "browser" && (
                  <button
                    onClick={() => remove(p)}
                    className="absolute right-2 top-2 rounded px-1.5 text-fg-soft hover:bg-danger/10 hover:text-danger"
                    aria-label={`Delete ${p.title}`}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function ProjectsHome() {
  return <WorkspaceGate>{(ws) => <Projects workspace={ws} />}</WorkspaceGate>;
}
