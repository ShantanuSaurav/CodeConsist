import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useSession } from '@/platform/session';
import { intents } from '@/platform/events';
import { ExecutionResult, SupportedLanguage } from '@/types';
import { Button, CodeEditor, Dropdown, Segmented, Switch } from '@/ui';
import { compilerService } from '@/platform/execution/compilerService';
import { STORAGE_KEYS, readJson, writeJson } from '@/platform/storage/storage';
import { LogEntry, WebFiles, WebPreview, buildDocument } from './WebPreview';
import { WEB_SNIPPETS, WEB_STARTER } from './webSnippets';

const SNIPPETS: Record<string, Record<string, string>> = {
  javascript: {
    'Hello World': `console.log("Hello World");`,
    'Array pipeline': `// Everything here runs in a real sandbox.
function solve(items) {
  console.log("input:", items);
  return items.map(n => n * 3).filter(n => n > 6);
}

console.log("result:", solve([1, 2, 3, 4, 5]));`,
    'Two sum': `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}

console.log(twoSum([2, 7, 11, 15], 9));`,
    Closures: `function counter() {
  let n = 0;
  return () => ++n;
}

const next = counter();
console.log(next(), next(), next());`
  },
  python: {
    'Hello World': `print("Hello World")`,
    Fibonacci: `# Real CPython, compiled to WebAssembly.
def fibonacci(n):
    a, b = 0, 1
    out = []
    for _ in range(n):
        out.append(a)
        a, b = b, a + b
    return out

print("fibonacci:", fibonacci(10))`,
    'Word frequency': `from collections import Counter

text = "the quick brown fox jumps over the lazy dog the fox"
counts = Counter(text.split())
for word, n in counts.most_common(3):
    print(f"{word}: {n}")`,
    Comprehensions: `nums = list(range(1, 11))
squares = [n * n for n in nums if n % 2]
pairs = {n: n * n for n in nums[:4]}

print("odd squares:", squares)
print("pairs:", pairs)`
  },
  java: {
    'Hello World': `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello World");
    }
}`,
    'Sum of a list': `import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<Integer> nums = Arrays.asList(2, 7, 11, 15);
        int total = 0;
        for (int n : nums) total += n;
        System.out.println("total: " + total);
    }
}`,
    'Read input': `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // Type into the Input box before pressing Run.
        Scanner in = new Scanner(System.in);
        String name = in.hasNextLine() ? in.nextLine() : "stranger";
        System.out.println("Hello, " + name + "!");
    }
}`
  },
  c: {
    'Hello World': `#include <stdio.h>

int main() {
    printf("Hello World\\n");
    return 0;
}`,
    'Sum an array': `#include <stdio.h>

int main() {
    int nums[] = {2, 7, 11, 15};
    int total = 0;
    for (int i = 0; i < 4; i++) total += nums[i];
    printf("total: %d\\n", total);
    return 0;
}`,
    'Read input': `#include <stdio.h>

int main() {
    // Type two numbers into the Input box before pressing Run.
    int a, b;
    if (scanf("%d %d", &a, &b) != 2) {
        printf("Enter two numbers in the Input box.\\n");
        return 0;
    }
    printf("%d + %d = %d\\n", a, b, a + b);
    return 0;
}`
  },
  cpp: {
    'Hello World': `#include <iostream>

int main() {
    std::cout << "Hello World" << std::endl;
    return 0;
}`,
    'Sum a vector': `#include <iostream>
#include <vector>
#include <numeric>

int main() {
    std::vector<int> nums = {2, 7, 11, 15};
    int total = std::accumulate(nums.begin(), nums.end(), 0);
    std::cout << "total: " << total << std::endl;
    return 0;
}`,
    'Read input': `#include <iostream>
#include <string>

int main() {
    // Type your name into the Input box before pressing Run.
    std::string name;
    if (!std::getline(std::cin, name) || name.empty()) name = "stranger";
    std::cout << "Hello, " << name << "!" << std::endl;
    return 0;
}`
  }
};

