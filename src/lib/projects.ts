import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { readSettings } from "./settings";
import type { Project, ProjectSummary, StepStatus } from "./types";

export const STATE_DIR = ".copilot";
const STATE_FILE = "project.json";

export const FOLDERS = {
  script: "01_script",
  keywords: "02_keywords",
  footage: "03_footage",
  voiceover: "04_voiceover",
  subtitles: "05_subtitles",
} as const;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function projectsRoot(): Promise<string> {
  const { projectsDir } = await readSettings();
  await fs.mkdir(projectsDir, { recursive: true });
  return projectsDir;
}

/** Turn a project title into a folder name that is valid on Windows, macOS and Linux. */
export function folderNameFromTitle(title: string): string {
  const name = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 100);
  return name || "Untitled project";
}

function assertSafeId(id: string) {
  if (!id || id !== path.basename(id) || id === "." || id === ".." || id.startsWith(".")) {
    throw new HttpError(400, "Invalid project id");
  }
}

export async function projectDir(id: string): Promise<string> {
  assertSafeId(id);
  return path.join(await projectsRoot(), id);
}

/** Resolve a path inside a project folder, refusing anything that escapes it. */
export async function projectPath(id: string, relative: string): Promise<string> {
  const dir = await projectDir(id);
  const full = path.resolve(dir, relative);
  if (full !== dir && !full.startsWith(dir + path.sep)) {
    throw new HttpError(400, "Path is outside the project folder");
  }
  return full;
}

export function stepStatus(p: Project): StepStatus {
  return {
    script: p.script.trim().length > 0,
    keywords: p.keywords.length > 0,
    footage: p.footage.downloads.length > 0,
    voiceover: Boolean(p.voiceover),
    subtitles: Boolean(p.subtitles),
  };
}

export async function readProject(id: string): Promise<Project> {
  const file = path.join(await projectDir(id), STATE_DIR, STATE_FILE);
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as Project;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new HttpError(404, "Project not found");
    }
    throw err;
  }
}

async function writeProject(project: Project): Promise<void> {
  const dir = path.join(await projectDir(project.id), STATE_DIR);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, STATE_FILE);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(project, null, 2));
  await fs.rename(tmp, file);
}

// Footage downloads run in parallel, so serialise read-modify-write per project.
const locks = new Map<string, Promise<unknown>>();

export async function updateProject(
  id: string,
  mutate: (p: Project) => void | Promise<void>,
): Promise<Project> {
  const previous = locks.get(id) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(async () => {
    const project = await readProject(id);
    await mutate(project);
    project.updatedAt = new Date().toISOString();
    await writeProject(project);
    return project;
  });
  locks.set(id, run);
  try {
    return await run;
  } finally {
    if (locks.get(id) === run) locks.delete(id);
  }
}

export async function createProject(title: string): Promise<Project> {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new HttpError(400, "Project title is required");
  const settings = await readSettings();
  const root = await projectsRoot();

  const base = folderNameFromTitle(cleanTitle);
  let id = base;
  for (let n = 2; ; n++) {
    try {
      await fs.mkdir(path.join(root, id));
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      id = `${base} (${n})`;
    }
  }

  const now = new Date().toISOString();
  const project: Project = {
    version: 1,
    id,
    title: cleanTitle,
    createdAt: now,
    updatedAt: now,
    aspect: settings.defaults.aspect,
    topic: "",
    language: settings.defaults.language,
    targetSeconds: settings.defaults.targetSeconds,
    script: "",
    keywords: [],
    footage: { candidates: [], downloads: [] },
  };
  await writeProject(project);
  return project;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const root = await projectsRoot();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const summaries: ProjectSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    try {
      const p = await readProject(entry.name);
      summaries.push({ id: p.id, title: p.title, updatedAt: p.updatedAt, steps: stepStatus(p) });
    } catch {
      // Not a Content Copilot project folder; ignore it.
    }
  }
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function writeProjectFile(id: string, relative: string, content: string | Buffer) {
  const full = await projectPath(id, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}
