import React, { useCallback, useEffect, useState } from 'react';
import { Play, RotateCcw, Trash2 } from 'lucide-react';
import { useSession } from '@/platform/session';
import { intents } from '@/platform/events';
import { ExecutionResult, SupportedLanguage } from '@/types';
import { Button, CodeEditor, Dropdown } from '@/ui';
import { compilerService } from '@/platform/execution/compilerService';
import { STORAGE_KEYS, readJson, writeJson } from '@/platform/storage/storage';
import { WebPlayground } from './WebPlayground';

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
}`
  },
  c: {
    'Hello World': `#include <stdio.h>

int main() {
    printf("Hello World");
    return 0;
}`,
    'Sum an array': `#include <stdio.h>

int main() {
    int nums[] = {2, 7, 11, 15};
    int total = 0;
    for (int i = 0; i < 4; i++) total += nums[i];
    printf("total: %d", total);
    return 0;
}`
  },
  cpp: {
    'Hello World': `#include <iostream>

int main() {
    std::cout << "Hello World";
    return 0;
}`,
    'Sum a vector': `#include <iostream>
#include <vector>
#include <numeric>

int main() {
    std::vector<int> nums = {2, 7, 11, 15};
    int total = std::accumulate(nums.begin(), nums.end(), 0);
    std::cout << "total: " << total;
    return 0;
}`
  }
};

const LANGUAGES: SupportedLanguage[] = ['javascript', 'python', 'java', 'c', 'cpp'];

/**
 * What the selector offers. 'web' is deliberately NOT a `SupportedLanguage`:
 * that union is the content schema, so a challenge could claim to be written
 * in it and the grader, the validator and every track would have to have an
 * answer. Here it means one thing only - "show the other playground" - and it
 * stops at this file.
 */
type Mode = SupportedLanguage | 'web';

/** Selector order. The web mode comes first: it is the one a beginner wants. */
const MODES: Mode[] = ['web', ...LANGUAGES];

const LANGUAGE_LABELS: Record<string, string> = {
  web: 'HTML / CSS / JS',
  javascript: 'JavaScript',
  python: 'Python',
  java: 'Java',
  c: 'C',
  cpp: 'C++'
};

const FILE_NAMES: Partial<Record<SupportedLanguage, string>> = {
  javascript: 'playground.js',
  python: 'playground.py',
  java: 'Main.java',
  c: 'playground.c',
  cpp: 'playground.cpp'
};

/** Languages that always work: nothing to configure, ever. */
const ALWAYS_AVAILABLE: SupportedLanguage[] = ['javascript', 'python'];

/**
 * Languages whose programs read standard input.
 *
 * The first Java or C program most people write asks for a number with
 * Scanner or scanf. With nothing on stdin that program reads EOF and either
 * throws or prints garbage, which is a miserable first five minutes. The
 * browser engines have no stdin to feed, so they are not in the list.
 */
const STDIN_LANGUAGES: SupportedLanguage[] = ['java', 'c', 'cpp', 'go'];

/** Same cap the server applies (JUDGE0_STDIN_LIMIT), so the textarea cannot promise more than it sends. */
const STDIN_LIMIT = 10_000;

interface Draft {
  language: Mode;
  code: string;
  /** Which example the editor currently holds, or null once it has been edited. */
  snippet: string | null;
  /** What the program will read on stdin. Only sent for STDIN_LANGUAGES. */
  stdin: string;
}

/** The example whose text matches the code exactly, if any. */
function matchingSnippet(language: Mode, code: string): string | null {
  const entry = Object.entries(SNIPPETS[language] ?? {}).find(([, text]) => text === code);
  return entry ? entry[0] : null;
}

function starterFor(language: Mode): string {
  return SNIPPETS[language]?.['Hello World'] ?? Object.values(SNIPPETS[language] ?? {})[0] ?? '';
}

export const Playground: React.FC = () => {
  const { executeCode, serverStatus, judge0Configured, runtimes, activeTrack } = useSession();
  // No saved draft yet: open on the language of the track the learner is
  // following, so the Playground picks up where Learn left off.
  const selectedLanguage = activeTrack.track.primaryLanguage;

  const [draft, setDraft] = useState<Draft>(() => {
    const saved = readJson<Partial<Draft>>(STORAGE_KEYS.editor, {});
    // No saved draft yet: open on whatever language track the learner is
    // currently practising, so the Playground picks up where Learn left off.
    // A previously saved draft's language always wins over this default -
    // including 'web', which is why this checks MODES and not LANGUAGES.
    const language: Mode = MODES.includes(saved.language as Mode)
      ? (saved.language as Mode)
      : LANGUAGES.includes(selectedLanguage)
        ? selectedLanguage
        : 'javascript';
    const code = saved.code ?? starterFor(language);
    // Drafts saved before `snippet` and `stdin` existed work them out or
    // start empty; a draft written by an older build must still open.
    return {
      language,
      code,
      snippet: saved.snippet !== undefined ? saved.snippet : matchingSnippet(language, code),
      stdin: typeof saved.stdin === 'string' ? saved.stdin : ''
    };
  });
  const [isRunning, setRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [progress, setProgress] = useState('');
  // Open only when there is something in it, so an empty box stays out of the
  // way of the four languages that never use it.
  const [stdinOpen, setStdinOpen] = useState(() => Boolean(draft.stdin));

  useEffect(() => {
    writeJson(STORAGE_KEYS.editor, draft);
  }, [draft]);

  /**
   * Does this language have an engine right now?
   *
   * The rule itself lives in compilerService, because it is the same rule that
   * picks the engine line two lines below - and the same health probe feeds
   * both. Asking it here rather than re-deriving it from `runtimes` is what
   * keeps the selector's "needs setup" hint and `engineFor`'s label from ever
   * disagreeing about the same language.
   *
   * `runtimes` and `judge0Configured` are in the dependency list and nowhere in
   * the body on purpose: compilerService holds that state in a module variable,
   * which React cannot see, so these are what tell it to ask again once the
   * health probe has answered.
   */
  const isAvailable = useCallback(
    (language: SupportedLanguage): boolean => compilerService.runtimeAvailable(language),
    [runtimes, judge0Configured]
  );

  const setCode = useCallback(
    (code: string) => setDraft((d) => ({ ...d, code, snippet: matchingSnippet(d.language, code) })),
    []
  );

  const loadSnippet = (name: string) => {
    if (!name) {
      setDraft((d) => ({ ...d, snippet: null }));
      return;
    }
    const text = SNIPPETS[draft.language]?.[name];
    if (text !== undefined) setDraft((d) => ({ ...d, code: text, snippet: name }));
  };

  const switchMode = (mode: Mode) => {
    if (mode === draft.language) return;
    setResult(null);
    if (mode === 'web') {
      // The editor's code is kept rather than cleared: the web mode stores its
      // three files under its own key, so there is nothing here in its way.
      setDraft((d) => ({ ...d, language: 'web' }));
      return;
    }
    // Any other switch loads that language's starter, the same as it always
    // has - the code in the draft belongs to the language being left.
    const text = starterFor(mode);
    setDraft({ language: mode, code: text, snippet: matchingSnippet(mode, text), stdin: '' });
  };

  const clearCode = useCallback(() => {
    setDraft((d) => ({ ...d, code: '', snippet: null }));
    setResult(null);
  }, []);

  const resetCode = useCallback(() => {
    setDraft((d) => {
      const text = starterFor(d.language);
      return { ...d, code: text, snippet: matchingSnippet(d.language, text) };
    });
    setResult(null);
  }, []);

  const run = useCallback(async () => {
    // The web mode has its own Run button and its own frame; Ctrl+Enter in
    // this editor never reaches here while it is showing.
    if (draft.language === 'web') return;
    const language = draft.language;
    setRunning(true);
    setProgress('');
    setResult(null);
    try {
      const res = await executeCode(draft.code, language, undefined, [], {
        onProgress: setProgress,
        // Sent only where a program can read it; elsewhere it would be a field
        // the engine silently drops.
        stdin: STDIN_LANGUAGES.includes(language) ? draft.stdin : undefined
      });
      setResult(res);
    } catch (err: any) {
      setResult({ status: 'error', stderr: err?.message ?? String(err), testResults: [] });
    } finally {
      setRunning(false);
      setProgress('');
    }
  }, [draft, executeCode]);

  const languageSelector = (
    <>
      <label className="sr-only" htmlFor="playground-language">
        Language
      </label>
      <Dropdown
        id="playground-language"
        value={draft.language}
        onChange={(mode) => switchMode(mode as Mode)}
        size="sm"
        options={MODES.map((mode) => ({
          value: mode,
          label: LANGUAGE_LABELS[mode],
          // The web mode runs in this browser, so it can never need setup.
          hint: mode !== 'web' && !isAvailable(mode) ? 'needs setup' : undefined
        }))}
        ariaLabel="Programming Language"
      />
    </>
  );

  if (draft.language === 'web') {
    return (
      <div className="flex flex-col gap-3">
        {/* The selector gets its own strip here. WebPlayground brings a whole
            editor header of its own, and the one control it must not own is
            the way back out of it. */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 min-h-[44px] py-1.5 border border-border rounded-lg bg-surface-2">
          {/* Not the file names: the tab strip below is already showing them. */}
          <span className="text-xs text-fg-muted truncate pl-1">A web page, rendered as you type. Nothing to set up.</span>
          <div className="flex items-center gap-1.5 flex-wrap">{languageSelector}</div>
        </div>
        <WebPlayground />
      </div>
    );
  }

  // Narrowed by the return above: everything below this line is one language
  // in one editor.
  const language = draft.language;
  const usesStdin = STDIN_LANGUAGES.includes(language);
  const stdinLines = draft.stdin ? draft.stdin.replace(/\n+$/, '').split('\n').length : 0;

  const errored = result?.status === 'error' || Boolean(result?.stderr);
  const needsSetup = !isAvailable(language);

  const statusLabel = isRunning ? 'running' : errored ? 'error' : needsSetup ? 'needs setup' : 'ready';
  const statusClass = isRunning ? 'text-info' : errored ? 'text-error' : needsSetup ? 'text-warning' : 'text-success';

  const consoleText = isRunning
    ? progress || 'Running…'
    : result
      ? result.stderr || result.stdout || 'Program finished with no output.'
      : 'Press Run to execute this code.';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 border border-border rounded-lg overflow-hidden bg-surface">
      {/* ------------------------------------------------------------- editor */}
      <div className="xl:col-span-3 flex flex-col min-w-0 xl:border-r border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 h-auto min-h-[44px] py-1.5 border-b border-border bg-surface-2">
          <span className="font-mono text-xs text-fg-secondary truncate pl-1">{FILE_NAMES[language]}</span>

          <div className="flex items-center gap-1.5 flex-wrap">
            {languageSelector}

            <Dropdown
              value={draft.snippet ?? ''}
              onChange={loadSnippet}
              placeholder="Custom code"
              size="sm"
              options={[
                { value: '', label: 'Custom code' },
                ...Object.keys(SNIPPETS[language] ?? {}).map((name) => ({ value: name, label: name }))
              ]}
              ariaLabel="Code Examples"
            />

            <Button size="sm" variant="ghost" onClick={resetCode} title="Reset to the starter code for this language">
              <RotateCcw size={13} />
              <span className="hidden sm:inline">Reset</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={clearCode} title="Clear the editor">
              <Trash2 size={13} />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          </div>
        </div>

        {needsSetup && serverStatus !== 'offline' && (
          <div className="notice notice-warn m-3 mb-0 text-xs">
            {LANGUAGE_LABELS[language]} needs a Judge0 sandbox on the API server — free to run locally in Docker, with no
            account, no key and no code leaving this machine. <code>docs/RUNNING-JAVA-C-CPP.md</code> has the steps.
            HTML/CSS/JS, JavaScript and Python need no setup; Run still works and will explain this again if you try it.
          </div>
        )}

        <div className="p-3 flex-1 min-h-0">
          <CodeEditor
            value={draft.code}
            onChange={setCode}
            language={language}
            minRows={16}
            onSubmit={run}
            ariaLabel="Playground editor"
          />
        </div>

        {usesStdin && (
          // A <details> rather than a panel that is always there: four of the
          // five languages never read stdin, and the ones that do only need it
          // for some programs. Collapsed it is one line.
          <details
            className="px-3 pb-3 -mt-1"
            open={stdinOpen}
            onToggle={(event) => setStdinOpen(event.currentTarget.open)}
          >
            <summary className="text-xs text-fg-muted cursor-pointer select-none py-1">
              Input (stdin)
              {stdinLines > 0 && (
                <span className="text-fg-secondary">
                  {' · '}
                  {stdinLines} line{stdinLines > 1 ? 's' : ''}
                </span>
              )}
            </summary>
            <label className="sr-only" htmlFor="playground-stdin">
              Standard input for the program
            </label>
            <textarea
              id="playground-stdin"
              className="w-full mt-1 font-mono text-xs"
              rows={3}
              spellCheck={false}
              maxLength={STDIN_LIMIT}
              value={draft.stdin}
              onChange={(event) => setDraft((d) => ({ ...d, stdin: event.target.value }))}
              placeholder={'What the program reads, one value per line:\n5\n7'}
            />
            <p className="mt-1 mb-0 text-xs text-fg-muted">
              Read by <code>Scanner</code> in Java and <code>scanf</code> in C and C++. Leave it empty if the program asks
              for nothing.
            </p>
          </details>
        )}

        <div className="px-3 h-11 border-t border-border bg-surface-2 flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-fg-muted truncate pl-1">{compilerService.engineFor(language)}</span>
          <Button variant="primary" size="sm" disabled={isRunning} onClick={run}>
            <Play size={13} />
            <span>{isRunning ? 'Running…' : 'Run'}</span>
            <kbd className="hidden sm:inline-block ml-1 !border-current/30 !bg-transparent !text-current opacity-70">Ctrl+Enter</kbd>
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------ console */}
      <div className="xl:col-span-2 flex flex-col min-w-0 border-t xl:border-t-0 border-border">
        <div className="flex items-center justify-between px-4 h-11 border-b border-border bg-surface-2">
          <span className="text-sm font-medium text-fg">Console</span>
          <div className="flex items-center gap-3 text-xs font-mono">
            {result?.time && <span className="text-fg-muted">{result.time}</span>}
            <span className={`inline-flex items-center gap-1.5 ${statusClass}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
              {statusLabel}
            </span>
          </div>
        </div>

        <pre
          className={`flex-1 m-0 p-4 font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap break-words min-h-[16rem] overflow-auto ${
            errored ? 'text-error' : 'text-fg'
          }`}
        >
          {consoleText}
        </pre>

        {serverStatus === 'offline' && language === 'javascript' && (
          <p className="px-4 pb-3 text-xs text-fg-muted">
            The API server is not running, so this uses the in-browser sandbox. Start it with <code>npm run dev:api</code> for the
            Node sandbox.
          </p>
        )}
        {serverStatus === 'offline' && !ALWAYS_AVAILABLE.includes(language) && (
          <p className="px-4 pb-3 text-xs text-fg-muted">
            The API server is not running, so {LANGUAGE_LABELS[language]} cannot run right now: it compiles through the
            server's Judge0 sandbox, not in this browser. Start it with <code>npm run dev:api</code>.
          </p>
        )}

        <div className="px-4 h-11 border-t border-border bg-surface-2 flex items-center justify-between gap-3 text-sm">
          <span className="text-fg-muted text-xs">Want tests and XP with it?</span>
          <Button size="sm" variant="ghost" onClick={() => intents.openPractice()}>
            Open a challenge
          </Button>
        </div>
      </div>
    </div>
  );
};
