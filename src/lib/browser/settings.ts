"use client";

import type { Settings } from "../types";

const STORAGE_KEY = "content-copilot:settings";
const TEAM_CODE_PREFIX = "CCTEAM1:";
const PBKDF2_ITERATIONS = 250_000;

export function defaultSettings(): Settings {
  return {
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
    voice: {
      provider: "edge",
      edgeVoice: "en-US-GuyNeural",
      ratePercent: 0,
      pitchHz: 0,
      elevenlabs: {
        apiKey: "",
        model: "eleven_multilingual_v2",
        voiceId: "",
        voiceName: "",
        stability: 0.5,
        similarity: 0.75,
        speed: 1,
      },
    },
    defaults: {
      aspect: "9:16",
      language: "English",
      targetSeconds: 50,
      keywordCount: 8,
      charsPerLine: 32,
      linesPerCue: 1,
      maxCueSeconds: 3,
    },
  };
}

// Deep-merge saved values over defaults so new settings fields get sane values.
function merge<T>(base: T, override: unknown): T {
  if (Array.isArray(base) || typeof base !== "object" || base === null) {
    return (override === undefined || override === null ? base : override) as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  if (override && typeof override === "object" && !Array.isArray(override)) {
    for (const [k, v] of Object.entries(override)) {
      if (k in out) out[k] = merge(out[k], v);
    }
  }
  return out as T;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? merge(defaultSettings(), JSON.parse(raw)) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// ---- Team setup code: settings encrypted with a passcode (PBKDF2 + AES-GCM) ----

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(passcode: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createTeamCode(settings: Settings, passcode: string): Promise<string> {
  if (passcode.length < 6) throw new Error("Use a passcode of at least 6 characters");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passcode, salt);
  const plain = new TextEncoder().encode(JSON.stringify(settings));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const packed = new Uint8Array(salt.length + iv.length + cipher.length);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(cipher, salt.length + iv.length);
  return TEAM_CODE_PREFIX + toBase64(packed);
}

export async function readTeamCode(code: string, passcode: string): Promise<Settings> {
  const trimmed = code.trim().replace(/\s+/g, "");
  if (!trimmed.startsWith(TEAM_CODE_PREFIX)) throw new Error("That isn't a Content Copilot team code");
  let packed: Uint8Array<ArrayBuffer>;
  try {
    packed = fromBase64(trimmed.slice(TEAM_CODE_PREFIX.length));
  } catch {
    throw new Error("The team code is damaged; copy it again");
  }
  const salt = packed.slice(0, 16);
  const iv = packed.slice(16, 28);
  const key = await deriveKey(passcode, salt);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, packed.slice(28));
    return merge(defaultSettings(), JSON.parse(new TextDecoder().decode(plain)));
  } catch {
    throw new Error("Wrong passcode, or the code was changed");
  }
}

// ---- Tiny external store so components re-render when settings change (any tab) ----

let cached: Settings | null = null;
const listeners = new Set<() => void>();

export const settingsStore = {
  get(): Settings {
    cached ??= loadSettings();
    return cached;
  },
  getServer(): Settings | null {
    return null;
  },
  set(next: Settings) {
    saveSettings(next);
    cached = next;
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      cached = loadSettings();
      listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },
};
