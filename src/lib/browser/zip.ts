"use client";

import { downloadZip } from "client-zip";
import { listProjectFiles } from "./workspace";

/**
 * Zip a project folder. Where the browser can save files directly, the zip is
 * streamed to disk so large footage never sits in memory.
 */
export async function exportProjectZip(root: FileSystemDirectoryHandle, id: string): Promise<"saved" | "cancelled"> {
  const files = await listProjectFiles(root, id);
  const zip = () =>
    downloadZip(
      files.map(({ path, file }) => ({ name: `${id}/${path}`, input: file, lastModified: file.lastModified })),
    );
  const filename = `${id}.zip`;

  if (window.showSaveFilePicker) {
    let handle: FileSystemFileHandle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "Zip archive", accept: { "application/zip": [".zip"] } }],
      });
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return "cancelled";
      throw err;
    }
    await zip().body!.pipeTo(await handle.createWritable());
    return "saved";
  }

  const url = URL.createObjectURL(await zip().blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "saved";
}
