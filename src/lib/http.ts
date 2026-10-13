import "server-only";
import { HttpError } from "./projects";

/** Run a route handler body and turn thrown errors into JSON responses. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const result = await fn();
    return result instanceof Response ? result : Response.json(result);
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unexpected server error" },
      { status: 500 },
    );
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Request body must be JSON");
  }
}
