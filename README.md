# Content Copilot

Turns a video idea into an editor-ready folder: script → stock-footage keywords → downloaded clips → voiceover → subtitles. It doesn't render a video. The editor gets the raw materials and cuts it in Premiere, Resolve, Final Cut or CapCut.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
```

Open **Settings** and add:
- a Gemini key, or any OpenAI-compatible endpoint (Groq, OpenRouter, Ollama…), for the script and keywords
- a Pexels and/or Pixabay key for footage

Voiceovers use free Microsoft Edge neural voices and need no key.

## Workflow

1. **New project**: the title becomes the folder name.
2. **Script**: generate with AI from a brief, or paste your own. Always editable.
3. **Keywords**: generate from the script, or type them. One search per line, in script order.
4. **Footage**: searches every keyword and previews clips (hover to play). Untick the ones you don't want, then download.
5. **Voiceover**: pick a voice, speed and pitch. Word timings are captured at the same time.
6. **Subtitles**: built from those word timings and matched word for word to the script, with line length and caption duration controls.
7. **Hand off**: open the folder directly, or download it as a .zip.

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

## Where things live

| What | Where |
| --- | --- |
| Settings & API keys | `data/settings.json` (git-ignored, mode 600; the browser only ever sees masked keys) |
| Projects | `projects/` by default (configurable in Settings) |
| Server logic | `src/lib/` (`llm.ts`, `stock.ts`, `tts.ts`, `subtitles.ts`, `export.ts`, `projects.ts`) |
| API | `src/app/api/` |
| UI | `src/components/` |
