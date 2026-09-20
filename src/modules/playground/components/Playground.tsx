import React, { useCallback, useEffect, useState } from 'react';
import { Play, RotateCcw, Trash2 } from 'lucide-react';
import { useSession } from '@/platform/session';
import { intents } from '@/platform/events';
import { ExecutionResult, SupportedLanguage } from '@/types';
import { Button, CodeEditor, Dropdown } from '@/ui';
import { compilerService } from '@/platform/execution/compilerService';
import { STORAGE_KEYS, readJson, writeJson } from '@/platform/storage/storage';

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

const LANGUAGE_LABELS: Record<string, string> = {
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

interface Draft {
  language: SupportedLanguage;
  code: string;
  /** Which example the editor currently holds, or null once it has been edited. */
  snippet: string | null;
}

/** The example whose text matches the code exactly, if any. */
function matchingSnippet(language: SupportedLanguage, code: string): string | null {
  const entry = Object.entries(SNIPPETS[language] ?? {}).find(([, text]) => text === code);
  return entry ? entry[0] : null;
}

function starterFor(language: SupportedLanguage): string {
  return SNIPPETS[language]?.['Hello World'] ?? Object.values(SNIPPETS[language] ?? {})[0] ?? '';
}

export const Playground: React.FC = () => {
  const { executeCode, serverStatus, judge0Configured, activeTrack } = useSession();
  // No saved draft yet: open on the language of the track the learner is
  // following, so the Playground picks up where Learn left off.
  const selectedLanguage = activeTrack.track.primaryLanguage;

  const [draft, setDraft] = useState<Draft>(() => {
    const saved = readJson<Partial<Draft>>(STORAGE_KEYS.editor, {});
    // No saved draft yet: open on whatever language track the learner is
    // currently practising, so the Playground picks up where Learn left off.
    // A previously saved draft's language always wins over this default.
    const language = LANGUAGES.includes(saved.language as SupportedLanguage)
      ? (saved.language as SupportedLanguage)
      : LANGUAGES.includes(selectedLanguage)
        ? selectedLanguage
        : 'javascript';
    const code = saved.code ?? starterFor(language);
    // Drafts saved before `snippet` existed work it out from the code.
    return { language, code, snippet: saved.snippet !== undefined ? saved.snippet : matchingSnippet(language, code) };
  });
  const [isRunning, setRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    writeJson(STORAGE_KEYS.editor, draft);
  }, [draft]);

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

  const switchLanguage = (language: SupportedLanguage) => {
    const text = starterFor(language);
    setDraft({ language, code: text, snippet: matchingSnippet(language, text) });
    setResult(null);
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
    setRunning(true);
    setProgress('');
    setResult(null);
    try {
      const res = await executeCode(draft.code, draft.language, undefined, [], { onProgress: setProgress });
      setResult(res);
    } catch (err: any) {
      setResult({ status: 'error', stderr: err?.message ?? String(err), testResults: [] });
    } finally {
      setRunning(false);
      setProgress('');
    }
  }, [draft, executeCode]);

  const errored = result?.status === 'error' || Boolean(result?.stderr);
  const needsJudge0 = !ALWAYS_AVAILABLE.includes(draft.language) && !judge0Configured;

  const statusLabel = isRunning ? 'running' : errored ? 'error' : needsJudge0 ? 'needs setup' : 'ready';
  const statusClass = isRunning ? 'text-info' : errored ? 'text-error' : needsJudge0 ? 'text-warning' : 'text-success';

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
          <span className="font-mono text-xs text-fg-secondary truncate pl-1">{FILE_NAMES[draft.language]}</span>

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
                hint: !ALWAYS_AVAILABLE.includes(lang) && !judge0Configured ? 'needs setup' : undefined
              }))}
              ariaLabel="Programming Language"
            />

            <Dropdown
              value={draft.snippet ?? ''}
              onChange={loadSnippet}
              placeholder="Custom code"
              size="sm"
              options={[
                { value: '', label: 'Custom code' },
                ...Object.keys(SNIPPETS[draft.language] ?? {}).map((name) => ({ value: name, label: name }))
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

        {needsJudge0 && (
          <div className="notice notice-warn m-3 mb-0 text-xs">
            {LANGUAGE_LABELS[draft.language]} needs a Judge0 endpoint configured on the API server. JavaScript and Python run with no
            setup. See <code>.env.example</code> for how to add one — Run still works and will explain this again if you try it.
          </div>
        )}

        <div className="p-3 flex-1 min-h-0">
          <CodeEditor
            value={draft.code}
            onChange={setCode}
            language={draft.language}
            minRows={16}
            onSubmit={run}
            ariaLabel="Playground editor"
          />
        </div>

        <div className="px-3 h-11 border-t border-border bg-surface-2 flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-fg-muted truncate pl-1">{compilerService.engineFor(draft.language)}</span>
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

        {serverStatus === 'offline' && draft.language === 'javascript' && (
          <p className="px-4 pb-3 text-xs text-fg-muted">
            The API server is not running, so this uses the in-browser sandbox. Start it with <code>npm run dev:api</code> for the
            Node sandbox.
          </p>
        )}
        {serverStatus === 'offline' && !ALWAYS_AVAILABLE.includes(draft.language) && (
          <p className="px-4 pb-3 text-xs text-fg-muted">
            The API server is not running, so {LANGUAGE_LABELS[draft.language]} cannot run right now. Start it with{' '}
            <code>npm run dev:api</code>.
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
