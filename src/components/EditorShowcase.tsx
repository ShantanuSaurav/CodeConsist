import React, { useCallback, useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { ExecutionResult, SupportedLanguage } from '../types';
import { CodeEditor } from './CodeEditor';
import { compilerService } from '../services/compilerService';
import { STORAGE_KEYS, readJson, writeJson } from '../lib/storage';

const SNIPPETS: Record<string, Record<string, string>> = {
  javascript: {
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
  }
};

const LANGUAGES: SupportedLanguage[] = ['javascript', 'python'];

const FILE_NAMES: Partial<Record<SupportedLanguage, string>> = {
  javascript: 'playground.js',
  python: 'playground.py'
};

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

export const EditorShowcase: React.FC = () => {
  const { executeCode, openPractice, serverStatus } = useGame();

  const [draft, setDraft] = useState<Draft>(() => {
    const saved = readJson<Partial<Draft>>(STORAGE_KEYS.editor, {});
    const language = saved.language ?? 'javascript';
    const code = saved.code ?? SNIPPETS.javascript['Array pipeline'];
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
    const [firstName, firstText] = Object.entries(SNIPPETS[language] ?? {})[0] ?? ['', ''];
    setDraft({ language, code: firstText, snippet: firstName || null });
    setResult(null);
  };

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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
      {/* Editor */}
      <div className="xl:col-span-3 rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-[#161b22] shadow-xl flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-black/5 dark:border-white/5 bg-white dark:bg-[#0d1117]">
          <div className="flex items-center gap-3">
            <div className="flex space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
              <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
            </div>
            <span className="font-mono text-xs text-gray-500">{FILE_NAMES[draft.language]}</span>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="inline-flex rounded-lg border border-black/10 dark:border-white/10 overflow-hidden text-xs font-bold"
              role="group"
              aria-label="Language"
            >
              {LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => switchLanguage(lang)}
                  aria-pressed={draft.language === lang}
                  className={`px-3 py-1.5 transition-colors ${
                    draft.language === lang
                      ? 'bg-[var(--color-primary)] text-white dark:text-black'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {lang === 'javascript' ? 'JS' : 'PY'}
                </button>
              ))}
            </div>

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
          </div>
        </div>

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
            <span className={errored ? 'text-red-500' : 'text-[var(--color-primary)]'}>
              {isRunning ? '● running' : errored ? '● error' : '● ready'}
            </span>
          </div>
        </div>

        <pre
          className={`flex-1 m-0 p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words min-h-[16rem] overflow-auto ${
            errored ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'
          }`}
        >
          {isRunning
            ? progress || 'Running…'
            : result
              ? result.stderr || result.stdout || 'Program finished with no output.'
              : 'Press Run to execute this code.'}
        </pre>

        {serverStatus === 'offline' && draft.language === 'javascript' && (
          <p className="px-4 pb-3 text-xs text-gray-500">
            The API server is not running, so this uses the in-browser sandbox. Start it with{' '}
            <code className="font-mono">npm run dev:api</code> for the Node sandbox.
          </p>
        )}

        <div className="px-4 py-3 border-t border-black/5 dark:border-white/5 bg-white dark:bg-[#0d1117] flex items-center justify-between gap-3 text-sm">
          <span className="text-gray-600 dark:text-gray-400">Want tests and XP with it?</span>
          <button
            type="button"
            onClick={() => openPractice()}
            className="px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap"
          >
            Open a challenge →
          </button>
        </div>
      </div>
    </div>
  );
};
