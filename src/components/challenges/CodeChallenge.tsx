import React from 'react';
import { Challenge, ExecutionResult } from '../../types';
import { CodeEditor } from '../CodeEditor';
import { CodeBlock } from '../CodeBlock';
import { compilerService } from '../../services/compilerService';

interface Props {
  challenge: Challenge;
  code: string;
  onCodeChange: (code: string) => void;
  onRun: () => void;
  isRunning: boolean;
  progressMessage: string;
  result: ExecutionResult | null;
  locked: boolean;
  showSolution: boolean;
  onReset: () => void;
}

function statusLabel(result: ExecutionResult): string {
  if (result.status === 'passed') return 'All tests passed';
  if (result.status === 'failed') {
    const passed = result.testResults?.filter((t) => t.passed).length ?? 0;
    const total = result.testResults?.length ?? 0;
    return `${passed} of ${total} tests passed`;
  }
  return 'Error';
}

/** code_runner and debug: an editor, the test table, and the console. */
export const CodeChallenge: React.FC<Props> = ({
  challenge,
  code,
  onCodeChange,
  onRun,
  isRunning,
  progressMessage,
  result,
  locked,
  showSolution,
  onReset
}) => {
  const visibleCases = (challenge.testCases ?? []).map((tc, i) => ({
    ...tc,
    index: i,
    result: result?.testResults?.[i]
  }));

  return (
    <div className="code-challenge">
      <div className="code-challenge-bar">
        <span className="code-engine">
          {challenge.language} · {compilerService.engineFor(challenge.language)}
        </span>
        <div className="code-challenge-bar-actions">
          <button type="button" className="link-btn" onClick={onReset} disabled={isRunning}>
            Reset code
          </button>
          <span className="kbd-hint">
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to run
          </span>
        </div>
      </div>

      <CodeEditor
        value={code}
        onChange={onCodeChange}
        language={challenge.language}
        onSubmit={onRun}
        readOnly={locked}
        minRows={Math.max(8, (challenge.starterCode ?? '').split('\n').length + 2)}
        ariaLabel={`Solution for ${challenge.title}`}
      />

      {(challenge.testCases?.length ?? 0) > 0 && (
        <div className="test-panel">
          <div className="test-panel-head">
            <span>Tests</span>
            {result && (
              <span className={`test-verdict is-${result.status}`}>
                {statusLabel(result)}
                {result.time ? ` · ${result.time}` : ''}
              </span>
            )}
          </div>

          <ul className="test-list">
            {visibleCases.map((tc) => {
              const state = !tc.result ? 'pending' : tc.result.passed ? 'pass' : 'fail';
              return (
                <li key={tc.index} className={`test-row is-${state}`}>
                  <span className="test-icon" aria-hidden="true">
                    {state === 'pass' ? '✓' : state === 'fail' ? '✗' : '·'}
                  </span>
                  <div className="test-body">
                    <code className="test-call">
                      {tc.hidden && !tc.result
                        ? `hidden test ${tc.index + 1}`
                        : `${challenge.entryFunction}(${tc.input})`}
                    </code>
                    <div className="test-expect">
                      <span>
                        expected <code>{tc.expected}</code>
                      </span>
                      {tc.result && !tc.result.passed && (
                        <span className="test-actual">
                          got <code>{tc.result.actual}</code>
                        </span>
                      )}
                      {tc.result?.timeMs !== undefined && tc.result.passed && (
                        <span className="test-time">{tc.result.timeMs}ms</span>
                      )}
                    </div>
                    {tc.result?.logs && (
                      <pre className="test-logs">{tc.result.logs}</pre>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(isRunning || result) && (
        <div className={`console-panel ${result?.stderr ? 'has-error' : ''}`.trim()}>
          <div className="console-head">
            <span>Console</span>
            {result?.engine && <span className="console-engine">{result.engine}</span>}
          </div>
          <pre className="console-body">
            {isRunning
              ? progressMessage || 'Running…'
              : result?.stderr
                ? result.stderr
                : result?.stdout?.trim()
                  ? result.stdout
                  : 'No output.'}
          </pre>
        </div>
      )}

      {showSolution && challenge.solutionCode && (
        <div className="solution-panel">
          <div className="solution-head">Reference solution</div>
          <CodeBlock code={challenge.solutionCode} language={challenge.language} showLineNumbers />
        </div>
      )}
    </div>
  );
};
