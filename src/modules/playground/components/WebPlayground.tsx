import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Play, RotateCcw, Trash2 } from 'lucide-react';
import { SupportedLanguage } from '@/types';
import { Button, CodeEditor, Dropdown, Segmented, Switch } from '@/ui';
import { STORAGE_KEYS, readJson, writeJson } from '@/platform/storage/storage';
import {
  WEB_EXAMPLES,
  WebExample,
  WebFiles,
  WebTab,
  defaultExample,
  exampleById,
  matchingExample
} from './webExamples';

/* ==========================================================================
   Pure helpers
   --------------------------------------------------------------------------
   Everything above the component is a plain function with no DOM in it, which
   is the only way any of this is testable: jsdom never executes an iframe's
   scripts, so the document we hand the frame is the last thing we can check.
   ========================================================================== */

/** Tagged on every message so a page that happens to postMessage us is ignored. */
export const FRAME_MESSAGE_SOURCE = 'codeconsist-web-playground';

/** Console lines kept in memory. A `for (;;) console.log(i)` must not eat the tab. */
export const CONSOLE_LINE_CAP = 200;

/** Messages one frame may post before we stop relaying. Same reason, one hop earlier. */
export const FRAME_MESSAGE_BUDGET = 500;

/** How long a run may go without its end-of-body ping before we call it wedged. */
export const STALL_MS = 4000;

/** Debounce for auto-run. Long enough to type a word, short enough to feel live. */
export const AUTO_RUN_DELAY_MS = 700;

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

const CONSOLE_LEVELS: ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

export interface ConsoleEntry {
  id: number;
  level: ConsoleLevel;
  text: string;
}

export type FrameMessage =
  | { kind: 'console'; level: ConsoleLevel; text: string }
  /** Posted by a script sitting after the user's own, so it only arrives if theirs returned. */
  | { kind: 'ready' };

/**
 * Turns one console argument into a line of text.
 *
 * This function's SOURCE is injected into the sandboxed frame (see
 * `consolePrologue`), so it may not reference anything outside its own body -
 * no imports, no module constants, not even its own name. Everything it needs
 * is declared inside. The alternative was keeping the frame's serialiser as a
 * string of JavaScript and a TypeScript copy for the tests, which drift apart
 * the first time either is touched.
 *
 * It must not throw for any input. Once the console is patched, a throw here
 * takes down the learner's own `console.log` call, which is a baffling bug to
 * land on a beginner.
 */
export function serializeForConsole(value: unknown): string {
  const LIMIT = 2000;
  const MAX_ENTRIES = 50;
  const MAX_DEPTH = 3;
  const seen = new Set<unknown>();

  function render(v: any, depth: number, quoted: boolean): string {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';

    const type = typeof v;
    // Top-level strings print bare (that is what console.log does); nested ones
    // get quotes, so ['a, b'] is not mistaken for two entries.
    if (type === 'string') return quoted ? JSON.stringify(v) : v;
    if (type === 'number') return String(v);
    if (type === 'boolean') return String(v);
    if (type === 'bigint') return String(v) + 'n';
    if (type === 'symbol') return v.toString();
    if (type === 'function') return '[Function: ' + (v.name || 'anonymous') + ']';
    if (type !== 'object') return String(v);

    // Duck-typed rather than `instanceof Node`, because this same function runs
    // in the test process where there is no DOM at all.
    if (typeof v.nodeType === 'number' && typeof v.nodeName === 'string') {
      const id = v.id ? '#' + v.id : '';
      const cls =
        typeof v.className === 'string' && v.className.trim()
          ? '.' + v.className.trim().split(/\s+/).join('.')
          : '';
      return '<' + String(v.nodeName).toLowerCase() + id + cls + '>';
    }

    if (typeof v.message === 'string' && typeof v.stack === 'string') {
      return (v.name || 'Error') + ': ' + v.message;
    }

    if (seen.has(v)) return '[Circular]';

    const kind = Object.prototype.toString.call(v).slice(8, -1);
    if (kind === 'Date') {
      try {
        return v.toISOString();
      } catch (e) {
        return 'Invalid Date';
      }
    }
    if (kind === 'RegExp') return String(v);

    const isArray = Array.isArray(v);
    if (depth > MAX_DEPTH) return isArray ? '[Array]' : '[Object]';

    seen.add(v);
    try {
      if (isArray) {
        const parts = [];
        for (let i = 0; i < v.length && i < MAX_ENTRIES; i++) parts.push(render(v[i], depth + 1, true));
        if (v.length > MAX_ENTRIES) parts.push('... ' + (v.length - MAX_ENTRIES) + ' more');
        return '[' + parts.join(', ') + ']';
      }

      if (kind === 'Map' || kind === 'Set') {
        return kind + '(' + v.size + ')';
      }

      const keys = Object.keys(v);
      const parts = [];
      for (let i = 0; i < keys.length && i < MAX_ENTRIES; i++) {
        // A getter is free to throw. One bad property must not lose the object.
        let rendered;
        try {
          rendered = render(v[keys[i]], depth + 1, true);
        } catch (e) {
          rendered = '[throws]';
        }
        parts.push(keys[i] + ': ' + rendered);
      }
      if (keys.length > MAX_ENTRIES) parts.push('... ' + (keys.length - MAX_ENTRIES) + ' more');

      const ctor = v.constructor && v.constructor.name;
      const prefix = ctor && ctor !== 'Object' ? ctor + ' ' : '';
      return prefix + (parts.length ? '{ ' + parts.join(', ') + ' }' : '{}');
    } finally {
      // Removed on the way back up, so the same object appearing twice side by
      // side is printed twice rather than being called circular.
      seen.delete(v);
    }
  }

  try {
    const text = render(value, 0, false);
    return text.length > LIMIT ? text.slice(0, LIMIT) + '...' : text;
  } catch (e) {
    return '[unserializable value]';
  }
}

