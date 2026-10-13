import { handle, readJson } from "@/lib/http";
import { HttpError, projectDir, readProject, updateProject } from "@/lib/projects";
import { writeEditorFiles } from "@/lib/export";
import type { Aspect, Project } from "@/lib/types";

const ASPECTS: Aspect[] = ["9:16", "16:9", "1:1"];

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return { project: await readProject(id), folder: await projectDir(id) };
  });
}

/** Save editable fields: topic, script, keywords, aspect, language, target length. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson<Partial<Project>>(req);
    const project = await updateProject(id, (p) => {
      if (typeof body.topic === "string") p.topic = body.topic;
      if (typeof body.script === "string") p.script = body.script;
      if (typeof body.language === "string") p.language = body.language.trim() || p.language;
      if (typeof body.targetSeconds === "number" && body.targetSeconds > 0) {
        p.targetSeconds = Math.min(600, Math.round(body.targetSeconds));
      }
      if (body.aspect !== undefined) {
        if (!ASPECTS.includes(body.aspect)) throw new HttpError(400, "Unsupported aspect ratio");
        p.aspect = body.aspect;
      }
      if (Array.isArray(body.keywords)) {
        p.keywords = body.keywords.map((k) => String(k).trim()).filter(Boolean);
      }
    });
    await writeEditorFiles(project);
    return { project };
  });
}