const LANGUAGES: SupportedLanguage[] = ['javascript', 'python', 'html', 'java', 'c', 'cpp'];

const LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  python: 'Python',
  html: 'HTML / CSS / JS',
  java: 'Java',
  c: 'C',
  cpp: 'C++'
};

const FILE_NAMES: Partial<Record<SupportedLanguage, string>> = {
  javascript: 'playground.js',
  python: 'playground.py',
  html: 'index.html',
  java: 'Main.java',
  c: 'main.c',
  cpp: 'main.cpp'
};

/** Languages that always work: they run in the browser, nothing to configure, ever. */
const ALWAYS_AVAILABLE: SupportedLanguage[] = ['javascript', 'python', 'html'];

type WebTab = keyof WebFiles;

const WEB_TABS: { value: WebTab; label: string; language: SupportedLanguage }[] = [
  { value: 'html', label: 'index.html', language: 'html' },
  { value: 'css', label: 'style.css', language: 'css' },
  { value: 'js', label: 'script.js', language: 'javascript' }
];

/** How long typing has to pause before the live preview reloads. */
const PREVIEW_DEBOUNCE_MS = 600;

interface Draft {
  language: SupportedLanguage;
  code: string;
  /** Which example the editor currently holds, or null once it has been edited. */
  snippet: string | null;
  /** The three files of the HTML / CSS / JS playground, kept separately from `code`. */
  web: WebFiles;
  webTab: WebTab;
  /** Standard input for compiled languages. */
  stdin: string;
}

function sameWeb(a: WebFiles, b: WebFiles): boolean {
  return a.html === b.html && a.css === b.css && a.js === b.js;
}

/** The example whose text matches the current code exactly, if any. */
function matchingSnippet(language: SupportedLanguage, code: string, web?: WebFiles): string | null {
  if (language === 'html') {
    if (!web) return null;
    return Object.entries(WEB_SNIPPETS).find(([, files]) => sameWeb(files, web))?.[0] ?? null;
  }
  const entry = Object.entries(SNIPPETS[language] ?? {}).find(([, text]) => text === code);
  return entry ? entry[0] : null;
}

function starterFor(language: SupportedLanguage): string {
  return SNIPPETS[language]?.['Hello World'] ?? Object.values(SNIPPETS[language] ?? {})[0] ?? '';
}

function isWebFiles(value: unknown): value is WebFiles {
  const v = value as WebFiles | undefined;
  return Boolean(v) && typeof v!.html === 'string' && typeof v!.css === 'string' && typeof v!.js === 'string';
}

const LOG_CLASS: Record<LogEntry['level'], string> = {
  log: 'text-fg',
  info: 'text-info',
  warn: 'text-warning',
  error: 'text-error'
};

