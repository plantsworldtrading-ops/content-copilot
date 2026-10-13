/** Browser-side fetch helper: JSON in, JSON out, server error messages surfaced. */
export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function projectUrl(id: string, suffix = ""): string {
  return `/api/projects/${encodeURIComponent(id)}${suffix}`;
}

export function fileUrl(id: string, relative: string, version?: string): string {
  const q = new URLSearchParams({ path: relative });
  if (version) q.set("v", version);
  return `${projectUrl(id, "/file")}?${q}`;
}
