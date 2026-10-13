export type Aspect = "9:16" | "16:9" | "1:1";
export type StockProvider = "pexels" | "pixabay";
export type FootageQuality = "720p" | "1080p" | "4k";
export type VoiceProvider = "edge" | "elevenlabs";

export interface LlmSettings {
  provider: "gemini" | "openai";
  gemini: { apiKey: string; model: string };
  // Any OpenAI-compatible endpoint: OpenAI, Groq, OpenRouter, Ollama, ...
  openai: { apiKey: string; baseUrl: string; model: string };
}

export interface StockSettings {
  pexelsApiKey: string;
  pixabayApiKey: string;
  providers: StockProvider[];
  clipsPerKeyword: number;
  minClipSeconds: number;
  quality: FootageQuality;
}

export interface ElevenLabsSettings {
  apiKey: string;
  model: string;
  voiceId: string;
  voiceName: string;
  stability: number;
  similarity: number;
  speed: number;
}

export interface VoiceSettings {
  provider: VoiceProvider;
  edgeVoice: string;
  ratePercent: number;
  pitchHz: number;
  elevenlabs: ElevenLabsSettings;
}

/** Lives in each editor's browser (localStorage); shared via an encrypted team code. */
export interface Settings {
  llm: LlmSettings;
  stock: StockSettings;
  voice: VoiceSettings;
  defaults: {
    aspect: Aspect;
    language: string;
    targetSeconds: number;
    keywordCount: number;
    charsPerLine: number;
    linesPerCue: number;
    maxCueSeconds: number;
  };
}

export interface FootageCandidate {
  key: string; // `${provider}:${id}`
  provider: StockProvider;
  id: string;
  keyword: string;
  keywordIndex: number;
  pageUrl: string;
  author: string;
  authorUrl: string;
  duration: number;
  width: number;
  height: number;
  thumbnail: string;
  previewUrl: string;
  downloadUrl: string;
}

export interface DownloadedClip extends FootageCandidate {
  file: string; // relative to the project folder
  bytes: number;
  downloadedAt: string;
}

export interface WordTiming {
  text: string;
  start: number; // seconds
  end: number;
}

export interface VoiceoverResult {
  audioBase64: string;
  words: WordTiming[];
  durationSec: number;
}

export interface Project {
  version: 2;
  id: string; // folder name
  title: string;
  createdAt: string;
  updatedAt: string;
  aspect: Aspect;
  topic: string;
  language: string;
  targetSeconds: number;
  script: string;
  keywords: string[];
  footage: {
    searchedAt?: string;
    candidates: FootageCandidate[];
    downloads: DownloadedClip[];
  };
  voiceover?: {
    provider: VoiceProvider;
    voice: string;
    voiceLabel: string;
    file: string;
    durationSec: number;
    generatedAt: string;
    scriptSnapshot: string;
  };
  subtitles?: {
    charsPerLine: number;
    linesPerCue: number;
    maxCueSeconds: number;
    files: string[];
    cueCount: number;
    generatedAt: string;
  };
}

export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt: string;
  steps: StepStatus;
}

export interface StepStatus {
  script: boolean;
  keywords: boolean;
  footage: boolean;
  voiceover: boolean;
  subtitles: boolean;
}

export const FOLDERS = {
  script: "01_script",
  keywords: "02_keywords",
  footage: "03_footage",
  voiceover: "04_voiceover",
  subtitles: "05_subtitles",
} as const;

export const STATE_DIR = ".copilot";