/**
 * Neutralise a closing tag inside raw text.
 *
 * `<script>` and `<style>` are raw-text elements: the HTML tokenizer ends them
 * at the first `</script` or `</style` it sees, even one inside a JavaScript
 * string or a comment. `<\/script>` is the identical string to a JS parser and
 * invisible to the tokenizer, which is why every bundler does exactly this.
 *
 * The replacer is a function so the match keeps its own casing - this is the
 * learner's text and we rewrite as little of it as we can get away with.
 */
export function escapeClosingTag(text: string, tag: 'script' | 'style'): string {
  return text.replace(new RegExp('</' + tag, 'gi'), (match) => '<\\' + match.slice(1));
}

/** Did the learner write a whole page, or just the bit that goes in the body? */
export function isFullDocument(html: string): boolean {
  return /^\s*<!DOCTYPE/i.test(html) || /<html[\s>]/i.test(html);
}

/**
 * Slice-and-join rather than `String.replace`, throughout.
 *
 * `replace` treats `$&`, `$1` and friends in the REPLACEMENT as patterns, and
 * the replacement here is the learner's own CSS and JavaScript - a regex
 * literal or a jQuery-ish `$1` in their code would be silently rewritten.
 */
function insertAfter(html: string, marker: RegExp, block: string): string | null {
  const match = html.match(marker);
  if (!match || match.index === undefined) return null;
  const at = match.index + match[0].length;
  return html.slice(0, at) + '\n' + block + html.slice(at);
}

function insertBefore(html: string, marker: RegExp, block: string): string | null {
  const match = html.match(marker);
  if (!match || match.index === undefined) return null;
  return html.slice(0, match.index) + block + '\n' + html.slice(match.index);
}

function injectIntoHead(html: string, block: string): string {
  return (
    insertAfter(html, /<head\b[^>]*>/i, block) ??
    insertAfter(html, /<html\b[^>]*>/i, '<head>\n' + block + '\n</head>') ??
    insertAfter(html, /<!DOCTYPE[^>]*>/i, block) ??
    block + '\n' + html
  );
}

function injectAtBodyEnd(html: string, block: string): string {
  return (
    insertBefore(html, /<\/body\s*>/i, block) ?? insertBefore(html, /<\/html\s*>/i, block) ?? html + '\n' + block
  );
}

/**
 * Replaced with a number once the document exists and we can count the lines
 * above the learner's script. See `composeDocument`.
 */
const JS_LINE_OFFSET_TOKEN = '__JS_LINE_OFFSET__';

/**
 * The prologue, first thing in <head> so it is already in place before any
 * inline script in the learner's HTML runs.
 *
 * `postMessage(..., '*')` looks lax and is not: the frame is sandboxed without
 * `allow-same-origin`, so it cannot know the parent's origin to name it, and
 * `parent` addresses exactly one window either way. The parent side is where
 * the checking happens - see `acceptFrameMessage`.
 */
