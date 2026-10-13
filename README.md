# Content Copilot

Turns a video idea into an editor-ready folder: script → stock-footage keywords → downloaded clips → voiceover → subtitles. It doesn't render a video. The editor gets the raw materials and cuts it in Premiere, Resolve, Final Cut or CapCut.

## How it's built

The app runs on Vercel, but **all files live on the editor's computer**:

| Step | Runs where |
| --- | --- |
| Script & keywords | Server → Gemini / OpenAI-compatible API |
| Footage search | Server → Pexels / Pixabay API |
| **Footage download** | **Browser**, straight from the Pexels/Pixabay CDN into the chosen folder |
| Voiceover | Server → Edge TTS or ElevenLabs; the audio comes back to the browser, which saves it |
| Subtitles, README, credits, zip | Browser |

- **No database and no file storage on the server.** Every API route is stateless.
- **Saving:** in Chrome or Edge on desktop, the browser writes straight into a folder the editor picks (File System Access API). Other browsers fall back to the browser's private storage, plus a "Download as .zip" button.
- **Settings and API keys** are saved in each editor's browser (`localStorage`) and sent with each request, never stored on the server.
- **Sharing setup:** fill in Settings once, then click **Create & copy team code**. It produces a passcode-encrypted code (PBKDF2 + AES-GCM); editors paste it with the passcode and they're set up.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

## Deploy to Vercel

Import the GitHub repo in Vercel. No environment variables are required.

## Voices

- **Edge voices:** free with no key. Fine for drafts, but it's an unofficial use of Microsoft's read-aloud service.
- **ElevenLabs:** best quality, and returns per-character timings for exact subtitles.
  - The free plan (10k credits/month) is **not licensed for commercial use**.
  - Starter or above is.
  - A ~50 s script uses ~800 credits.

## Output folder

```
<Project Title>/
  01_script/script.txt
  02_keywords/keywords.txt
  03_footage/01_<keyword>/pexels_<id>.mp4 …   + credits.csv
  04_voiceover/voiceover.mp3
  05_subtitles/subtitles.srt, subtitles.vtt, subtitles_word_by_word.srt
  README.txt          import + caption-styling steps for each editor
  .copilot/           app state (project.json, word timings); not needed for editing
```

The subtitles are plain SRT/VTT (text + timing only), so the editor picks font, size, colour and position in their editing software and can restyle them at any time.

## Code map

| What | Where |
| --- | --- |
| Server API (stateless) | `src/app/api/` → `src/lib/server/` (`llm.ts`, `stock.ts`, `edge-tts.ts`, `elevenlabs.ts`) |
| Browser storage, downloads, zip, settings | `src/lib/browser/` |
| Shared (subtitles, editor files) | `src/lib/subtitles.ts`, `src/lib/editor-files.ts` |
| UI | `src/components/` |
