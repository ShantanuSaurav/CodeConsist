import React, { useCallback, useEffect, useState } from 'react';
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
    'Closures': `function counter() {
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
    'Comprehensions': `nums = list(range(1, 11))
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
      const res = await executeCode(draft.code, draft.language, undefined, [], {
        onProgress: setProgress
      });
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
    <section className="editor-section" id="compiler">
      <div className="section-head">
        <div>
          <span className="eyebrow">Playground</span>
          <h2 className="section-title">Run real code, right here</h2>
        </div>
        <p className="section-sub">
          JavaScript runs in a sandboxed Node process (or a Web Worker when the API is offline).
          Python is CPython compiled to WebAssembly. Nothing is simulated.
        </p>
      </div>

      <div className="editor-grid">
        <div className="editor-window">
          <div className="editor-titlebar">
            <div className="editor-title-left">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
              <span className="editor-filename">{FILE_NAMES[draft.language]}</span>
            </div>

            <div className="editor-title-right">
              <div className="segmented">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    className={draft.language === lang ? 'is-active' : ''}
                    onClick={() => switchLanguage(lang)}
                  >
                    {lang === 'javascript' ? 'JS' : 'PY'}
                  </button>
                ))}
              </div>

              <select
                aria-label="Load an example"
                value={draft.snippet ?? ''}
                onChange={(e) => e.target.value && loadSnippet(e.target.value)}
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

          <CodeEditor
            value={draft.code}
            onChange={setCode}
            language={draft.language}
            minRows={16}
            onSubmit={run}
            ariaLabel="Playground editor"
          />

          <div className="editor-actionbar">
            <span className="editor-engine">{compilerService.engineFor(draft.language)}</span>
            <button type="button" className="btn btn-solid btn-sm" disabled={isRunning} onClick={run}>
              {isRunning ? 'Running…' : '▶ Run  (Ctrl+Enter)'}
            </button>
          </div>
        </div>

        <div className="result-panel">
          <div className="result-head">
            <strong>Console</strong>
            <div className="result-head-right">
              {result?.time && <span className="result-time">{result.time}</span>}
              <span className={`result-status ${errored ? 'is-error' : 'is-ok'}`}>
                {isRunning ? '● running' : errored ? '● error' : '● ready'}
              </span>
            </div>
          </div>

          <pre className={`result-output ${errored ? 'is-error' : ''}`.trim()}>
            {isRunning
              ? progress || 'Running…'
              : result
                ? result.stderr || result.stdout || 'Program finished with no output.'
                : 'Press Run to execute this code.'}
          </pre>

          {serverStatus === 'offline' && draft.language === 'javascript' && (
            <p className="result-note">
              The API server is not running, so this uses the in-browser sandbox. Start it with{' '}
              <code>npm run dev:api</code> for the full experience.
            </p>
          )}

          <div className="result-foot">
            <span>Want tests and XP with it?</span>
            <button type="button" className="btn btn-line btn-sm" onClick={() => openPractice()}>
              Open a challenge →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
