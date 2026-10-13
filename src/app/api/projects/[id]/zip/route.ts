import archiver from "archiver";
import { Readable } from "stream";
import { handle } from "@/lib/http";
import { STATE_DIR, projectDir, readProject } from "@/lib/projects";

/** Stream the whole editor folder as a .zip (for editors working on another machine). */
export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]/zip">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const project = await readProject(id);
    const dir = await projectDir(id);

    // Video is already compressed; "store" keeps zipping fast.
    const archive = archiver("zip", { store: true });
    archive.glob("**/*", { cwd: dir, ignore: [`${STATE_DIR}/**`, "**/*.part"], dot: false }, {
      prefix: project.id,
    });
    void archive.finalize();

    const filename = `${project.id}.zip`;
    return new Response(Readable.toWeb(archive) as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  });
}
