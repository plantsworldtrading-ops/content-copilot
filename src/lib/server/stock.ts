import "server-only";
import { HttpError } from "./http";
import type { Aspect, FootageCandidate, FootageQuality, StockSettings } from "../types";

const SHORT_SIDE: Record<FootageQuality, number> = { "720p": 720, "1080p": 1080, "4k": 2160 };

function orientationOf(w: number, h: number): Aspect {
  if (w === h) return "1:1";
  return w > h ? "16:9" : "9:16";
}

function matchesAspect(w: number, h: number, aspect: Aspect): boolean {
  // Square output can be cropped from anything; otherwise keep the orientation.
  return aspect === "1:1" || orientationOf(w, h) === aspect;
}

/** Smallest rendition whose short side reaches the target, else the largest one. */
function pickRendition<T extends { width: number; height: number }>(
  files: T[],
  quality: FootageQuality,
): T | undefined {
  const target = SHORT_SIDE[quality];
  const byShortSide = [...files].sort(
    (a, b) => Math.min(a.width, a.height) - Math.min(b.width, b.height),
  );
  return byShortSide.find((f) => Math.min(f.width, f.height) >= target) ?? byShortSide.at(-1);
}

interface PexelsFile {
  link: string;
  width: number;
  height: number;
  file_type: string;
}

async function searchPexels(
  keyword: string,
  keywordIndex: number,
  aspect: Aspect,
  stock: StockSettings,
): Promise<FootageCandidate[]> {
  const params = new URLSearchParams({
    query: keyword,
    per_page: String(Math.min(80, stock.clipsPerKeyword * 3)),
    orientation: aspect === "9:16" ? "portrait" : aspect === "16:9" ? "landscape" : "square",
  });
  const res = await fetch(`https://api.pexels.com/videos/search?${params}`, {
    headers: { Authorization: stock.pexelsApiKey },
  });
  if (!res.ok) throw new HttpError(502, `Pexels error ${res.status} for "${keyword}"`);
  const data = await res.json();

  const out: FootageCandidate[] = [];
  for (const v of data.videos ?? []) {
    if (!(v.duration >= stock.minClipSeconds)) continue;
    const files: PexelsFile[] = (v.video_files ?? []).filter(
      (f: PexelsFile) =>
        f.link && f.width && f.height && f.file_type === "video/mp4" && matchesAspect(f.width, f.height, aspect),
    );
    const best = pickRendition(files, stock.quality);
    const preview = [...files].sort((a, b) => a.width - b.width)[0];
    if (!best || !preview) continue;
    out.push({
      key: `pexels:${v.id}`,
      provider: "pexels",
      id: String(v.id),
      keyword,
      keywordIndex,
      pageUrl: v.url,
      author: v.user?.name ?? "",
      authorUrl: v.user?.url ?? "",
      duration: v.duration,
      width: best.width,
      height: best.height,
      thumbnail: v.image,
      previewUrl: preview.link,
      downloadUrl: best.link,
    });
  }
  return out;
}

interface PixabayRendition {
  url: string;
  width: number;
  height: number;
  thumbnail?: string;
}

async function searchPixabay(
  keyword: string,
  keywordIndex: number,
  aspect: Aspect,
  stock: StockSettings,
): Promise<FootageCandidate[]> {
  const params = new URLSearchParams({
    key: stock.pixabayApiKey,
    q: keyword.slice(0, 100),
    per_page: String(Math.max(3, Math.min(200, stock.clipsPerKeyword * 3))),
    safesearch: "true",
  });
  const res = await fetch(`https://pixabay.com/api/videos/?${params}`);
  if (!res.ok) throw new HttpError(502, `Pixabay error ${res.status} for "${keyword}"`);
  const data = await res.json();

  const out: FootageCandidate[] = [];
  for (const hit of data.hits ?? []) {
    if (!(hit.duration >= stock.minClipSeconds)) continue;
    const files = (Object.values(hit.videos ?? {}) as PixabayRendition[]).filter(
      (f) => f?.url && f.width && f.height && matchesAspect(f.width, f.height, aspect),
    );
    const best = pickRendition(files, stock.quality);
    const preview = [...files].sort((a, b) => a.width - b.width)[0];
    if (!best || !preview) continue;
    out.push({
      key: `pixabay:${hit.id}`,
      provider: "pixabay",
      id: String(hit.id),
      keyword,
      keywordIndex,
      pageUrl: hit.pageURL,
      author: hit.user ?? "",
      authorUrl: hit.user_id ? `https://pixabay.com/users/${hit.user}-${hit.user_id}/` : "",
      duration: hit.duration,
      width: best.width,
      height: best.height,
      thumbnail: files.find((f) => f.thumbnail)?.thumbnail ?? "",
      previewUrl: preview.url,
      downloadUrl: best.url,
    });
  }
  return out;
}

/** Search every keyword on every enabled provider; returns up to clipsPerKeyword per keyword. */
export async function searchFootage(
  keywords: string[],
  aspect: Aspect,
  stock: StockSettings,
): Promise<{ candidates: FootageCandidate[]; errors: string[] }> {
  const providers = stock.providers.filter((p) =>
    p === "pexels" ? stock.pexelsApiKey : stock.pixabayApiKey,
  );
  if (providers.length === 0) {
    throw new HttpError(400, "Add a Pexels or Pixabay API key in Settings and enable that provider");
  }

  const errors: string[] = [];
  const seen = new Set<string>();
  const candidates: FootageCandidate[] = [];

  const perKeyword = await Promise.all(
    keywords.map(async (keyword, i) => {
      const results = await Promise.all(
        providers.map((p) =>
          (p === "pexels" ? searchPexels : searchPixabay)(keyword, i, aspect, stock).catch((e) => {
            errors.push(e instanceof Error ? e.message : String(e));
            return [] as FootageCandidate[];
          }),
        ),
      );
      // Interleave providers so each keyword gets a mix when both are enabled.
      const mixed: FootageCandidate[] = [];
      for (let r = 0; mixed.length < results.flat().length; r++) {
        for (const list of results) if (list[r]) mixed.push(list[r]);
      }
      return mixed;
    }),
  );

  for (const list of perKeyword) {
    let taken = 0;
    for (const c of list) {
      if (taken >= stock.clipsPerKeyword) break;
      if (seen.has(c.key)) continue; // same clip found by an earlier keyword
      seen.add(c.key);
      candidates.push(c);
      taken++;
    }
  }
  return { candidates, errors };
}
