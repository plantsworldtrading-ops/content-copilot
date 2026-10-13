"use client";

import { editorFiles, folderNameFromTitle } from "../editor-files";
import { STATE_DIR } from "../types";
import type { Project, ProjectSummary, Settings, StepStatus } from "../types";

export type WorkspaceMode = "folder" | "browser";

export interface Workspace {
  root: FileSystemDirectoryHandle;
  mode: WorkspaceMode;
  name: string;
}

export type WorkspaceState =
  | { status: "ready"; workspace: Workspace }
  | { status: "needs-permission"; handle: FileSystemDirectoryHandle }
  | { status: "none" };

const STATE_FILE = "project.json";

// ---------- capability checks ----------

export function canPickFolder(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export function canUseBrowserStorage(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function" &&
    typeof FileSystemFileHandle !== "undefined" &&
    "createWritable" in FileSystemFileHandle.prototype
  );
}

// ---------- remembering the chosen folder (IndexedDB can store directory handles) ----------

function idb<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("content-copilot", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("kv", mode);
      const req = fn(tx.objectStore("kv"));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => open.result.close();
    };
  });
}

interface SavedWorkspace {
  mode: WorkspaceMode;
  handle?: FileSystemDirectoryHandle;
}

async function browserRoot(): Promise<FileSystemDirectoryHandle> {
  const opfs = await navigator.storage.getDirectory();
  await navigator.storage.persist?.().catch(() => false);
  return opfs.getDirectoryHandle("projects", { create: true });
}

export async function getWorkspaceState(): Promise<WorkspaceState> {
  let saved: SavedWorkspace | undefined;
  try {
    saved = await idb<SavedWorkspace | undefined>("readonly", (s) => s.get("workspace"));
  } catch {
    return { status: "none" };
  }
  if (!saved) return { status: "none" };
  if (saved.mode === "browser") {
    if (!canUseBrowserStorage()) return { status: "none" };
    return { status: "ready", workspace: { root: await browserRoot(), mode: "browser", name: "This browser" } };
  }
  if (!saved.handle) return { status: "none" };
  const permission = (await saved.handle.queryPermission?.({ mode: "readwrite" })) ?? "granted";
  if (permission === "granted") {
    return { status: "ready", workspace: { root: saved.handle, mode: "folder", name: saved.handle.name } };
  }
  return { status: "needs-permission", handle: saved.handle };
}

/** Must be called from a click handler. */
export async function chooseFolder(): Promise<Workspace> {
  if (!window.showDirectoryPicker) throw new Error("This browser can't open folders. Use Chrome or Edge.");
  const handle = await window.showDirectoryPicker({ id: "content-copilot", mode: "readwrite" });
  await idb("readwrite", (s) => s.put({ mode: "folder", handle } satisfies SavedWorkspace, "workspace"));
  return { root: handle, mode: "folder", name: handle.name };
}

/** Must be called from a click handler (the browser asks the user again). */
export async function reconnectFolder(handle: FileSystemDirectoryHandle): Promise<Workspace | null> {
  const permission = (await handle.requestPermission?.({ mode: "readwrite" })) ?? "granted";
  return permission === "granted" ? { root: handle, mode: "folder", name: handle.name } : null;
}

export async function connectBrowserStorage(): Promise<Workspace> {
  if (!canUseBrowserStorage()) throw new Error("This browser can't store project files. Use Chrome or Edge.");
  await idb("readwrite", (s) => s.put({ mode: "browser" } satisfies SavedWorkspace, "workspace"));
  return { root: await browserRoot(), mode: "browser", name: "This browser" };
}

export async function forgetWorkspace(): Promise<void> {
  await idb("readwrite", (s) => s.delete("workspace"));
}

// ---------- file helpers (paths are "a/b/c.ext", relative to a project folder) ----------

function segments(relative: string): string[] {
  const parts = relative.split("/").filter(Boolean);
  if (!parts.length || parts.some((p) => p === "." || p === "..")) {
    throw new Error(`Invalid path: ${relative}`);
  }
  return parts;
}

async function dirAt(root: FileSystemDirectoryHandle, parts: string[], create: boolean) {
  let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
  return dir;
}

async function projectRoot(root: FileSystemDirectoryHandle, id: string, create = false) {
  if (!id || id.includes("/") || id.startsWith(".")) throw new Error("Invalid project id");
  return root.getDirectoryHandle(id, { create });
}

export type WriteData = string | Blob | BufferSource | ReadableStream<Uint8Array<ArrayBuffer>>;