export const Playground: React.FC = () => {
  const { executeCode, serverStatus, compiledLanguages, activeTrack } = useSession();
  // No saved draft yet: open on the language of the track the learner is
  // following, so the Playground picks up where Learn left off.
  const selectedLanguage = activeTrack.track.primaryLanguage;

  const [draft, setDraft] = useState<Draft>(() => {
    const saved = readJson<Partial<Draft>>(STORAGE_KEYS.editor, {});
    // A previously saved draft's language always wins over the track default.
    const language = LANGUAGES.includes(saved.language as SupportedLanguage)
      ? (saved.language as SupportedLanguage)
      : LANGUAGES.includes(selectedLanguage)
        ? selectedLanguage
        : 'javascript';
    const code = saved.code ?? starterFor(language);
    const web = isWebFiles(saved.web) ? saved.web : WEB_STARTER;
    return {
      language,
      code,
      web,
      webTab: saved.webTab && WEB_TABS.some((t) => t.value === saved.webTab) ? saved.webTab : 'html',
      stdin: typeof saved.stdin === 'string' ? saved.stdin : '',
      // Drafts saved before `snippet` existed work it out from the code.
      snippet: saved.snippet !== undefined ? saved.snippet : matchingSnippet(language, code, web)
    };
  });
  const [isRunning, setRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [progress, setProgress] = useState('');

  const isWeb = draft.language === 'html';

  useEffect(() => {
    writeJson(STORAGE_KEYS.editor, draft);
  }, [draft]);

  /* ------------------------------------------------------- web preview */

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [preview, setPreview] = useState(() => ({ runId: 1, doc: buildDocument(draft.web, 1) }));
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const refreshPreview = useCallback((files: WebFiles) => {
    setLogs([]);
    setPreview((p) => ({ runId: p.runId + 1, doc: buildDocument(files, p.runId + 1) }));
  }, []);

  useEffect(() => {
    if (!isWeb || !autoRefresh) return;
    const timer = setTimeout(() => refreshPreview(draft.web), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // Only the files matter here; refreshPreview is stable.
  }, [isWeb, autoRefresh, draft.web, refreshPreview]);

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => (prev.length >= 500 ? [...prev.slice(-499), entry] : [...prev, entry]));
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [logs]);

  /* ------------------------------------------------------------ editing */

  const setCode = useCallback((code: string) => {
    setDraft((d) => {
      if (d.language !== 'html') return { ...d, code, snippet: matchingSnippet(d.language, code) };
      const web = { ...d.web, [d.webTab]: code };
      return { ...d, web, snippet: matchingSnippet('html', '', web) };
    });
  }, []);

  const loadSnippet = (name: string) => {
    if (!name) {
      setDraft((d) => ({ ...d, snippet: null }));
      return;
    }
    if (isWeb) {
      const files = WEB_SNIPPETS[name];
      if (files) setDraft((d) => ({ ...d, web: files, snippet: name }));
      return;
    }
    const text = SNIPPETS[draft.language]?.[name];
    if (text !== undefined) setDraft((d) => ({ ...d, code: text, snippet: name }));
  };

  const switchLanguage = (language: SupportedLanguage) => {
    setResult(null);
    if (language === 'html') {
      // The web files survive a trip to another language and back.
      setDraft((d) => ({ ...d, language, snippet: matchingSnippet('html', '', d.web) }));
      return;
    }
    const text = starterFor(language);
    setDraft((d) => ({ ...d, language, code: text, snippet: matchingSnippet(language, text) }));
  };

  const clearCode = useCallback(() => {
    setDraft((d) =>
      d.language === 'html' ? { ...d, web: { ...d.web, [d.webTab]: '' }, snippet: null } : { ...d, code: '', snippet: null }
    );
    setResult(null);
  }, []);

  const resetCode = useCallback(() => {
    setDraft((d) => {
      if (d.language === 'html') return { ...d, web: WEB_STARTER, snippet: matchingSnippet('html', '', WEB_STARTER) };
      const text = starterFor(d.language);
      return { ...d, code: text, snippet: matchingSnippet(d.language, text) };
    });
    setResult(null);
  }, []);

  /* ---------------------------------------------------------------- run */

  const run = useCallback(async () => {
    if (draft.language === 'html') {
      refreshPreview(draft.web);
      return;
    }
    setRunning(true);
    setProgress('');
    setResult(null);
    try {
      const res = await executeCode(draft.code, draft.language, undefined, [], {
        onProgress: setProgress,
        stdin: ALWAYS_AVAILABLE.includes(draft.language) ? undefined : draft.stdin
      });
      setResult(res);
    } catch (err: any) {
      setResult({ status: 'error', stderr: err?.message ?? String(err), testResults: [] });
    } finally {
      setRunning(false);
      setProgress('');
    }
  }, [draft, executeCode, refreshPreview]);

  /* ------------------------------------------------------------- status */

  const isCompiled = !ALWAYS_AVAILABLE.includes(draft.language);
  const compilerReady = (lang: SupportedLanguage) => ALWAYS_AVAILABLE.includes(lang) || compiledLanguages.includes(lang);
  const unavailable = !compilerReady(draft.language);
  const unavailableHint = serverStatus === 'online' ? 'no compiler' : 'server offline';

  const errored = result?.status === 'error' || Boolean(result?.stderr);
  const statusLabel = isRunning ? 'running' : errored ? 'error' : unavailable ? unavailableHint : 'ready';
  const statusClass = isRunning ? 'text-info' : errored ? 'text-error' : unavailable ? 'text-warning' : 'text-success';

  const consoleText = isRunning
    ? progress || (isCompiled ? 'Compiling and running…' : 'Running…')
    : result
      ? [result.stdout && result.stderr ? result.stdout : '', result.stderr || result.stdout || 'Program finished with no output.']
          .filter(Boolean)
          .join('\n\n')
      : 'Press Run to execute this code.';

  const activeWebTab = WEB_TABS.find((t) => t.value === draft.webTab) ?? WEB_TABS[0];
  const editorValue = isWeb ? draft.web[draft.webTab] : draft.code;
  const editorLanguage = isWeb ? activeWebTab.language : draft.language;

  const snippetNames = useMemo(
    () => Object.keys(isWeb ? WEB_SNIPPETS : (SNIPPETS[draft.language] ?? {})),
    [isWeb, draft.language]
  );

  const engineLabel = isWeb ? 'Browser (sandboxed iframe)' : compilerService.engineFor(draft.language);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 border border-border rounded-lg overflow-hidden bg-surface">
      {/* ------------------------------------------------------------- editor */}
      <div className="xl:col-span-3 flex flex-col min-w-0 xl:border-r border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 h-auto min-h-[44px] py-1.5 border-b border-border bg-surface-2">
          {isWeb ? (
            <Segmented
              size="sm"
              ariaLabel="File"
              value={draft.webTab}
              onChange={(tab) => setDraft((d) => ({ ...d, webTab: tab }))}
              options={WEB_TABS.map((t) => ({ value: t.value, label: <span className="font-mono text-xs">{t.label}</span> }))}
            />
          ) : (
            <span className="font-mono text-xs text-fg-secondary truncate pl-1">{FILE_NAMES[draft.language]}</span>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            <label className="sr-only" htmlFor="playground-language">
              Language
            </label>
            <Dropdown
              id="playground-language"
              value={draft.language}
              onChange={(lang) => switchLanguage(lang as SupportedLanguage)}
              size="sm"
              options={LANGUAGES.map((lang) => ({
                value: lang,
                label: LANGUAGE_LABELS[lang],
                hint: compilerReady(lang) ? undefined : unavailableHint
              }))}
              ariaLabel="Programming Language"
            />

            <Dropdown
              value={draft.snippet ?? ''}
              onChange={loadSnippet}
              placeholder="Custom code"
              size="sm"
              options={[{ value: '', label: 'Custom code' }, ...snippetNames.map((name) => ({ value: name, label: name }))]}
              ariaLabel="Code Examples"
            />

            <Button size="sm" variant="ghost" onClick={resetCode} title="Reset to the starter code for this language">
              <RotateCcw size={13} />
              <span className="hidden sm:inline">Reset</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={clearCode} title={isWeb ? 'Clear this file' : 'Clear the editor'}>
              <Trash2 size={13} />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          </div>
        </div>

        {unavailable && (
          <div className="notice notice-warn m-3 mb-0 text-xs">
            {serverStatus === 'online' ? (
              <>
                The server has no {LANGUAGE_LABELS[draft.language]} compiler installed. Install one on the machine running the API
                (gcc/g++ for C and C++, a JDK for Java) and restart it.
              </>
            ) : (
              <>
                {LANGUAGE_LABELS[draft.language]} compiles on the API server, which is not reachable right now. JavaScript, Python and
                HTML / CSS / JS keep working in your browser.
              </>
            )}
          </div>
        )}

        <div className="p-3 flex-1 min-h-0">
          <CodeEditor
            // A fresh editor per file keeps undo history and cursor from leaking between tabs.
            key={isWeb ? `web-${draft.webTab}` : draft.language}
            value={editorValue}
            onChange={setCode}
            language={editorLanguage}
            minRows={16}
            onSubmit={run}
            ariaLabel={isWeb ? `Playground editor, ${activeWebTab.label}` : 'Playground editor'}
          />
        </div>

        <div className="px-3 h-11 border-t border-border bg-surface-2 flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-fg-muted truncate pl-1">{engineLabel}</span>
          <div className="flex items-center gap-3">
            {isWeb && (
              <label className="flex items-center gap-2 text-xs text-fg-secondary">
                <Switch checked={autoRefresh} onChange={setAutoRefresh} ariaLabel="Update the preview as you type" />
                Live
              </label>
            )}
            <Button variant="primary" size="sm" disabled={isRunning} onClick={run}>
              {isWeb ? <RefreshCw size={13} /> : <Play size={13} />}
              <span>{isWeb ? 'Refresh' : isRunning ? 'Running…' : 'Run'}</span>
              <kbd className="hidden sm:inline-block ml-1 !border-current/30 !bg-transparent !text-current opacity-70">Ctrl+Enter</kbd>
            </Button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------- preview / console */}
      {isWeb ? (
        <div className="xl:col-span-2 flex flex-col min-w-0 border-t xl:border-t-0 border-border">
          <div className="flex items-center justify-between px-4 h-11 border-b border-border bg-surface-2">
            <span className="text-sm font-medium text-fg">Preview</span>
            <span className="text-xs font-mono text-fg-muted">{autoRefresh ? 'live' : 'press Refresh'}</span>
          </div>
          <div className="flex-1 min-h-[20rem]">
            <WebPreview srcDoc={preview.doc} runId={preview.runId} onLog={addLog} />
          </div>
          <div className="flex items-center justify-between px-4 h-9 border-y border-border bg-surface-2">
            <span className="text-xs font-medium text-fg">Console</span>
            <button type="button" className="text-xs text-fg-muted hover:text-fg" onClick={() => setLogs([])}>
              Clear
            </button>
          </div>
          <div className="h-36 overflow-auto px-4 py-2 font-mono text-[0.8125rem] leading-relaxed" aria-live="polite">
            {logs.length === 0 ? (
              <span className="text-fg-muted">console.log output from script.js appears here.</span>
            ) : (
              logs.map((entry, i) => (
                <div key={i} className={`whitespace-pre-wrap break-words ${LOG_CLASS[entry.level]}`}>
                  {entry.text}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      ) : (
        <div className="xl:col-span-2 flex flex-col min-w-0 border-t xl:border-t-0 border-border">
          <div className="flex items-center justify-between px-4 h-11 border-b border-border bg-surface-2">
            <span className="text-sm font-medium text-fg">Console</span>
            <div className="flex items-center gap-3 text-xs font-mono">
              {result?.time && <span className="text-fg-muted truncate max-w-[14rem]">{result.time}</span>}
              <span className={`inline-flex items-center gap-1.5 ${statusClass}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                {statusLabel}
              </span>
            </div>
          </div>

          {isCompiled && (
            <div className="px-4 pt-3">
              <label htmlFor="playground-stdin" className="block text-xs font-medium text-fg-secondary mb-1">
                Input (stdin)
              </label>
              <textarea
                id="playground-stdin"
                value={draft.stdin}
                onChange={(e) => setDraft((d) => ({ ...d, stdin: e.target.value }))}
                rows={3}
                spellCheck={false}
                placeholder="Text your program reads with scanf / cin / Scanner"
                className="w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs text-fg focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>
          )}

          <pre
            className={`flex-1 m-0 p-4 font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap break-words min-h-[16rem] overflow-auto ${
              errored ? 'text-error' : 'text-fg'
            }`}
          >
            {consoleText}
          </pre>

          {serverStatus === 'offline' && draft.language === 'javascript' && (
            <p className="px-4 pb-3 text-xs text-fg-muted">
              The API server is not running, so this uses the in-browser sandbox. Start it with <code>npm run dev:api</code> for the
              Node sandbox.
            </p>
          )}

          <div className="px-4 h-11 border-t border-border bg-surface-2 flex items-center justify-between gap-3 text-sm">
            <span className="text-fg-muted text-xs">Want tests and XP with it?</span>
            <Button size="sm" variant="ghost" onClick={() => intents.openPractice()}>
              Open a challenge
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
