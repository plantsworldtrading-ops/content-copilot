import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { Settings } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

export const SECRET_FIELDS = [
  ["llm", "gemini", "apiKey"],
  ["llm", "openai", "apiKey"],
  ["stock", "pexelsApiKey"],
  ["stock", "pixabayApiKey"],
] as const;

export function defaultSettings(): Settings {
  return {
    projectsDir: path.join(process.cwd(), "projects"),
    llm: {
      provider: "gemini",
      gemini: { apiKey: "", model: "gemini-3.6-flash" },
      openai: { apiKey: "", baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini" },
    },
    stock: {
      pexelsApiKey: "",
      pixabayApiKey: "",
      providers: ["pexels"],
      clipsPerKeyword: 6,
      minClipSeconds: 4,
      quality: "1080p",
    },
    defaults: {
      aspect: "9:16",
      language: "English",
      targetSeconds: 50,
      keywordCount: 8,
      voice: "en-US-GuyNeural",
      ratePercent: 0,
      pitchHz: 0,
      charsPerLine: 32,
      linesPerCue: 1,
      maxCueSeconds: 3,
    },
  };
}

// Deep-merge saved values over defaults so new settings fields get sane values.
function merge<T>(base: T, override: unknown): T {
  if (Array.isArray(base) || typeof base !== "object" || base === null) {
    return (override === undefined ? base : override) as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  if (override && typeof override === "object") {
    for (const [k, v] of Object.entries(override)) {
      out[k] = k in out ? merge(out[k], v) : v;
    }
  }
  return out as T;
}

export async function readSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    return merge(defaultSettings(), JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return defaultSettings();
    throw err;
  }
}

export async function writeSettings(settings: Settings): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), { mode: 0o600 });
}

function getPath(obj: unknown, keys: readonly string[]): unknown {
  return keys.reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}

function setPath(obj: unknown, keys: readonly string[], value: unknown) {
  const parent = getPath(obj, keys.slice(0, -1)) as Record<string, unknown>;
  parent[keys[keys.length - 1]] = value;
}

export function maskSecret(value: string): string {
  if (!value) return "";
  return `••••${value.slice(-4)}`;
}

/** Settings safe to send to the browser: secrets are replaced by a mask. */
export function publicSettings(settings: Settings): Settings {
  const copy = structuredClone(settings);
  for (const keys of SECRET_FIELDS) {
    setPath(copy, keys, maskSecret(String(getPath(copy, keys) ?? "")));
  }
  return copy;
}

/**
 * Apply an update from the browser. A secret left as its mask keeps the stored
 * value; an empty string clears it.
 */
export function applySettingsUpdate(current: Settings, incoming: Settings): Settings {
  const next = merge(defaultSettings(), incoming);
  for (const keys of SECRET_FIELDS) {
    const value = String(getPath(next, keys) ?? "");
    if (value.startsWith("••••")) setPath(next, keys, getPath(current, keys));
    else setPath(next, keys, value.trim());
  }
  next.projectsDir = path.resolve(next.projectsDir.trim() || defaultSettings().projectsDir);
  return next;
}