export async function writeProjectFile(
  root: FileSystemDirectoryHandle,
  id: string,
  relative: string,
  data: WriteData,
  onProgress?: (bytesWritten: number) => void,
): Promise<number> {
  const parts = segments(relative);
  const dir = await dirAt(await projectRoot(root, id), parts.slice(0, -1), true);
  const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await handle.createWritable();
  let written = 0;
  try {
    if (data instanceof ReadableStream) {
      const reader = data.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
        written += value.byteLength;
        onProgress?.(written);
      }
    } else {
      await writable.write(data);
      written = typeof data === "string" ? new Blob([data]).size : data instanceof Blob ? data.size : data.byteLength;
    }
    await writable.close();
  } catch (err) {
    await writable.abort().catch(() => {});
    throw err;
  }
  return written;
}

export async function readProjectFile(root: FileSystemDirectoryHandle, id: string, relative: string): Promise<File> {
  const parts = segments(relative);
  const dir = await dirAt(await projectRoot(root, id), parts.slice(0, -1), false);
  return (await dir.getFileHandle(parts[parts.length - 1])).getFile();
}

export async function removeProjectFile(root: FileSystemDirectoryHandle, id: string, relative: string) {
  const parts = segments(relative);
  try {
    const dir = await dirAt(await projectRoot(root, id), parts.slice(0, -1), false);
    await dir.removeEntry(parts[parts.length - 1]);
  } catch (err) {
    if ((err as DOMException).name !== "NotFoundError") throw err;
  }
}

/** Every file in a project folder (except app state), for zipping. */
export async function listProjectFiles(
  root: FileSystemDirectoryHandle,
  id: string,
): Promise<{ path: string; file: File }[]> {
  const out: { path: string; file: File }[] = [];
  const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
    for await (const entry of dir.values()) {
      if (entry.name.startsWith(".")) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "directory") await walk(entry as FileSystemDirectoryHandle, path);
      else out.push({ path, file: await (entry as FileSystemFileHandle).getFile() });
    }
  };
  await walk(await projectRoot(root, id), "");
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// ---------- projects ----------

export function stepStatus(p: Project): StepStatus {
  return {
    script: p.script.trim().length > 0,
    keywords: p.keywords.length > 0,
    footage: p.footage.downloads.length > 0,
    voiceover: Boolean(p.voiceover),
    subtitles: Boolean(p.subtitles),
  };
}

export async function readProject(root: FileSystemDirectoryHandle, id: string): Promise<Project> {
  try {
    const file = await readProjectFile(root, id, `${STATE_DIR}/${STATE_FILE}`);
    return JSON.parse(await file.text()) as Project;
  } catch (err) {
    if ((err as DOMException).name === "NotFoundError") throw new Error("Project not found in this workspace");
    throw err;
  }
}

// Writes for one project are queued so parallel downloads can't interleave.
const queues = new Map<string, Promise<unknown>>();

export function saveProject(root: FileSystemDirectoryHandle, project: Project): Promise<void> {
  const snapshot: Project = { ...project, updatedAt: new Date().toISOString() };
  const previous = queues.get(project.id) ?? Promise.resolve();
  const run = previous
    .catch(() => {})
    .then(async () => {
      await writeProjectFile(root, project.id, `${STATE_DIR}/${STATE_FILE}`, JSON.stringify(snapshot, null, 2));
      for (const [path, content] of Object.entries(editorFiles(snapshot))) {
        await writeProjectFile(root, project.id, path, content);
      }
    });
  queues.set(project.id, run);
  return run;
}

export async function createProject(
  root: FileSystemDirectoryHandle,
  title: string,
  defaults: Settings["defaults"],
): Promise<Project> {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("Project title is required");
  const base = folderNameFromTitle(cleanTitle);
  let id = base;
  for (let n = 2; ; n++) {
    try {
      await root.getDirectoryHandle(id);
      id = `${base} (${n})`; // already exists
    } catch (err) {
      if ((err as DOMException).name !== "NotFoundError") throw err;
      break;
    }
  }
  const now = new Date().toISOString();
  const project: Project = {
    version: 2,
    id,
    title: cleanTitle,
    createdAt: now,
    updatedAt: now,
    aspect: defaults.aspect,
    topic: "",
    language: defaults.language,
    targetSeconds: defaults.targetSeconds,
    script: "",
    keywords: [],
    footage: { candidates: [], downloads: [] },
  };
  await projectRoot(root, id, true);
  await saveProject(root, project);
  return project;
}

export async function listProjects(root: FileSystemDirectoryHandle): Promise<ProjectSummary[]> {
  const out: ProjectSummary[] = [];
  for await (const entry of root.values()) {
    if (entry.kind !== "directory" || entry.name.startsWith(".")) continue;
    try {
      const p = await readProject(root, entry.name);
      out.push({ id: p.id, title: p.title, updatedAt: p.updatedAt, steps: stepStatus(p) });
    } catch {
      // Not a Content Copilot project folder; ignore it.
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteProject(root: FileSystemDirectoryHandle, id: string): Promise<void> {
  await projectRoot(root, id);
  await root.removeEntry(id, { recursive: true });
}