function consolePrologue(runId: string): string {
  const source = JSON.stringify(FRAME_MESSAGE_SOURCE);
  const id = JSON.stringify(runId);
  // Belt and braces: the serialiser's own source is raw text in a <script>.
  const serializer = escapeClosingTag(serializeForConsole.toString(), 'script');

  return `<script>
(function () {
  var SOURCE = ${source};
  var RUN = ${id};
  var serialize = ${serializer};
  var budget = ${FRAME_MESSAGE_BUDGET};
  var jsOffset = ${JS_LINE_OFFSET_TOKEN};

  function send(payload) {
    payload.source = SOURCE;
    payload.runId = RUN;
    try { parent.postMessage(payload, '*'); } catch (e) {}
  }

  function relay(level, text) {
    if (budget <= 0) return;
    budget -= 1;
    if (budget === 0) {
      send({ kind: 'console', level: 'warn', text: 'Stopped relaying after ${FRAME_MESSAGE_BUDGET} console messages.' });
      return;
    }
    send({ kind: 'console', level: level, text: text });
  }

  function patch(level) {
    var original = console[level];
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      // Budget checked BEFORE serialising. Past the cap a tight logging loop
      // should cost nothing, and serialising a million objects is not nothing.
      if (budget > 0) {
        var parts = [];
        for (var i = 0; i < args.length; i++) parts.push(serialize(args[i]));
        relay(level, parts.join(' '));
      }
      if (typeof original === 'function') {
        try { original.apply(console, args); } catch (e) {}
      }
    };
  }

  patch('log'); patch('info'); patch('warn'); patch('error'); patch('debug');

  window.addEventListener('error', function (event) {
    // event.lineno counts lines in the COMPOSED document, which is not a file
    // the learner has ever seen. Subtract everything we put above their code
    // so the number matches script.js. An error from an inline script in their
    // HTML lands above the offset, and gets no line rather than a wrong one.
    var line = event && event.lineno ? event.lineno - jsOffset : 0;
    var where = line > 0 ? ' (script.js line ' + line + ')' : '';
    relay('error', (event && event.message ? event.message : 'Script error') + where);
  });

  window.addEventListener('unhandledrejection', function (event) {
    relay('error', 'Unhandled promise rejection: ' + serialize(event ? event.reason : undefined));
  });
})();
</script>`;
}

/**
 * Sits after the learner's script, so it runs only if theirs returned. That is
 * the whole infinite-loop detector: no ping, the frame is wedged.
 */
function readyEpilogue(runId: string): string {
  return `<script>
(function () {
  try { parent.postMessage({ source: ${JSON.stringify(FRAME_MESSAGE_SOURCE)}, runId: ${JSON.stringify(runId)}, kind: 'ready' }, '*'); } catch (e) {}
})();
</script>`;
}

/** The three files as one document, ready for the frame's `srcdoc`. */
export function composeDocument(files: WebFiles, runId: string): string {
  const prologue = consolePrologue(runId);
  const epilogue = readyEpilogue(runId);
  const style = files.css.trim() ? '<style>\n' + escapeClosingTag(files.css, 'style') + '\n</style>' : '';
  const script = files.js.trim() ? '<script>\n' + escapeClosingTag(files.js, 'script') + '\n</script>' : '';

  let doc: string;
  if (isFullDocument(files.html)) {
    // Their page, our instrumentation threaded through it - the CSS and JS
    // files still apply, because they are files in the same project.
    doc = injectIntoHead(files.html, style ? prologue + '\n' + style : prologue);
    doc = injectAtBodyEnd(doc, script ? script + '\n' + epilogue : epilogue);
  } else {
    doc = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      prologue,
      style,
      '</head>',
      '<body>',
      files.html,
      script,
      epilogue,
      '</body>',
      '</html>'
    ]
      .filter(Boolean)
      .join('\n');
  }

  // The offset can only be counted once the document is assembled, and the
  // token is a single word on one line, so swapping it for the number cannot
  // move anything onto a different line.
  return doc.split(JS_LINE_OFFSET_TOKEN).join(String(jsLineOffset(doc, script)));
}

/** How many lines sit above the first line of the learner's script.js. */
function jsLineOffset(doc: string, scriptBlock: string): number {
  if (!scriptBlock) return 0;
  const at = doc.indexOf(scriptBlock);
  if (at < 0) return 0;
  // Lines before the <script> line, plus the <script> line itself.
  return doc.slice(0, at).split('\n').length;
}

