import type { ToolCall, ToolSchema } from '../providers/types.js';

/**
 * A rescue path for small local models that "call" a tool by printing it
 * instead of using the tool-call protocol.
 *
 * This is not hypothetical tidying. Every shape handled below was emitted by
 * phi4-mini:latest during verification, with correct schemas attached:
 *
 *   1. ```json { "name": "desktop", "arguments": {...} } ```
 *   2. files { "action": "write", "path": "...", "content": "..." }
 *   3. [{"name":"files","arguments":{...}}]{"success": true, ...}   <- invents
 *      its own tool RESULT after the call, so the buffer is two JSON values
 *   4. [{"type":"function","function":{"name":"memory","parameters":{...}}}]
 *
 * Each is a structurally correct request down the wrong channel. Without this
 * the user sees a JSON blob and nothing happens — the assistant appears to
 * describe an action it never took, which is the one failure mode worth real
 * effort to avoid.
 *
 * Anything that still cannot be parsed is reported as `retry`, and the planner
 * nudges the model once rather than showing the mess.
 *
 * The gate exists because content streams to the UI as it arrives: once a
 * fragment is emitted it cannot be recalled, so the opening characters of each
 * round are held back just long enough to tell prose from a call.
 */

/** Enough characters to see a full opening token before deciding. */
const DECIDE_AFTER = 24;

type Phase = 'undecided' | 'passthrough' | 'candidate';

export interface GateResult {
  calls: ToolCall[];
  /** Text still owed to the user. Empty when the buffer really was a call. */
  text: string;
  /** True when it clearly tried to call a tool but the shape was unreadable. */
  retry: boolean;
}

/**
 * Chat-template sentinels.
 *
 * phi4-mini finishes a good answer and then emits `<|tool_call|>` followed by
 * an invented call — or `<|user|>` and a whole imagined next turn. That is the
 * model leaking its own prompt format, and the user must never see it: it made
 * the assistant appear to be talking to itself.
 *
 * Everything from the first sentinel onwards is dropped.
 */
const SENTINEL = /<\|[a-z_]+\|>|<\/s>|\[\/INST\]/i;

/**
 * A tool call appended AFTER a finished answer.
 *
 * Observed verbatim: `The song "Yellow" is now playing.\n\n[{"name":"terminal",
 * "arguments":{"command":"date"}}]`. The round opened as prose, so the gate had
 * already committed to passing it through when the JSON arrived. Cutting at the
 * blob keeps the sentence and drops the machinery.
 *
 * The `"name"`/`"tool"`/`"function"` key is required, so ordinary prose that
 * merely contains a brace is unaffected.
 */
