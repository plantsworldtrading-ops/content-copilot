import { handle } from "@/lib/http";
import { HttpError, readProject, updateProject } from "@/lib/projects";
import { readSettings } from "@/lib/settings";
import { searchFootage } from "@/lib/stock";

export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/footage/search">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const current = await readProject(id);
    if (!current.keywords.length) throw new HttpError(400, "Add keywords first");
    const { stock } = await readSettings();
    const { candidates, errors } = await searchFootage(current.keywords, current.aspect, stock);
    const project = await updateProject(id, (p) => {
      p.footage.candidates = candidates;
      p.footage.searchedAt = new Date().toISOString();
    });
    return { project, errors };
  });
}