/**
 * The gate every message from the frame passes through.
 *
 * `event.origin` is worthless here: a sandboxed frame has an opaque origin, so
 * every one of them reports the string "null" and it identifies nothing.
 * Window identity is the real check. The run id on top of it is for the wedged
 * frame that finally unblocks and posts into a run that started ten seconds
 * later - without it, stale output lands in a fresh console.
 */
export function acceptFrameMessage(
  event: { data: unknown; source: unknown },
  frameWindow: unknown,
  expectedRunId: string
): FrameMessage | null {
  if (!frameWindow || event.source !== frameWindow) return null;

  const data = event.data as Record<string, unknown> | null;
  if (!data || typeof data !== 'object') return null;
  if (data.source !== FRAME_MESSAGE_SOURCE) return null;
  if (data.runId !== expectedRunId) return null;

  if (data.kind === 'ready') return { kind: 'ready' };
  if (data.kind !== 'console') return null;

  const level = CONSOLE_LEVELS.includes(data.level as ConsoleLevel) ? (data.level as ConsoleLevel) : 'log';
  const text = typeof data.text === 'string' ? data.text : serializeForConsole(data.text);
  return { kind: 'console', level, text };
}

/** Append, dropping from the front once the cap is reached. */
export function appendConsoleEntries(
  prev: ConsoleEntry[],
  incoming: ConsoleEntry[],
  cap: number = CONSOLE_LINE_CAP
): ConsoleEntry[] {
  const merged = prev.concat(incoming);
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}

/* ------------------------------------------------------------------ drafts */

export interface WebDraft {
  files: WebFiles;
  tab: WebTab;
  /** Which example the files came from, or null once they have been edited. */
  example: string | null;
  autoRun: boolean;
}

const TAB_VALUES: WebTab[] = ['html', 'css', 'js'];

export function fileFor(files: WebFiles, tab: WebTab): string {
  return files[tab];
}

export function withFile(files: WebFiles, tab: WebTab, text: string): WebFiles {
  return { ...files, [tab]: text };
}

/** A saved draft is whatever localStorage happened to hold - trust none of it. */
export function normalizeWebDraft(raw: unknown): WebDraft {
  const starter = defaultExample();
  const saved = (raw ?? {}) as Partial<WebDraft>;
  const savedFiles = (saved.files ?? {}) as Partial<WebFiles>;

  const files: WebFiles = {
    html: typeof savedFiles.html === 'string' ? savedFiles.html : starter.files.html,
    css: typeof savedFiles.css === 'string' ? savedFiles.css : starter.files.css,
    js: typeof savedFiles.js === 'string' ? savedFiles.js : starter.files.js
  };

  const tab = TAB_VALUES.includes(saved.tab as WebTab) ? (saved.tab as WebTab) : 'html';
  // Drafts written before `example` existed, and drafts naming an example that
  // has since been renamed, both work it out from the files themselves.
  const example = typeof saved.example === 'string' && exampleById(saved.example) ? saved.example : matchingExample(files);

  return { files, tab, example, autoRun: saved.autoRun !== false };
}

export function readWebDraft(): WebDraft {
  return normalizeWebDraft(readJson<unknown>(STORAGE_KEYS.webPlayground, null));
}

export function writeWebDraft(draft: WebDraft): void {
  writeJson(STORAGE_KEYS.webPlayground, draft);
}

/* ==========================================================================
   Component
   ========================================================================== */

const TABS: { value: WebTab; label: string; language: SupportedLanguage }[] = [
  { value: 'html', label: 'index.html', language: 'html' },
  { value: 'css', label: 'styles.css', language: 'css' },
  { value: 'js', label: 'script.js', language: 'javascript' }
];

const LEVEL_CLASS: Record<ConsoleLevel, string> = {
  log: 'text-fg',
  info: 'text-info',
  warn: 'text-warning',
  error: 'text-error',
  debug: 'text-fg-muted'
};

let runCounter = 0;

function nextRunId(): string {
  runCounter += 1;
  return `run-${Date.now().toString(36)}-${runCounter.toString(36)}`;
}

/**
 * Three files, a sandboxed preview and a console.
 *
 * Self-contained on purpose: Playground.tsx swaps this in whole when the
 * language selector reads 'web', so it owns its own draft and its own storage
 * key rather than threading state back through a parent that has none of the
 * same shape.
 */
