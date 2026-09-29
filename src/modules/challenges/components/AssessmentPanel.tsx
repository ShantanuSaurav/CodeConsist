import React, { useEffect, useRef } from 'react';
import { Check, Clock, Flag, X } from 'lucide-react';
import type { AssessmentView, Stage } from '@/types';
import { describeRetry, useSession } from '@/platform/session';
import { maxRunsFor } from '@/platform/progress';
import { fillCopy } from '@/platform/settings';
import { usePracticeSession } from '../session/PracticeSessionProvider';
import type { AssessmentRun } from '../session/PracticeSessionProvider';

/** "Stage 03 · Variables" - what the admin's `{stage}` stands for. */
export function stageLabel(stage: Pick<Stage, 'index' | 'name'> | null | undefined, fallback = 'this stage'): string {
  if (!stage) return fallback;
  return `Stage ${String(stage.index).padStart(2, '0')} · ${stage.name}`;
}

/**
 * "Test out · Stage 03" or "Placement · 2 of 3": the modal header while one
 * runs. `stageId` counts from that stage test instead of the one the record
 * is on now (the screen after a test shows the test just taken).
 */
export function assessmentHeading(
  view: Pick<AssessmentView, 'kind' | 'cursor' | 'stageIds'>,
  stage: Pick<Stage, 'index'> | null | undefined,
  stageId: string | null = null
): string {
  if (view.kind === 'placement') {
    const at = stageId ? view.stageIds.indexOf(stageId) : -1;
    const position = at >= 0 ? at + 1 : Math.min(view.cursor + 1, view.stageIds.length);
    return `Placement · ${position} of ${view.stageIds.length}`;
  }
  return `Test out${stage ? ` · Stage ${String(stage.index).padStart(2, '0')}` : ''}`;
}

/**
 * The screens of a test-out or placement other than the test itself: its
 * rules before it starts, another one already running, a placement test
 * passed with more to come, and the result. Every sentence the learner reads
 * about the rules is the admin's (`testOut.copy`, `placement.copy`), filled
 * with this stage and these numbers.
 */
