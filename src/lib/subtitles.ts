import type { WordTiming } from "./types";

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/**
 * Edge reports spoken words without punctuation. Map each timed word back onto
 * the original script so captions keep punctuation and casing exactly as written.
 */
export function alignToScript(script: string, words: WordTiming[]): WordTiming[] {
  const tokens = [...script.matchAll(/\S+/g)].map((m) => ({
    text: m[0],
    start: m.index!,
    end: m.index! + m[0].length,
  }));
  const lower = script.toLowerCase();
  const out: WordTiming[] = [];
  let cursor = 0;
  let nextToken = 0;

  for (const w of words) {
    const pos = w.text ? lower.indexOf(w.text.toLowerCase(), cursor) : -1;
    // Give up on matches far ahead (e.g. Edge expanded "30%" to "thirty percent").
    if (pos === -1 || pos - cursor > 80) {
      if (out.length) out[out.length - 1].end = Math.max(out[out.length - 1].end, w.end);
      else out.push({ ...w });
      continue;
    }
    cursor = pos + w.text.length;
    const ti = tokens.findIndex((t, i) => i >= nextToken - 1 && pos >= t.start && pos < t.end);
    if (ti === -1) continue;

    if (ti < nextToken) {
      // Another piece of a token already shown (e.g. "honey-dew"): extend its timing.
      out[out.length - 1].end = Math.max(out[out.length - 1].end, w.end);
      continue;
    }
    // Carry any script tokens Edge skipped so no written word is lost.
    const text = tokens
      .slice(nextToken, ti + 1)
      .map((t) => t.text)
      .join(" ");
    out.push({ text, start: w.start, end: w.end });
    nextToken = ti + 1;
  }
  if (out.length && nextToken < tokens.length) {
    out[out.length - 1].text += " " + tokens.slice(nextToken).map((t) => t.text).join(" ");
  }
  return out;
}

/** Break a caption into at most `lines` lines, keeping the longest line as short as possible. */
function wrap(words: string[], charsPerLine: number, lines: number): string {
  const single = words.join(" ");
  if (lines <= 1 || single.length <= charsPerLine || words.length < 2) return single;

  let best: string[] = [single];
  let bestWidth = Infinity;
  const search = (start: number, acc: string[]) => {
    if (acc.length === lines - 1 || start >= words.length) {
      const rest = words.slice(start).join(" ");
      const candidate = rest ? [...acc, rest] : acc;
      const width = Math.max(...candidate.map((l) => l.length));
      if (width < bestWidth) {
        bestWidth = width;
        best = candidate;
      }
      return;
    }
    for (let end = start + 1; end < words.length; end++) {
      search(end, [...acc, words.slice(start, end).join(" ")]);
    }
  };
  search(0, []);
  return best.join("\n");
}

/** Group timed words into readable caption cues. */
export function buildCues(
  words: WordTiming[],
  opts: { charsPerLine: number; linesPerCue: number; maxCueSeconds: number },
): Cue[] {
  const maxChars = opts.charsPerLine * opts.linesPerCue;
  const textLength = (ws: WordTiming[]) => ws.map((w) => w.text).join(" ").length;
  const fits = (ws: WordTiming[]) =>
    wrap(
      ws.map((w) => w.text),
      opts.charsPerLine,
      opts.linesPerCue,
    )
      .split("\n")
      .every((line) => line.length <= opts.charsPerLine);

  // 1. Split into phrases at sentence ends, clause punctuation and pauses.
  const phrases: WordTiming[][] = [];
  let phrase: WordTiming[] = [];
  for (const w of words) {
    if (phrase.length) {
      const prev = phrase[phrase.length - 1];
      const sentenceEnd = /[.!?…]["')\]]*$/.test(prev.text);
      const clauseEnd = /[,;:—–]["')\]]*$/.test(prev.text) && textLength(phrase) > maxChars * 0.75;
      if (sentenceEnd || clauseEnd || w.start - prev.end > 0.5) {
        phrases.push(phrase);
        phrase = [];
      }
    }
    phrase.push(w);
  }
  if (phrase.length) phrases.push(phrase);

  // 2. Split long phrases into evenly sized cues, so no cue ends up as one orphan word.
  const splitEvenly = (ph: WordTiming[], parts: number): WordTiming[][] => {
    const target = textLength(ph) / parts;
    const out: WordTiming[][] = [];
    let group: WordTiming[] = [];
    for (const w of ph) {
      if (group.length && out.length < parts - 1 && textLength([...group, w]) > target * 1.15) {
        out.push(group);
        group = [];
      }
      group.push(w);
    }
    if (group.length) out.push(group);
    return out;
  };
  const tooSlow = (g: WordTiming[]) => g.length > 1 && g[g.length - 1].end - g[0].start > opts.maxCueSeconds;

  const groups: WordTiming[][] = [];
  for (const ph of phrases) {
    let parts = Math.max(1, Math.ceil(textLength(ph) / maxChars));
    let split = splitEvenly(ph, parts);
    while (parts < ph.length && split.some((g) => !fits(g) || tooSlow(g))) {
      split = splitEvenly(ph, ++parts);
    }
    groups.push(...split);
  }

  const cues: Cue[] = groups.map((g) => ({
    start: g[0].start,
    end: g[g.length - 1].end,
    text: wrap(
      g.map((w) => w.text),
      opts.charsPerLine,
      opts.linesPerCue,
    ),
  }));

  // Hold each caption until the next one starts (max 0.6s) so it doesn't flicker off.
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1];
    const holdUntil = next ? next.start : cues[i].end + 0.6;
    cues[i].end = Math.max(cues[i].end, Math.min(holdUntil, cues[i].end + 0.6));
  }
  return cues;
}

export function wordCues(words: WordTiming[]): Cue[] {
  return words.map((w, i) => ({
    start: w.start,
    end: Math.min(Math.max(w.end, w.start + 0.15), words[i + 1]?.start ?? w.end + 0.3),
    text: w.text,
  }));
}

function timestamp(seconds: number, sep: "," | "."): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

export function toSrt(cues: Cue[]): string {
  return (
    cues
      .map((c, i) => `${i + 1}\n${timestamp(c.start, ",")} --> ${timestamp(c.end, ",")}\n${c.text}`)
      .join("\n\n") + "\n"
  );
}

export function toVtt(cues: Cue[]): string {
  return (
    "WEBVTT\n\n" +
    cues.map((c) => `${timestamp(c.start, ".")} --> ${timestamp(c.end, ".")}\n${c.text}`).join("\n\n") +
    "\n"
  );
}