const TRAILING_CALL = /\[\s*\{\s*"(?:name|tool|function|type)"\s*:|\{\s*"(?:name|tool|function)"\s*:\s*"/;

/** Longest partial marker to hold back at a chunk boundary. */
const SENTINEL_TAIL = 24;

export class ProseToolGate {
  private phase: Phase = 'undecided';
  private buf = '';
  /** Set once a template sentinel is seen; everything after it is discarded. */
  private stopped = false;
  /** Characters withheld in case they are the start of a sentinel. */
  private held = '';
  private readonly allowed: string[];
  private readonly schemas: ToolSchema[];

  constructor(schemas: ToolSchema[]) {
    this.schemas = schemas;
    this.allowed = schemas.map((s) => s.function.name);
  }

  /**
   * Trims at a sentinel, holding back a possible partial one at the tail so a
   * sentinel split across two chunks is still caught.
   */
  private guard(text: string): string {
    if (this.stopped) return '';

    const all = this.held + text;

    const hit = all.match(SENTINEL) ?? all.match(TRAILING_CALL);
    if (hit) {
      this.stopped = true;
      this.held = '';
      return all.slice(0, hit.index);
    }

    /* `<`, `[` or `{` may open a marker that has not fully arrived yet, so the
       tail is withheld until the next chunk decides it. */
    const cut = Math.max(all.lastIndexOf('<'), all.lastIndexOf('[{'), all.lastIndexOf('{"'));
    if (cut >= 0 && all.length - cut < SENTINEL_TAIL) {
      this.held = all.slice(cut);
      return all.slice(0, cut);
    }

    this.held = '';
    return all;
  }

  /** Returns the text that is safe to show the user — possibly empty. */
  push(chunk: string): string {
    if (this.stopped) return '';
    if (this.phase === 'passthrough') return this.guard(chunk);

    this.buf += chunk;
    if (this.phase === 'candidate') return '';

    const head = this.buf.trimStart();
    if (!head) return '';

    if (head.startsWith('```') || head.startsWith('{') || head.startsWith('[')) {
      this.phase = 'candidate';
      return '';
    }

    /* A bare tool name followed by an argument blob or a call — "files {…}",
       "desktop.launch_app(…)". The punctuation requirement is what keeps a
       normal sentence like "Files are stored in…" flowing straight through. */
    if (startsWithToolCall(head, this.allowed)) {
      this.phase = 'candidate';
      return '';
    }

    // Not yet enough characters to be sure it is not one of the above.
    if (head.length < DECIDE_AFTER && !/\s/.test(head)) return '';

    this.phase = 'passthrough';
    const out = this.buf;
    this.buf = '';
    return this.guard(out);
  }

  /** Ends the round and decides what the buffer actually was. */
  end(): GateResult {
    const raw = this.buf;
    this.buf = '';

    // Whatever was withheld as a possible partial sentinel is safe now.
    const tail = this.stopped ? '' : this.held;
    this.held = '';

    if (this.phase !== 'candidate' || !raw.trim()) {
      const text = this.stopped
        ? ''
        : `${tail}${raw}`.split(SENTINEL)[0].split(TRAILING_CALL)[0];
      return { calls: [], text, retry: false };
    }

    const calls = parseProseToolCalls(raw, this.allowed);
    if (calls.length) return { calls, text: '', retry: false };

    const repaired = repairFromSchema(raw, this.schemas) ?? repairPositionalCall(raw, this.schemas);
    if (repaired) return { calls: [repaired], text: '', retry: false };

    /* Neither reading worked. Only withhold it if it really was an attempted
       call — otherwise this would eat a legitimate answer that happens to open
       with a fenced code block, which is common in a coding reply. */
    if (looksLikeAttempt(raw)) return { calls: [], text: '', retry: true };
    return { calls: [], text: raw, retry: false };
  }
}

/** "files {…}" / "write {…}" / "desktop.launch_app(…)" / "memory: {…}" */
function startsWithToolCall(head: string, allowed: string[]): boolean {
  const m = head.match(/^([a-zA-Z_][\w-]*)\s*([.:({[]|$)/);
  if (!m) return false;
  // A trailing empty match means the name is all we have so far — wait.
  if (m[2] === '') return false;
  // A brace directly after a leading word is a call shape whatever the word
  // is: models drop the tool name and lead with the action ("write {…}").
  if (m[2] === '{' || m[2] === '[') return true;
  return allowed.some((a) => a.toLowerCase() === m[1].toLowerCase());
}

/**
 * Did the model mean to call something?
 *
 * Used only after both readings failed, to choose between hiding the text and
 * retrying, or showing it. Erring towards showing keeps content; erring towards
 * retrying keeps JSON out of the transcript. The markers below are what an
 * attempted call has and ordinary prose does not.
 */
function looksLikeAttempt(raw: string): boolean {
  const head = raw.trimStart();

  const fence = head.match(/^```([a-z_]*)/i);
  if (fence) return ['', 'json', 'tool', 'tool_call', 'tool_code'].includes(fence[1].toLowerCase());

  /* Call syntax, keyword or positional: `Files(read="…")`,
     `files.write("notes.md", "hi")`. The opening quote/digit/`key=` is what
     separates it from prose that merely contains a parenthesis. */
  if (/^[a-zA-Z_][\w-]*(?:[.:][a-zA-Z_][\w-]*)?\s*\(\s*(?:["'\d]|[a-zA-Z_][\w-]*\s*=)/.test(head)) return true;

  const json = firstJsonValue(head);
  if (!json) return false;
  /* `success` and `result` are there because a model that fumbles a call often
     follows it by inventing the RESULT — a bare {"success": true} as the whole
     answer is a failed call, not something to show the user. */
  return /"(name|tool|tool_name|function|arguments|args|parameters|action|command|success|result)"\s*:/.test(json);
}

/**
 * Extracts the FIRST complete JSON value starting at `from`.
 *
 * A plain JSON.parse of the buffer fails on shape 3 above, where the model
 * appends an invented result after the call. Tracking depth — and ignoring
 * braces inside strings — takes the call and leaves the noise behind.
 */
function firstJsonValue(s: string, from = 0): string | null {
  const start = s.indexOf('{', from) >= 0 || s.indexOf('[', from) >= 0
    ? Math.min(
        ...[s.indexOf('{', from), s.indexOf('[', from)].filter((i) => i >= 0)
      )
    : -1;
  if (start < 0) return null;

  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null; // truncated
}

/** Strips a ```json … ``` fence if there is one. */
function unfence(raw: string): string {
  const fenced = raw.match(/```(?:json|tool_call|[a-z]*)?\s*([\s\S]*?)(?:```|$)/i);
  return (fenced ? fenced[1] : raw).trim();
}

/**
 * Maps a loosely-named tool onto a real one. Models pad names with the
 * description ("desktop Launch an application") or prefix them
 * ("functions.desktop"), so an exact match alone is too strict.
 */
function matchName(raw: unknown, allowed: string[]): string | null {
  const name = String(raw ?? '').trim().toLowerCase();
  if (!name) return null;
  const exact = allowed.find((a) => a.toLowerCase() === name);
  if (exact) return exact;
  // Longest first, so "desktop" cannot shadow a future "desktop_admin".
  return [...allowed].sort((a, b) => b.length - a.length)
    .find((a) => name.includes(a.toLowerCase())) ?? null;
}

const isArgsObject = (o: Record<string, any>) =>
  typeof o.action === 'string' || typeof o.command === 'string';

/** Turns one parsed JSON node into a call, if it is one. */
function toCall(node: unknown, allowed: string[], fallbackName: string | null): ToolCall | null {
  if (!node || typeof node !== 'object') return null;
  const o = node as Record<string, any>;

  const name =
    matchName(o.name ?? o.tool ?? o.tool_name ?? o.function?.name, allowed) ?? fallbackName;
  if (!name) return null;

  const argSource =
    o.arguments ?? o.args ?? o.parameters ??
    o.function?.arguments ?? o.function?.parameters ??
    // Shape 2: the object IS the arguments, the name came from the prefix.
    (isArgsObject(o) ? o : {});

  let args: Record<string, unknown> = {};
  if (typeof argSource === 'string') {
    try { args = JSON.parse(argSource); } catch { args = {}; }
  } else if (argSource && typeof argSource === 'object') {
    args = argSource as Record<string, unknown>;
  }

  // A call with no arguments at all is usually the model echoing the schema.
  if (!Object.keys(args).length) return null;

  return { id: crypto.randomUUID(), name, args };
}

/**
 * Last resort: work out which tool was meant from the SHAPE of the arguments.
 *
 * Observed from phi4-mini:
 *
 *   write {"text": "Sakhi UI test"} to clipboard.
 *
 * There is no tool named "write" — it is the *action*, and the tool name was
 * dropped. But `write` appears in exactly one schema's action enum that also
 * declares a `text` property, so the intended call is not ambiguous: it is
 * clipboard. Matching against the schemas rather than a list of patterns means
 * this stays correct as tools are added, and refuses as soon as two tools
 * could plausibly be meant.
 */
export function repairFromSchema(raw: string, schemas: ToolSchema[]): ToolCall | null {
  const body = unfence(raw);

  const extracted = extractJsonArgs(body) ?? extractCallSyntax(body);
  if (!extracted) return null;
  const { args } = extracted;

  const keys = Object.keys(args);
  if (!keys.length) return null;

  /* Every word in the line is a candidate name: the tool may lead ("files {…}"),
     trail ("…to clipboard"), or appear only as its action ("write {…}"). */
  const words: string[] = body.toLowerCase().match(/[a-z_]{3,}/g) ?? [];
  if (!words.length) return null;

  const hits: ToolCall[] = [];

  for (const s of schemas) {
    const params = s.function.parameters as any;
    const props = params?.properties ?? {};
    const propNames = Object.keys(props);

    // Every supplied argument must be a real parameter of this tool.
    if (!keys.every((k) => propNames.includes(k))) continue;

    /* Fill in required parameters the model dropped, but only from an enum and
       only when one of its values appears as a word — "write" completes
       clipboard's `action`. A free-text parameter is never invented. */
    const complete: Record<string, unknown> = { ...args };
    let satisfied = true;
    for (const req of (params?.required ?? []) as string[]) {
      if (req in complete) continue;
      const def = props[req];
      const value = Array.isArray(def?.enum)
        ? def.enum.find((v: unknown) => words.includes(String(v).toLowerCase()))
        : undefined;
      if (value === undefined) { satisfied = false; break; }
      complete[req] = value;
    }
    if (!satisfied) continue;

    /* Accept only if something actually pointed at THIS tool: its name was
       written somewhere, or one of its enum values was. Matching on argument
       shape alone would fire on any object. */
    const namedOutright = words.includes(s.function.name.toLowerCase());
    const filledFromWords = Object.keys(complete).length > keys.length;
    if (!namedOutright && !filledFromWords) continue;

    hits.push({ id: crypto.randomUUID(), name: s.function.name, args: complete });
  }

  // Ambiguity is a refusal. Guessing between two tools would run the wrong one.
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Positional call syntax: `files.write("notes.md", "hi")`,
 * `desktop.launch_app("chrome")`.
 *
 * Positional arguments are ambiguous in general, but not here — the schema
 * supplies the slot order. The method name fills the enum parameter, and the
 * remaining values fill the declared properties in order.
 *
 * Two things keep a wrong mapping from mattering: every required parameter must
 * end up filled or the whole reading is discarded, and the permission prompt
 * shows the user the resolved arguments before anything runs.
 */
export function repairPositionalCall(raw: string, schemas: ToolSchema[]): ToolCall | null {
  const body = unfence(raw);
  const m = body.match(/^\s*([a-zA-Z_][\w-]*)(?:[.:]([a-zA-Z_][\w-]*))?\s*\(([\s\S]*?)\)/);
  if (!m) return null;

  const [, rawName, method, inner] = m;
  // Keyword form is handled elsewhere and is unambiguous; do not double-read it.
  if (/[a-zA-Z_][\w-]*\s*=/.test(inner)) return null;

  const values: unknown[] = [];
  const literal = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(true|false)|(-?\d+(?:\.\d+)?)/g;
  let lit: RegExpExecArray | null;
  while ((lit = literal.exec(inner))) {
    if (lit[1] !== undefined) values.push(lit[1].replace(/\\(.)/g, '$1'));
    else if (lit[2] !== undefined) values.push(lit[2].replace(/\\(.)/g, '$1'));
    else if (lit[3] !== undefined) values.push(lit[3] === 'true');
    else values.push(Number(lit[4]));
  }
  /* Unquoted arguments: `browser(play_youtube,yellow coldplay)`.
     phi4-mini emits this shape often. With no quotes to delimit them, commas
     are the only separator available — and a value can contain spaces, so the
     split must be on commas alone, never on whitespace. */
  if (!values.length && inner.trim()) {
    const parts = inner.split(',').map((v) => v.trim()).filter(Boolean);
    // A sentence is not an argument list: anything long, or containing
    // sentence punctuation, is prose that merely looks like a call.
    const plausible = parts.every((v) => v.length <= 120 && !/[.!?]\s/.test(v));
    if (plausible) values.push(...parts);
  }

  if (!values.length) return null;

  const name = matchName(rawName, schemas.map((s) => s.function.name));
  if (!name) return null;
  const schema = schemas.find((s) => s.function.name === name);
  if (!schema) return null;

  const params = schema.function.parameters as any;
  const props: Record<string, any> = params?.properties ?? {};
  const required: string[] = params?.required ?? [];
  const args: Record<string, unknown> = {};

  /* The action arrives two ways: after a dot (`desktop.launch_app(...)`) or as
     the first positional value (`browser(play_youtube, ...)`). Same intent, so
     both fill the enum parameter. */
  const enumFor = (word: unknown) =>
    Object.keys(props).find(
      (p) => Array.isArray(props[p]?.enum) && props[p].enum.some((v: unknown) => String(v) === String(word))
    );

  const enumProp = enumFor(method);
  if (enumProp) {
    args[enumProp] = method;
  } else if (values.length) {
    const viaFirst = enumFor(values[0]);
    if (viaFirst) {
      args[viaFirst] = values[0];
      values.shift();
    }
  }

  /* A schema may name the parameter an unlabelled value belongs to for each
     action (`x-primary`). Without it, declaration order decides — which is
     wrong whenever a less likely parameter happens to be declared first. */
  const primaryMap = (params?.['x-primary'] ?? {}) as Record<string, string>;
  const chosenAction = enumProp ? args[enumProp] : args[enumFor(args[Object.keys(args)[0]]) ?? ''];
  const primary = primaryMap[String(chosenAction ?? args.action ?? '')];

  let slots = Object.keys(props).filter((p) => !(p in args));
  if (primary && slots.includes(primary)) {
    slots = [primary, ...slots.filter((p) => p !== primary)];
  }

  if (values.length > slots.length) return null;
  values.forEach((v, i) => { args[slots[i]] = v; });

  // An incomplete reading is worse than none: it would run a different call.
  if (!required.every((r) => r in args)) return null;

  return { id: crypto.randomUUID(), name, args };
}

/** The first JSON object in the text, as an argument bag. */
function extractJsonArgs(body: string): { args: Record<string, unknown> } | null {
  const json = firstJsonValue(body);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return { args: parsed as Record<string, unknown> };
  } catch {
    return null;
  }
}

/**
 * Keyword-call syntax, as in `Files(read="agent-test.txt", path=".")`.
 *
 * Another shape phi4-mini produces instead of a tool call. Values are read as
 * literals only — quoted strings, numbers, booleans — so nothing here evaluates
 * anything. The name and any unrecognised key stay in the text for the schema
 * matcher to consider as words.
 */
function extractCallSyntax(body: string): { args: Record<string, unknown> } | null {
  const m = body.match(/^\s*([a-zA-Z_][\w-]*)\s*\(([\s\S]*?)\)/);
  if (!m) return null;

  const args: Record<string, unknown> = {};
  const pair = /([a-zA-Z_][\w-]*)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|true|false|-?\d+(?:\.\d+)?)/g;
  let p: RegExpExecArray | null;
  while ((p = pair.exec(m[2]))) {
    const raw = p[2];
    let value: unknown = raw;
    if (raw.startsWith('"') || raw.startsWith("'")) {
      try { value = JSON.parse(`"${raw.slice(1, -1).replace(/"/g, '\\"')}"`); } catch { value = raw.slice(1, -1); }
    } else if (raw === 'true' || raw === 'false') value = raw === 'true';
    else value = Number(raw);
    args[p[1]] = value;
  }

  return Object.keys(args).length ? { args } : null;
}

export function parseProseToolCalls(raw: string, allowed: string[]): ToolCall[] {
  const body = unfence(raw);

  // A leading bare tool name supplies the name for a headless argument object.
  const prefix = body.match(/^([a-zA-Z_][\w-]*)\s*[.:]?\s*[({[]/);
  const fallbackName = prefix ? matchName(prefix[1], allowed) : null;

  const json = firstJsonValue(body);
  if (!json) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  const nodes = Array.isArray(parsed) ? parsed : [parsed];
  return nodes
    .map((n) => toCall(n, allowed, fallbackName))
    .filter((c): c is ToolCall => c !== null);
}
