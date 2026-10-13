import { handle } from "@/lib/http";
import { generateScript } from "@/lib/llm";
import { HttpError, readProject, updateProject } from "@/lib/projects";
import { writeEditorFiles } from "@/lib/export";

export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/script">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const current = await readProject(id);
    if (!current.topic.trim() && !current.title.trim()) {
      throw new HttpError(400, "Describe the video topic first");
    }
    const script = await generateScript({
      title: current.title,
      topic: current.topic,
      language: current.language,
      targetSeconds: current.targetSeconds,
    });
    const project = await updateProject(id, (p) => {
      p.script = script;
    });
    await writeEditorFiles(project);
    return { project };
  });
}
