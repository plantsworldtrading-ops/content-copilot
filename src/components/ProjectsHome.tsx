"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Project, ProjectSummary, StepStatus } from "@/lib/types";
import { Button, Card, ErrorNote, inputClass } from "./ui";

const STEP_LABELS: [keyof StepStatus, string][] = [
  ["script", "Script"],
  ["keywords", "Keywords"],
  ["footage", "Footage"],
  ["voiceover", "Voiceover"],
  ["subtitles", "Subtitles"],
];

export default function ProjectsHome() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ProjectSummary[]>("/api/projects")
      .then(setProjects)
      .catch((e) => setError(e.message));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const project = await api<Project>("/api/projects", { body: { title } });
      router.push(`/projects/${encodeURIComponent(project.id)}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <h1 className="text-xl font-semibold">New project</h1>
        <p className="mt-1 text-sm text-fg-soft">
          The title becomes the folder name. Everything the editor needs ends up inside it.
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
          <Button type="submit" busy={busy} disabled={!title.trim()} className="sm:w-44">
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
              <li key={p.id}>
                <Link
                  href={`/projects/${encodeURIComponent(p.id)}`}
                  className="block rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent"
                >
                  <div className="truncate font-medium">{p.title}</div>
                  <div className="mt-0.5 text-xs text-fg-soft">
                    Updated {new Date(p.updatedAt).toLocaleString()}
                  </div>
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
