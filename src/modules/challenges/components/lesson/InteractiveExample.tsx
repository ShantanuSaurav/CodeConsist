import React, { useCallback, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { CodeEditor } from '@/ui';
import { useSession } from '@/platform/session';
import type { ExecutionResult, TryItExample } from '@/types';
import { UiPreview } from '../UiPreview';

interface InteractiveExampleProps {
  tryIt: TryItExample;
}

/**
 * "Try it" - a tiny, UNGRADED sandbox so a beginner can poke at the idea
 * (change a value, add a line) and see real output before being quizzed on
 * it. Runs through the same executeCode path as everything else in the app,
 * so the output is real, never simulated - it just never awards XP or
 * records a solve. A language with no engine here (C without a Judge0
 * endpoint) gets the server's honest "needs a compiler" message, exactly
 * like the Playground would.
 */
export const InteractiveExample: React.FC<InteractiveExampleProps> = ({ tryIt }) => {
  const { executeCode } = useSession();
  const [code, setCode] = useState(tryIt.starterCode);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);

  const isUi = Boolean(tryIt.ui || tryIt.language === 'html');

  const run = useCallback(async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await executeCode(code, tryIt.language);
      setResult(res);
    } catch (err: any) {
      setResult({ status: 'error', stderr: err?.message ?? String(err), testResults: [] });
    } finally {
      setRunning(false);
    }
  }, [code, executeCode, tryIt.language]);

  const reset = () => {
    setCode(tryIt.starterCode);
    setResult(null);
  };

  const errored = result?.status === 'error' || Boolean(result?.stderr);

  return (
    <div className="try-it">
      <div className="try-it-head">
        <span className="try-it-badge">Try it</span>
        <p className="try-it-instructions">{tryIt.instructions}</p>
      </div>

      <div className="try-it-editor">
        <CodeEditor value={code} onChange={setCode} language={tryIt.language} minRows={isUi ? 8 : 5} onSubmit={run} />
      </div>

      <div className="try-it-actions">
        <button type="button" className="btn btn-solid btn-sm" onClick={run} disabled={running}>
          <Play size={13} />
          <span>{running ? 'Running…' : isUi ? 'Update & Run' : 'Run it'}</span>
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
          <RotateCcw size={13} />
          <span>Reset</span>
        </button>
      </div>

      {isUi && (
        <div className="try-it-ui-preview">
          <UiPreview html={code} minHeight={260} badgeText="Interactive Preview" />
        </div>
      )}

      {result && (result.stderr || result.stdout) && (
        <pre className={`try-it-output ${errored ? 'is-error' : ''}`}>
          {result.stderr || result.stdout}
        </pre>
      )}
    </div>
  );
};
