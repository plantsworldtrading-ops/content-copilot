"use client";

import { clipRelativePath } from "../editor-files";
import type { DownloadedClip, FootageCandidate } from "../types";
import { removeProjectFile, writeProjectFile } from "./workspace";

const ALLOWED_HOSTS = [/(^|\.)pexels\.com$/, /(^|\.)pixabay\.com$/];

/** Download a clip straight from the stock site into the project folder (no server in between). */
export async function downloadClip(
  root: FileSystemDirectoryHandle,
  projectId: string,
  candidate: FootageCandidate,
  onProgress?: (fraction: number) => void,
): Promise<DownloadedClip> {
  const url = new URL(candidate.downloadUrl);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.some((re) => re.test(url.hostname))) {
    throw new Error("Refusing to download from an unexpected host");
  }
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;

  // createWritable() writes to a temporary file and only replaces the target on close(),
  // so an interrupted download never leaves a half-written clip behind.
  const file = clipRelativePath(candidate);
  const bytes = await writeProjectFile(root, projectId, file, res.body, (n) => total && onProgress?.(n / total));
  if (bytes < 10_000) {
    await removeProjectFile(root, projectId, file);
    throw new Error("Downloaded file is too small to be a video");
  }
  return { ...candidate, file, bytes, downloadedAt: new Date().toISOString() };
}