export const WebPlayground: React.FC = () => {
  const [draft, setDraft] = useState<WebDraft>(() => readWebDraft());
  const [view, setView] = useState<'preview' | 'console'>('preview');
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [runId, setRunId] = useState('');
  const [doc, setDoc] = useState('');
  const [stalled, setStalled] = useState(false);

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const filesRef = useRef(draft.files);
  const runIdRef = useRef('');
  const viewRef = useRef(view);
  const readyRef = useRef(false);
  const entryId = useRef(0);
  const firstRun = useRef(true);

  filesRef.current = draft.files;
  viewRef.current = view;

  useEffect(() => {
    writeWebDraft(draft);
  }, [draft]);

  /** A run is a brand new frame: a wedged one is then always one click away from gone. */
  const run = useCallback(() => {
    const id = nextRunId();
    runIdRef.current = id;
    readyRef.current = false;
    setStalled(false);
    setEntries([]);
    setUnseen(0);
    setRunId(id);
    setDoc(composeDocument(filesRef.current, id));
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = acceptFrameMessage(event, frameRef.current?.contentWindow ?? null, runIdRef.current);
      if (!message) return;

      if (message.kind === 'ready') {
        readyRef.current = true;
        setStalled(false);
        return;
      }

      entryId.current += 1;
      const entry: ConsoleEntry = { id: entryId.current, level: message.level, text: message.text };
      setEntries((prev) => appendConsoleEntries(prev, [entry]));
      if (viewRef.current !== 'console') setUnseen((n) => n + 1);
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // First paint runs straight away so the pane is never blank; after that the
  // debounce applies, and only when auto-run is on.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      run();
      return;
    }
    if (!draft.autoRun) return;
    const timer = window.setTimeout(run, AUTO_RUN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft.files, draft.autoRun, run]);

  useEffect(() => {
    if (!runId) return;
    const timer = window.setTimeout(() => {
      if (!readyRef.current) setStalled(true);
    }, STALL_MS);
    return () => window.clearTimeout(timer);
  }, [runId]);

  const active = TABS.find((tab) => tab.value === draft.tab) ?? TABS[0];

  const setActiveFile = useCallback((text: string) => {
    setDraft((d) => {
      const files = withFile(d.files, d.tab, text);
      return { ...d, files, example: matchingExample(files) };
    });
  }, []);

  const loadExample = (id: string) => {
    const example: WebExample | undefined = exampleById(id);
    if (!example) return;
    setDraft((d) => ({ ...d, files: example.files, example: example.id }));
  };

  const resetFiles = useCallback(() => {
    setDraft((d) => {
      const example = exampleById(d.example) ?? defaultExample();
      return { ...d, files: example.files, example: example.id };
    });
  }, []);

  const clearFile = useCallback(() => {
    setDraft((d) => {
      const files = withFile(d.files, d.tab, '');
      return { ...d, files, example: matchingExample(files) };
    });
  }, []);

  const showConsole = () => {
    setView('console');
    setUnseen(0);
  };

  const errorCount = entries.filter((entry) => entry.level === 'error').length;
  const statusLabel = stalled ? 'not responding' : errorCount ? `${errorCount} error${errorCount > 1 ? 's' : ''}` : 'ready';
  const statusClass = stalled ? 'text-warning' : errorCount ? 'text-error' : 'text-success';
  const current = exampleById(draft.example);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 border border-border rounded-lg overflow-hidden bg-surface">
      {/* ------------------------------------------------------------- editor */}
      <div className="xl:col-span-3 flex flex-col min-w-0 xl:border-r border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 h-auto min-h-[44px] py-1.5 border-b border-border bg-surface-2">
          <Segmented
            value={draft.tab}
            onChange={(tab) => setDraft((d) => ({ ...d, tab }))}
            size="sm"
            ariaLabel="Open file"
            options={TABS.map((tab) => ({
              value: tab.value,
              label: <span className="font-mono">{tab.label}</span>,
              title: tab.label
            }))}
          />

          <div className="flex items-center gap-1.5 flex-wrap">
            <label className="sr-only" htmlFor="web-playground-example">
              Example
            </label>
            <Dropdown
              id="web-playground-example"
              value={draft.example ?? ''}
              onChange={loadExample}
              placeholder="Custom code"
              size="sm"
              options={[
                { value: '', label: 'Custom code', disabled: true },
                ...WEB_EXAMPLES.map((example) => ({ value: example.id, label: example.name }))
              ]}
              ariaLabel="Web examples"
            />

            <Button
              size="sm"
              variant="ghost"
              onClick={resetFiles}
              title={`Put all three files back to "${(current ?? defaultExample()).name}"`}
            >
              <RotateCcw size={13} />
              <span className="hidden sm:inline">Reset</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={clearFile} title={`Empty ${active.label}`}>
              <Trash2 size={13} />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          </div>
        </div>

        <div className="p-3 flex-1 min-h-0">
          <CodeEditor
            value={fileFor(draft.files, draft.tab)}
            onChange={setActiveFile}
            language={active.language}
            minRows={16}
            onSubmit={run}
            ariaLabel={`${active.label} editor`}
          />
        </div>

        <div className="px-3 h-11 border-t border-border bg-surface-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Switch
              id="web-playground-autorun"
              checked={draft.autoRun}
              onChange={(autoRun) => setDraft((d) => ({ ...d, autoRun }))}
              ariaLabel="Run automatically as you type"
            />
            <label htmlFor="web-playground-autorun" className="text-xs text-fg-muted truncate cursor-pointer">
              Auto-run
            </label>
          </div>

          <Button variant="primary" size="sm" onClick={run}>
            <Play size={13} />
            <span>Run</span>
            <kbd className="hidden sm:inline-block ml-1 !border-current/30 !bg-transparent !text-current opacity-70">
              Ctrl+Enter
            </kbd>
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------- preview pane */}
      <div className="xl:col-span-2 flex flex-col min-w-0 border-t xl:border-t-0 border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 h-auto min-h-[44px] py-1.5 border-b border-border bg-surface-2">
          <Segmented
            value={view}
            onChange={(next) => (next === 'console' ? showConsole() : setView('preview'))}
            size="sm"
            ariaLabel="Result view"
            options={[
              { value: 'preview', label: 'Preview' },
              {
                value: 'console',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    Console
                    {unseen > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[1.1rem] px-1 rounded-full bg-accent text-[0.6875rem] font-mono text-accent-fg">
                        <span className="sr-only">{unseen} unread messages</span>
                        <span aria-hidden="true">{unseen > 99 ? '99+' : unseen}</span>
                      </span>
                    )}
                  </span>
                )
              }
            ]}
          />

          <div className="flex items-center gap-2 text-xs font-mono">
            {view === 'console' && entries.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setEntries([])} title="Clear the console">
                <Eraser size={13} />
                <span className="hidden sm:inline">Clear</span>
              </Button>
            )}
            <span className={`inline-flex items-center gap-1.5 ${statusClass}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
              {statusLabel}
            </span>
          </div>
        </div>

        {stalled && (
          <div className="notice notice-warn m-3 mb-0 text-xs">
            The preview has not finished loading. A loop that never ends in <code>script.js</code> freezes this frame and
            nothing else - the app around it is fine, and anything the page logged before it hung is stuck in there with
            it. Fix the loop and press Run: every run builds a new frame, so the wedged one is thrown away.
          </div>
        )}

        <div className="flex-1 min-h-[16rem] bg-surface">
          {view === 'preview' ? (
            doc ? (
              // key={runId} is load-bearing: React tears the old element out and
              // mounts a new one, which is the only reliable way to abandon a
              // frame whose script is still spinning.
              <iframe
                key={runId}
                ref={frameRef}
                title="Web playground preview"
                srcDoc={doc}
                sandbox="allow-scripts"
                className="w-full h-full min-h-[16rem] border-0 block"
              />
            ) : (
              <p className="p-4 text-sm text-fg-muted">Press Run to render the page.</p>
            )
          ) : (
            <div
              className="h-full max-h-[32rem] overflow-auto p-4 font-mono text-[0.8125rem] leading-relaxed"
              role="log"
              aria-live="polite"
              aria-label="Console output"
            >
              {entries.length === 0 ? (
                <p className="text-fg-muted m-0">
                  Nothing logged yet. <code>console.log</code> from <code>script.js</code> shows up here.
                </p>
              ) : (
                entries.map((entry) => (
                  // Plain text nodes, never innerHTML: whatever the page logged is
                  // the learner's string, and a string that looks like markup is
                  // still a string.
                  <p key={entry.id} className={`m-0 whitespace-pre-wrap break-words ${LEVEL_CLASS[entry.level]}`}>
                    {entry.text}
                  </p>
                ))
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-border bg-surface-2 text-xs text-fg-muted">
          {current ? <span className="block">{current.blurb}</span> : null}
          <span className="block">Sandboxed frame: no network, no storage, no access to this app.</span>
        </div>
      </div>
    </div>
  );
};
