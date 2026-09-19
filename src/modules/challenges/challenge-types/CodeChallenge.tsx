import React, { useState } from 'react';
import { Code2, Columns, LayoutTemplate } from 'lucide-react';
import { Challenge, ExecutionResult } from '@/types';
import { CodeEditor } from '@/ui/primitives/CodeEditor';
import { CodeBlock } from '@/ui/primitives/CodeBlock';
import { compilerService } from '@/platform/execution/compilerService';
import { UiPreview } from '../components/UiPreview';
import { WebIde } from '../components/WebIde';

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
  const isUi = Boolean(challenge.uiPreview || challenge.language === 'html');
  const [uiViewMode, setUiViewMode] = useState<'editor' | 'preview' | 'split'>('split');

  const visibleCases = (challenge.testCases ?? []).map((tc, i) => ({
    ...tc,
    index: i,
    result: result?.testResults?.[i]
  }));

  const editorNode = isUi ? (
    <WebIde
      code={code}
      onChange={onCodeChange}
      onSubmit={onRun}
      readOnly={locked}
      starterCode={challenge.starterCode}
      onReset={onReset}
    />
  ) : (
    <CodeEditor
      value={code}
      onChange={onCodeChange}
      language={challenge.language}
      onSubmit={onRun}
      readOnly={locked}
      minRows={Math.max(8, (challenge.starterCode ?? '').split('\n').length + 2)}
      ariaLabel={`Solution for ${challenge.title}`}
    />
  );

  const previewNode = (
    <UiPreview
      html={code}
      title={`Live Preview: ${challenge.title}`}
      minHeight={420}
      badgeText={challenge.isStageTest ? 'Assessment Preview' : 'Live Component'}
    />
  );

function getTestCaseTitle(
  tc: { index: number; input: string; description?: string; hidden?: boolean; result?: any },
  entryFunction?: string,
  isUi?: boolean
): string {
  if (tc.hidden && !tc.result) {
    return `Hidden Test ${tc.index + 1}`;
  }
  if (tc.description) {
    return tc.description;
  }
  if (isUi && tc.input.length > 50) {
    const s = tc.input;
    if (s.includes('Alex Morgan') || (s.includes('user-name') && s.includes('follower-count'))) {
      return 'Verify #user-name, #status-badge ("Active"), and #follower-count ("142")';
    }
    if (s.includes('status-btn') && s.includes('Away')) {
      return 'Toggle Status: Click #status-btn switches badge to "Away" and class "status-away"';
    }
    if (s.includes('status-btn') && s.includes('Active')) {
      return 'Toggle Status Back: Click #status-btn again returns badge to "Active"';
    }
    if (s.includes('follow-btn')) {
      return 'Follow Button: Click #follow-btn increments followers to "143" and label to "Following"';
    }
    return `DOM Assertion #${tc.index + 1}`;
  }
  if (entryFunction) {
    return `${entryFunction}(${tc.input})`;
  }
  return tc.input;
}

  return (
    <div className="code-challenge">
      <div className="code-challenge-toolbar">
        {isUi ? (
          <div className="ui-mode-tabs" role="tablist" aria-label="View mode">
            <button
              type="button"
              className={`ui-mode-tab ${uiViewMode === 'split' ? 'is-active' : ''}`}
              onClick={() => setUiViewMode('split')}
            >
              <Columns size={13} />
              <span>Split View</span>
            </button>
            <button
              type="button"
              className={`ui-mode-tab ${uiViewMode === 'editor' ? 'is-active' : ''}`}
              onClick={() => setUiViewMode('editor')}
            >
              <Code2 size={13} />
              <span>Code Only</span>
            </button>
            <button
              type="button"
              className={`ui-mode-tab ${uiViewMode === 'preview' ? 'is-active' : ''}`}
              onClick={() => setUiViewMode('preview')}
            >
              <LayoutTemplate size={13} />
              <span>Live UI Preview</span>
            </button>
          </div>
        ) : (
          <span className="code-engine">
            {challenge.language} · {compilerService.engineFor(challenge.language)}
          </span>
        )}

        <div className="code-challenge-bar-actions">
          {!isUi && (
            <button type="button" className="link-btn" onClick={onReset} disabled={isRunning}>
              Reset code
            </button>
          )}
          <span className="kbd-hint">
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to run tests
          </span>
        </div>
      </div>

      {isUi ? (
        uiViewMode === 'split' ? (
          <div className="ui-challenge-split">
            <div className="ui-split-pane">{editorNode}</div>
            <div className="ui-split-pane">{previewNode}</div>
          </div>
        ) : uiViewMode === 'preview' ? (
          <div className="ui-full-pane">{previewNode}</div>
        ) : (
          <div className="ui-full-pane">{editorNode}</div>
        )
      ) : (
        editorNode
      )}

      {(challenge.testCases?.length ?? 0) > 0 && (
        <div className="test-panel">
          <div className="test-panel-head">
            <div className="test-panel-title-cluster">
              <span className="test-panel-title">Test Results</span>
              <span className="test-panel-count-badge">
                {visibleCases.length} {visibleCases.length === 1 ? 'test' : 'tests'}
              </span>
            </div>
            {result && (
              <span className={`test-verdict is-${result.status}`}>
                {isUi && result.status === 'passed'
                  ? `All UI & DOM Tests Passed · +${challenge.xpReward} XP`
                  : statusLabel(result)}
                {result.time ? ` · ${result.time}` : ''}
              </span>
            )}
          </div>

          <ul className="test-list">
            {visibleCases.map((tc) => {
              const state = !tc.result ? 'pending' : tc.result.passed ? 'pass' : 'fail';
              const title = getTestCaseTitle(tc, challenge.entryFunction, isUi);
              return (
                <li key={tc.index} className={`test-row is-${state}`}>
                  <div className="test-row-main">
                    <span className={`test-status-pill is-${state}`}>
                      <span className="test-icon" aria-hidden="true">
                        {state === 'pass' ? '✓' : state === 'fail' ? '✗' : '○'}
                      </span>
                      <span>{state === 'pass' ? 'Pass' : state === 'fail' ? 'Fail' : `Test ${tc.index + 1}`}</span>
                    </span>
                    <span className="test-name" title={title}>
                      {title}
                    </span>
                  </div>

                  <div className="test-row-meta">
                    <span className="test-expect">
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
