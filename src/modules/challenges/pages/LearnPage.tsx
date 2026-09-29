import React from 'react';
import type { ReadingResolver } from '@/types';
import { LearningModeSwitch, PageHeader } from '@/ui';
import { LearningPath } from '../components/LearningPath';
import { LanguageTrackPicker } from '../components/LanguageTrackPicker';
import { assessmentBlockText, useSession } from '@/platform/session';
import { intents } from '@/platform/events';

/**
 * Solves a sign-in merge held back because their stage is not open on the
 * account yet (the server's stage order). Listed by stage, so the learner
 * knows what to do again once it opens; gone once dismissed, or once every
 * one of them is solved on the account.
 */
const HeldNotice: React.FC = () => {
  const { stats, stages, dismissHeldChallenges } = useSession();
  const solved = new Set(stats.completedChallenges);
  const held = (stats.heldChallenges ?? []).filter((id) => !solved.has(id));
  if (held.length === 0) return null;
  const names: string[] = [];
  for (const stage of stages) {
    const ids = [...stage.challenges.map((c) => c.id), ...(stage.test ? [stage.test.id] : [])];
    if (ids.some((id) => held.includes(id))) names.push(stage.name);
  }
  const n = held.length;
  return (
    <div role="status" className="mb-6 rounded-lg border border-border-subtle bg-surface-2 px-4 py-3 text-sm">
      <p className="text-fg">
        {n} {n === 1 ? 'lesson' : 'lessons'} you solved before signing in {n === 1 ? 'was' : 'were'} not added to your account, because{' '}
        {names.length === 1 ? 'its stage is' : 'their stages are'} not open on it yet{names.length ? `: ${names.join(', ')}` : ''}. Solve{' '}
        {n === 1 ? 'it' : 'them'} again once the stage opens and {n === 1 ? 'it counts' : 'they count'}.
      </p>
      <button type="button" className="mt-2 inline-flex items-center min-h-[44px] px-2 -ml-2 text-xs font-medium text-accent hover:underline" onClick={dismissHeldChallenges}>
        Got it
      </button>
    </div>
  );
};

/**
 * "Already know some of this? Find your level" (Phase 5): a placement on this
 * track, while one can start and the admin offers it here. Signed in and
 * offline, it is shown disabled with the reason.
 */
const PlacementOffer: React.FC = () => {
  const { activeTrack, placementStatus, settings, contentReady } = useSession();
  const rules = settings.placement;
  if (!contentReady || !rules.enabled || !rules.offerOnLearnPage || !activeTrack.track.id) return null;
  const status = placementStatus(activeTrack.track.id);
  if (!status.eligible && !status.offline) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <button
        type="button"
        className="inline-flex items-center min-h-[44px] font-medium text-accent hover:underline disabled:text-fg-muted disabled:no-underline disabled:cursor-not-allowed"
        onClick={() => intents.openAssessment({ kind: 'placement', trackId: activeTrack.track.id })}
        disabled={status.offline}
      >
        {rules.copy.learnPageLink}
      </button>
      {status.offline && <span className="text-xs text-fg-muted">{assessmentBlockText('offline')}</span>}
    </div>
  );
};

export const LearnPage: React.FC<{ readingFor?: ReadingResolver }> = ({ readingFor }) => {
  const { learnerStages, activeTrack, tracks, learningMode, setLearningMode, stats } = useSession();
  const cleared = learnerStages.filter((s) => s.state === 'Completed').length;
  const lessonsTotal = learnerStages.reduce((n, s) => n + s.challenges.length, 0);
  const lessonsDone = learnerStages.reduce((n, s) => n + s.challenges.filter((c) => stats.completedChallenges.includes(c.id)).length, 0);
  const single = tracks.length <= 1;

  return (
    <div className="page max-w-4xl">
      <PageHeader
        eyebrow="Learn"
        title={activeTrack.track.label}
        description={
          single
            ? "Finish a stage's lessons, pass its coding test, and the next one opens."
            : activeTrack.track.description
        }
        aside={
          <div className="sm:text-right">
            <div className="text-2xl font-semibold font-mono text-fg tabular-nums leading-none">
              {lessonsDone}
              <span className="text-fg-muted text-base"> / {lessonsTotal}</span>
            </div>
            <div className="text-xs text-fg-muted mt-1">
              lessons · {cleared} / {learnerStages.length} stages cleared
            </div>
          </div>
        }
      />

      <HeldNotice />

      <LanguageTrackPicker />

      <PlacementOffer />

      {/* How the learner wants to reach each stage's challenges. Same engine,
          grading, XP and unlocking either way; only the journey differs. */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 py-3 border-y border-border-subtle">
        <div className="min-w-0">
          <div className="text-sm font-medium text-fg">Learning mode</div>
          <div className="text-xs text-fg-muted mt-0.5">
            {learningMode === 'learn'
              ? 'Theory, an example, a try-it and a quick check before each new idea.'
              : learningMode === 'practice'
                ? 'Straight into the challenges. Switch back any time.'
                : "You'll be asked when you open your first stage - or choose now."}
          </div>
        </div>
        <LearningModeSwitch value={learningMode} onChange={setLearningMode} />
      </div>

      <LearningPath readingFor={readingFor} />
    </div>
  );
};
