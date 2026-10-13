import { connection } from "next/server";
import { handle, readJson } from "@/lib/http";
import { createProject, listProjects } from "@/lib/projects";
import { writeEditorFiles } from "@/lib/export";

export async function GET() {
  await connection();
  return handle(listProjects);
}

export async function POST(req: Request) {
  return handle(async () => {
    const { title } = await readJson<{ title?: string }>(req);
    const project = await createProject(String(title ?? ""));
    await writeEditorFiles(project);
    return project;
  });
}
