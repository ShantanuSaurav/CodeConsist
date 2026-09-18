import React, { useCallback, useEffect, useState } from 'react';
import { Play, RotateCcw, Trash2 } from 'lucide-react';
import { useSession } from '@/platform/session';
import { intents } from '@/platform/events';
import { ExecutionResult, SupportedLanguage } from '@/types';
import { CodeEditor } from '@/ui/primitives/CodeEditor';
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

  const statusLabel = isRunning ? '● running' : errored ? '● error' : needsJudge0 ? '● needs setup' : '● ready';
  const statusClass = isRunning
    ? 'text-[var(--color-secondary)]'
    : errored
      ? 'text-red-500'
      : needsJudge0
        ? 'text-[var(--color-warning)]'
        : 'text-[var(--color-primary)]';

  const consoleText = isRunning
    ? progress || 'Running…'
    : result
      ? result.stderr || result.stdout || 'Program finished with no output.'
      : 'Press Run to execute this code.';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
      {/* Editor */}
      <div className="xl:col-span-3 rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-[#161b22] shadow-xl flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-black/5 dark:border-white/5 bg-white dark:bg-[#0d1117]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex space-x-2 shrink-0">
              <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
              <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
            </div>
            <span className="font-mono text-xs text-gray-500 truncate">{FILE_NAMES[draft.language]}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="sr-only" htmlFor="playground-language">
              Language
            </label>
            <select
              id="playground-language"
              value={draft.language}
              onChange={(e) => switchLanguage(e.target.value as SupportedLanguage)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-[#0d1117] border border-black/10 dark:border-white/10 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[var(--color-primary)]"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                  {!ALWAYS_AVAILABLE.includes(lang) && !judge0Configured ? ' (needs setup)' : ''}
                </option>
              ))}
            </select>

            <select
              aria-label="Load an example"
              value={draft.snippet ?? ''}
              onChange={(e) => e.target.value && loadSnippet(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-[#0d1117] border border-black/10 dark:border-white/10 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[var(--color-primary)]"
            >
              <option value="" disabled={draft.snippet !== null}>
                {draft.snippet === null ? 'Custom code' : 'Examples…'}
              </option>
              {Object.keys(SNIPPETS[draft.language] ?? {}).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={resetCode}
              title="Reset to the starter code for this language"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5"
            >
              <RotateCcw size={12} />
              <span className="hidden sm:inline">Reset</span>
            </button>

            <button
              type="button"
              onClick={clearCode}
              title="Clear the editor"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Trash2 size={12} />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </div>

        {needsJudge0 && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-lg text-xs bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 text-amber-700 dark:text-amber-300">
            {LANGUAGE_LABELS[draft.language]} needs a Judge0 endpoint configured on the API server. JavaScript and
            Python run with no setup. See <code className="font-mono">.env.example</code> for how to add one — Run
            still works and will explain this again if you try it.
          </div>
        )}

        <div className="p-3 flex-1">
          <CodeEditor
            value={draft.code}
            onChange={setCode}
            language={draft.language}
            minRows={16}
            onSubmit={run}
            ariaLabel="Playground editor"
          />
        </div>

        <div className="px-4 py-3 border-t border-black/5 dark:border-white/5 bg-white dark:bg-[#0d1117] flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-gray-500 truncate">{compilerService.engineFor(draft.language)}</span>
          <button
            type="button"
            disabled={isRunning}
            onClick={run}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] text-white dark:text-black font-bold rounded-lg text-sm hover:brightness-110 transition disabled:opacity-50"
          >
            <Play size={14} />
            <span>{isRunning ? 'Running…' : 'Run'}</span>
            <span className="hidden sm:inline font-mono text-[10px] opacity-70 border border-current/30 rounded px-1">Ctrl+Enter</span>
          </button>
        </div>
      </div>

      {/* Console */}
      <div className="xl:col-span-2 rounded-2xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-[#161b22] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5 bg-white dark:bg-[#0d1117]">
          <strong className="text-sm text-gray-900 dark:text-white">Console</strong>
          <div className="flex items-center gap-3 text-xs font-mono">
            {result?.time && <span className="text-gray-500">{result.time}</span>}
            <span className={statusClass}>{statusLabel}</span>
          </div>
        </div>

        <pre
          className={`flex-1 m-0 p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words min-h-[16rem] overflow-auto ${
            errored ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'
          }`}
        >
          {consoleText}
        </pre>

        {serverStatus === 'offline' && draft.language === 'javascript' && (
          <p className="px-4 pb-3 text-xs text-gray-500">
            The API server is not running, so this uses the in-browser sandbox. Start it with{' '}
            <code className="font-mono">npm run dev:api</code> for the Node sandbox.
          </p>
        )}
        {serverStatus === 'offline' && !ALWAYS_AVAILABLE.includes(draft.language) && (
          <p className="px-4 pb-3 text-xs text-gray-500">
            The API server is not running, so {LANGUAGE_LABELS[draft.language]} cannot run right now. Start it with{' '}
            <code className="font-mono">npm run dev:api</code>.
          </p>
        )}

        <div className="px-4 py-3 border-t border-black/5 dark:border-white/5 bg-white dark:bg-[#0d1117] flex items-center justify-between gap-3 text-sm">
          <span className="text-gray-600 dark:text-gray-400">Want tests and XP with it?</span>
          <button
            type="button"
            onClick={() => intents.openPractice()}
            className="px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap"
          >
            Open a challenge →
          </button>
        </div>
      </div>
    </div>
  );
};