export const AssessmentPanel: React.FC<{ run: AssessmentRun }> = ({ run }) => {
  const { stages, tracks, settings, testOutStatus, placementStatus, celebrate, playSound } = useSession();
  const { beginAssessment, resumeAssessment, endRunningAssessment, continueAssessment, finishPlacement, closePractice, openPractice } = usePracticeSession();
  const stageOf = (id: string | null | undefined) => (id ? stages.find((s) => s.id === id) ?? null : null);

  const kind = run.view?.kind ?? run.request.kind;
  const own = kind === 'placement' ? settings.placement : settings.testOut;
  const rules = run.view?.rules ?? { passMark: own.passMark, maxRuns: maxRunsFor(own.passMark, settings.xp.retryPenalty), hintsAllowed: own.hintsAllowed };
  const numbers = { passMark: rules.passMark, maxRuns: rules.maxRuns };
  const primaryRef = useRef<HTMLButtonElement>(null);

  // A pass is celebrated once, when its screen appears.
  const celebrated = useRef<string | null>(null);
  useEffect(() => {
    const key = `${run.view?.id}:${run.lastStageId}:${run.screen}`;
    if ((run.screen === 'between' || run.screen === 'result') && run.lastPassed && celebrated.current !== key) {
      celebrated.current = key;
      playSound('unitComplete');
      if (run.xp > 0 && settings.celebrations.confetti.onUnitEnd) celebrate({ particles: settings.celebrations.confetti.unitEndParticles });
    }
  }, [run.screen, run.lastPassed, run.lastStageId, run.view?.id, run.xp, playSound, celebrate, settings.celebrations.confetti]);
  useEffect(() => {
    primaryRef.current?.focus();
  }, [run.screen]);

  /* ----------------------------------------------------------- intro */
  if (run.screen === 'intro') {
    if (run.request.kind === 'test-out') {
      const stage = stageOf(run.request.stageId);
      const label = stageLabel(stage);
      return (
        <div className="celebration-view assessment-view">
          <span className="celebration-icon is-neutral" aria-hidden="true">
            <Flag size={20} />
          </span>
          <h2 className="celebration-title">{fillCopy(settings.testOut.copy.confirmTitle, { stage: label })}</h2>
          <p>{fillCopy(settings.testOut.copy.confirmBody, { stage: label, ...numbers })}</p>
          <p className="assessment-rules">{fillCopy(settings.testOut.copy.rulesLine, numbers)}</p>
          {run.error && (
            <p className="assessment-error" role="alert">
              {run.error}
            </p>
          )}
          <div className="celebration-actions">
            <button type="button" className="btn btn-line btn-lg" onClick={closePractice}>
              Cancel
            </button>
            <button ref={primaryRef} type="button" className="btn btn-solid btn-lg" onClick={() => void beginAssessment()} disabled={run.busy || Boolean(run.error)}>
              {run.busy ? 'Starting…' : 'Start the test'}
            </button>
          </div>
        </div>
      );
    }
    const status = placementStatus(run.request.trackId);
    const queue = status.queue.map((id) => stageOf(id)).filter((s): s is Stage => Boolean(s));
    return (
      <div className="celebration-view assessment-view">
        <span className="celebration-icon is-neutral" aria-hidden="true">
          <Flag size={20} />
        </span>
        <h2 className="celebration-title">{fillCopy(settings.placement.copy.introTitle, numbers)}</h2>
        <p>{fillCopy(settings.placement.copy.introBody, numbers)}</p>
        {queue.length > 0 && (
          <ol className="assessment-queue" aria-label="The stage tests in this placement">
            {queue.map((s) => (
              <li key={s.id}>{stageLabel(s)}</li>
            ))}
          </ol>
        )}
        <p className="assessment-rules">
          {rules.hintsAllowed ? 'Hints cost points, and the answers are not shown.' : 'No hints, and the answers are not shown.'}
          {settings.placement.stopOnFirstFail ? ' It ends at the first test you do not pass.' : ''}
        </p>
        {run.error && (
          <p className="assessment-error" role="alert">
            {run.error}
          </p>
        )}
        <div className="celebration-actions">
          <button type="button" className="btn btn-line btn-lg" onClick={closePractice}>
            Not now
          </button>
          <button ref={primaryRef} type="button" className="btn btn-solid btn-lg" onClick={() => void beginAssessment()} disabled={run.busy || Boolean(run.error)}>
            {run.busy ? 'Starting…' : 'Start'}
          </button>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------- conflict */
  if (run.screen === 'conflict' && run.running) {
    const running = run.running;
    const stage = stageOf(running.current);
    const ends = describeRetry(running.expiresAt);
    return (
      <div className="celebration-view assessment-view">
        <span className="celebration-icon is-neutral" aria-hidden="true">
          <Clock size={20} />
        </span>
        <h2 className="celebration-title">You have a test running</h2>
        <p>
          {assessmentHeading(running, stage)}
          {stage ? ` (${stage.name})` : ''} is still open{ends ? ` - it closes ${ends}` : ''}. Carry on with it, or end it to start this one. Ending it counts as not
          passed.
        </p>
        <div className="celebration-actions">
          <button type="button" className="btn btn-line btn-lg" onClick={closePractice}>
            Cancel
          </button>
          <button type="button" className="btn btn-line btn-lg" onClick={() => void endRunningAssessment()} disabled={run.busy}>
            End it
          </button>
          <button ref={primaryRef} type="button" className="btn btn-solid btn-lg" onClick={resumeAssessment} disabled={run.busy}>
            Resume it
          </button>
        </div>
      </div>
    );
  }

  const view = run.view;
  const last = stageOf(run.lastStageId);
  const label = stageLabel(last);

  /* --------------------------------------------------------- between */
  if (run.screen === 'between' && view) {
    const next = stageOf(view.current);
    return (
      <div className="celebration-view assessment-view">
        {run.lastPassed ? (
          <>
            <span className="celebration-icon" aria-hidden="true">
              <Check size={20} strokeWidth={3} />
            </span>
            <h2 className="celebration-title">{fillCopy(settings.placement.copy.passTitle, { stage: label })}</h2>
            <p>{fillCopy(settings.placement.copy.passBody, { stage: label })}</p>
          </>
        ) : (
          // This placement does not stop at the first test not passed: it goes on.
          <>
            <span className="celebration-icon is-miss" aria-hidden="true">
              <X size={20} strokeWidth={3} />
            </span>
            <h2 className="celebration-title">Not passed: {label}</h2>
            <p>{label} stays as it is. The placement goes on with the next test.</p>
          </>
        )}
        {run.xp > 0 && <div className="unit-complete-xp">+{run.xp} XP</div>}
        {next && (
          <p className="assessment-rules">
            Next: {stageLabel(next)} · test {Math.min(view.cursor + 1, view.stageIds.length)} of {view.stageIds.length}
          </p>
        )}
        <div className="celebration-actions">
          <button type="button" className="btn btn-line btn-lg" onClick={() => void finishPlacement()} disabled={run.busy}>
            Stop here
          </button>
          <button ref={primaryRef} type="button" className="btn btn-solid btn-lg" onClick={continueAssessment} disabled={run.busy}>
            Next test
          </button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------- result */
  // The stage after the last one tested out of, on the same track: where to go next.
  const trackOf = (stageId: string | null | undefined): Stage[] => {
    if (!stageId) return [];
    const stage = stageOf(stageId);
    return tracks.find((t) => t.stages.some((s) => s.id === stageId))?.stages ?? (stage ? [stage] : []);
  };
  const expired = view?.status === 'expired';
  const passedIds = Object.entries(view?.results ?? {})
    .filter(([, r]) => r?.outcome === 'passed')
    .map(([id]) => id);

  const actionsFor = (primary: React.ReactNode) => (
    <div className="celebration-actions">
      <button type="button" className="btn btn-line btn-lg" onClick={closePractice}>
        Back to the path
      </button>
      {primary}
    </div>
  );

  if (kind === 'test-out') {
    const stageId = run.lastStageId ?? view?.stageIds[0] ?? null;
    const stage = stageOf(stageId);
    const name = stageLabel(stage);
    if (run.lastPassed) {
      const chain = trackOf(stageId);
      const after = chain[chain.findIndex((s) => s.id === stageId) + 1];
      return (
        <div className="celebration-view assessment-view">
          <span className="celebration-icon" aria-hidden="true">
            <Check size={20} strokeWidth={3} />
          </span>
          <h2 className="celebration-title">{fillCopy(settings.testOut.copy.passTitle, { stage: name })}</h2>
          <p>{fillCopy(settings.testOut.copy.passBody, { stage: name })}</p>
          {run.xp > 0 && <div className="unit-complete-xp">+{run.xp} XP</div>}
          {actionsFor(
            after && after.state !== 'Locked' ? (
              <button ref={primaryRef} type="button" className="btn btn-solid btn-lg" onClick={() => openPractice(after.id)}>
                Start Stage {String(after.index).padStart(2, '0')}
              </button>
            ) : null
          )}
        </div>
      );
    }
    const status = stageId ? testOutStatus(stageId) : null;
    const when =
      describeRetry(status?.retryAt ?? null) ??
      (settings.testOut.cooldownMinutes > 0 ? describeRetry(new Date(Date.now() + settings.testOut.cooldownMinutes * 60_000).toISOString()) : 'now');
    return (
      <div className="celebration-view assessment-view">
        <span className="celebration-icon is-miss" aria-hidden="true">
          <X size={20} strokeWidth={3} />
        </span>
        <h2 className="celebration-title">{expired ? 'The time for this test ran out' : fillCopy(settings.testOut.copy.failTitle, { stage: name })}</h2>
        <p>{fillCopy(settings.testOut.copy.failBody, { stage: name, when: when ?? 'later' })}</p>
        {actionsFor(
          stage && stage.state !== 'Locked' ? (
            <button ref={primaryRef} type="button" className="btn btn-solid btn-lg" onClick={() => openPractice(stage.id)}>
              Do the lessons instead
            </button>
          ) : null
        )}
      </div>
    );
  }

  // A placement that is over.
  const trackId = view?.trackId ?? (run.request.kind === 'placement' ? run.request.trackId : null);
  const retake = describeRetry(trackId ? placementStatus(trackId).retryAt : null);
  const when =
    retake ?? (settings.placement.retakeAfterDays > 0 ? `in ${settings.placement.retakeAfterDays} ${settings.placement.retakeAfterDays === 1 ? 'day' : 'days'}` : 'now');
  // The learner's level: the first stage in the placement not passed (or the
  // one on screen when the time ran out). None when every test taken passed.
  const firstFailed = (view?.stageIds ?? []).find((id) => view?.results?.[id]?.outcome === 'failed') ?? null;
  const stoppedAt = stageOf(firstFailed) ?? (expired ? last : null);
  // Where to start: the stage it stopped at, else the first open stage after the ones passed.
  const chain = trackOf(run.lastStageId ?? view?.stageIds[0]);
  const startAt = stoppedAt ?? chain.find((s) => s.state !== 'Completed' && s.state !== 'Locked' && !passedIds.includes(s.id)) ?? null;
  const n = passedIds.length;
  return (
    <div className="celebration-view assessment-view">
      <span className={`celebration-icon ${stoppedAt ? 'is-neutral' : ''}`.trim()} aria-hidden="true">
        {stoppedAt ? <Flag size={20} /> : <Check size={20} strokeWidth={3} />}
      </span>
      <h2 className="celebration-title">
        {stoppedAt
          ? fillCopy(settings.placement.copy.failTitle, { stage: stageLabel(stoppedAt) })
          : n > 0
            ? `You tested out of ${n} ${n === 1 ? 'stage' : 'stages'}`
            : 'Placement ended'}
      </h2>
      {stoppedAt ? (
        <p>{fillCopy(settings.placement.copy.failBody, { stage: stageLabel(stoppedAt), when })}</p>
      ) : (
        <p>
          {n > 0
            ? `Tested out: ${passedIds.map((id) => stageLabel(stageOf(id), id)).join(', ')}.`
            : 'Nothing was marked as tested out.'}{' '}
          {startAt ? `Carry on with ${stageLabel(startAt)}.` : ''}
        </p>
      )}
      {expired && <p className="assessment-rules">The time for the last test ran out.</p>}
      {run.xp > 0 && <div className="unit-complete-xp">+{run.xp} XP</div>}
      {actionsFor(
        startAt ? (
          <button ref={primaryRef} type="button" className="btn btn-solid btn-lg" onClick={() => openPractice(startAt.id)}>
            Start Stage {String(startAt.index).padStart(2, '0')}
          </button>
        ) : null
      )}
    </div>
  );
};
