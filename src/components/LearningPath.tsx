import React from 'react';
import { useGame } from '../context/GameContext';
import { stageStatus } from '../services/contentService';

export const LearningPath: React.FC = () => {
  const { stages, stats, openPractice, openStageTest, openSubModal } = useGame();

  return (
    <section className="journey" id="journey">
      <div className="section-head">
        <div>
          <h2 className="section-title">Your path, staged</h2>
          <p className="section-sub">
            Ten stages. Finish a stage&apos;s lessons, pass its coding test, and the next one opens.
          </p>
        </div>
      </div>

      <ol className="path-list">
        {stages.map((stage) => {
          const { done, total, percent, hasTest, testPassed, testUnlocked } = stageStatus(stage, stats);
          const premiumLocked = Boolean(stage.isPremium) && !stats.isPremium;
          const openable = stage.state !== 'Locked' || premiumLocked;
          const testPending = stage.state === 'Test pending';

          const rowClass =
            stage.state === 'Completed'
              ? 'path-done'
              : stage.state === 'Test pending'
                ? 'path-test'
                : stage.state === 'In progress'
                  ? 'path-current'
                  : 'path-locked';

          // The primary action follows the stage's state: start or continue the
          // lessons, then take the test, then review.
          const primary = () => {
            if (premiumLocked) openSubModal();
            else if (testPending) openStageTest(stage.id);
            else if (stage.state !== 'Locked') openPractice(stage.id);
          };

          const primaryLabel = premiumLocked
            ? 'Unlock →'
            : testPending
              ? 'Take the test →'
              : stage.state === 'Completed'
                ? 'Review ↻'
                : done > 0
                  ? 'Continue →'
                  : 'Start →';

          return (
            <li
              key={stage.id}
              className={`path-row ${rowClass} ${openable ? 'interactive' : ''}`.trim()}
              onClick={primary}
              onKeyDown={(e) => {
                if (openable && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  primary();
                }
              }}
              tabIndex={openable ? 0 : -1}
              role={openable ? 'button' : undefined}
              aria-label={`Stage ${stage.index}, ${stage.name}, ${done} of ${total} lessons solved${
                hasTest ? `, test ${testPassed ? 'passed' : testUnlocked ? 'ready' : 'locked'}` : ''
              }`}
            >
              <span className="path-index" aria-hidden="true">
                {stage.index}
              </span>

              <span className="path-main">
                <span className="path-name">
                  <span className="path-icon" aria-hidden="true">
                    {stage.icon}
                  </span>
                  {stage.name}
                  {stage.isPremium && <span className="pill pill-pro">Pro</span>}
                </span>
                <span className="path-desc">{stage.description}</span>

                <span className="path-track" aria-hidden="true">
                  <span className="path-fill" style={{ width: `${percent}%` }} />
                </span>

                {hasTest && (
                  <span className={`path-test-badge ${testPassed ? 'is-passed' : testUnlocked ? 'is-ready' : ''}`.trim()}>
                    <span aria-hidden="true">{testPassed ? '✓' : testUnlocked ? '▶' : '🔒'}</span>
                    {testPassed
                      ? 'Stage test passed'
                      : testUnlocked
                        ? 'Stage test ready'
                        : `Stage test · unlocks after ${total} lessons`}
                    {stage.test && <span className="path-test-name"> — {stage.test.title}</span>}
                  </span>
                )}
              </span>

              <span className="path-stats">
                <span className="path-count">
                  {done}/{total}
                </span>
                <span className="path-state">{premiumLocked ? 'Pro only' : stage.state}</span>
              </span>

              {openable && (
                <span className="path-actions">
                  {testPending && stage.state !== 'Locked' && (
                    <button
                      type="button"
                      className="btn-solve btn-solve-quiet"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPractice(stage.id);
                      }}
                    >
                      Review lessons
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-solve"
                    onClick={(e) => {
                      e.stopPropagation();
                      primary();
                    }}
                  >
                    {primaryLabel}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
};
