import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { handle } from "@/lib/http";
import { HttpError, projectPath } from "@/lib/projects";

const TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".srt": "text/plain; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};

/** Serve a project file to the browser (with Range support so audio/video can seek). */
export async function GET(req: Request, ctx: RouteContext<"/api/projects/[id]/file">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const rel = new URL(req.url).searchParams.get("path") ?? "";
    const type = TYPES[path.extname(rel).toLowerCase()];
    if (!type || rel.split(/[\\/]/).some((part) => part.startsWith("."))) {
      throw new HttpError(400, "File type not served");
    }
    const full = await projectPath(id, rel);
    const stat = await fs.stat(full).catch(() => {
      throw new HttpError(404, "File not found");
    });

    const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
      }
      return new Response(Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream, {
        status: 206,
        headers: {
          "Content-Type": type,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
        },
      });
    }
    return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  });
}
