// Reads the story model's JSON reply while it is still being written, so the
// app can show the title and the first lines before the last one exists.
//
// It knows only the reply's shape: an object whose string fields (title,
// intro) are reported when they close, and whose `segments` array is reported
// one element at a time, each the moment its closing brace arrives. Nothing
// is guessed from a half-written value; the final parsed reply stays the
// source of truth.

export interface ReplyScannerEvents {
  /** A top-level string field, complete. */
  field: (key: string, value: string) => void;
  /** One element of `segments`, complete, as parsed JSON. */
  segment: (raw: unknown) => void;
}

interface Frame {
  kind: "object" | "array";
  start: number;
  /** Objects: the key whose value is being read. */
  key: string | null;
  /** Objects: the next string is a key, not a value. */
  wantKey: boolean;
}

export function createReplyScanner(events: ReplyScannerEvents) {
  let text = "";
  let at = 0;
  const stack: Frame[] = [];
  let inString = false;
  let escaped = false;
  let stringStart = 0;

  const parse = (from: number, to: number): unknown => {
    try {
      return JSON.parse(text.slice(from, to));
    } catch {
      return undefined;
    }
  };

  return (delta: string) => {
    text += delta;
    for (; at < text.length; at++) {
      const char = text[at];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === "\"") {
          inString = false;
          const top = stack[stack.length - 1];
          const value = parse(stringStart, at + 1);
          if (typeof value !== "string" || !top || top.kind !== "object") continue;
          if (top.wantKey) {
            top.key = value;
            top.wantKey = false;
          } else if (stack.length === 1 && top.key) {
            events.field(top.key, value);
          }
        }
        continue;
      }
      switch (char) {
        case "\"":
          inString = true;
          stringStart = at;
          break;
        case "{":
        case "[":
          stack.push({ kind: char === "{" ? "object" : "array", start: at, key: null, wantKey: char === "{" });
          break;
        case "}":
        case "]": {
          const closed = stack.pop();
          if (closed?.kind === "object" && stack.length === 2 &&
              stack[1].kind === "array" && stack[0].key === "segments") {
            const raw = parse(closed.start, at + 1);
            if (raw !== undefined) events.segment(raw);
          }
          break;
        }
        case ",": {
          const top = stack[stack.length - 1];
          if (top?.kind === "object") top.wantKey = true;
          break;
        }
      }
    }
  };
}
