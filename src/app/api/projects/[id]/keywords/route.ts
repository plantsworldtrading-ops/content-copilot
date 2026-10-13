import { handle, readJson } from "@/lib/http";
import { generateKeywords } from "@/lib/llm";
import { HttpError, readProject, updateProject } from "@/lib/projects";
import { readSettings } from "@/lib/settings";
import { writeEditorFiles } from "@/lib/export";

export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/keywords">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { count } = await readJson<{ count?: number }>(req);
    const current = await readProject(id);
    if (!current.script.trim()) throw new HttpError(400, "Write or generate the script first");
    const settings = await readSettings();
    const n = Math.max(1, Math.min(30, Math.round(count ?? settings.defaults.keywordCount)));
    const keywords = await generateKeywords(current.script, n);
    const project = await updateProject(id, (p) => {
      p.keywords = keywords;
    });
    await writeEditorFiles(project);
    return { project };
  });
}
