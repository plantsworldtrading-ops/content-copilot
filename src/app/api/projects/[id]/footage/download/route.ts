import { promises as fs } from "fs";
import { handle, readJson } from "@/lib/http";
import { HttpError, projectPath, readProject, updateProject } from "@/lib/projects";
import { downloadClip } from "@/lib/stock";
import { writeEditorFiles } from "@/lib/export";

/** Download one candidate clip. The browser calls this per clip to show progress. */
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/footage/download">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { key } = await readJson<{ key?: string }>(req);
    const current = await readProject(id);
    const candidate = current.footage.candidates.find((c) => c.key === key);
    if (!candidate) throw new HttpError(404, "Clip not found in the search results");
    if (current.footage.downloads.some((d) => d.key === key)) return { project: current };

    const { file, bytes } = await downloadClip(id, candidate);
    const project = await updateProject(id, (p) => {
      p.footage.downloads = p.footage.downloads.filter((d) => d.key !== key);
      p.footage.downloads.push({ ...candidate, file, bytes, downloadedAt: new Date().toISOString() });
    });
    await writeEditorFiles(project);
    return { project };
  });
}

/** Remove a downloaded clip from the project folder. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/projects/[id]/footage/download">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { key } = await readJson<{ key?: string }>(req);
    let removed: string | undefined;
    const project = await updateProject(id, (p) => {
      removed = p.footage.downloads.find((d) => d.key === key)?.file;
      p.footage.downloads = p.footage.downloads.filter((d) => d.key !== key);
    });
    if (removed) await fs.rm(await projectPath(id, removed), { force: true });
    await writeEditorFiles(project);
    return { project };
  });
}
