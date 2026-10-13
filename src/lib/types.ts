export type Aspect = "9:16" | "16:9" | "1:1";
export type StockProvider = "pexels" | "pixabay";
export type FootageQuality = "720p" | "1080p" | "4k";

export interface Settings {
  projectsDir: string;
  llm: {
    provider: "gemini" | "openai";
    gemini: { apiKey: string; model: string };
    // Any OpenAI-compatible endpoint: OpenAI, Groq, OpenRouter, Ollama, ...
    openai: { apiKey: string; baseUrl: string; model: string };
  };
  stock: {
    pexelsApiKey: string;
    pixabayApiKey: string;
    providers: StockProvider[];
    clipsPerKeyword: number;
    minClipSeconds: number;
    quality: FootageQuality;
  };
  defaults: {
    aspect: Aspect;
    language: string;
    targetSeconds: number;
    keywordCount: number;
    voice: string;
    ratePercent: number;
    pitchHz: number;
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

export interface Project {
  version: 1;
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
    voice: string;
    ratePercent: number;
    pitchHz: number;
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
