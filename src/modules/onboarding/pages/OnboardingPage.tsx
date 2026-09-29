import React, { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { LearningMode, OnboardingAnswers } from '@/types';
import { assessmentBlockText, useSession } from '@/platform/session';
import { intents } from '@/platform/events';
import { ROUTES } from '@/config/routes';
import { Button, CodeConsistLogo, PageSkeleton, ProgressBar } from '@/ui';
import { answersToKeep, experienceAction, nextAction, recommendedMode, stepAnswered, visibleSteps } from '../flow';
import { MotivationStep } from '../steps/MotivationStep';
import { TrackStep } from '../steps/TrackStep';
import { ExperienceStep } from '../steps/ExperienceStep';
import { GoalStep } from '../steps/GoalStep';
import { ModeStep } from '../steps/ModeStep';

/**
 * /welcome - the first-run setup (Phase 5): why the learner is here, their
 * track, how much they know, a daily goal and a learning mode, in the
 * admin's order and words (`onboarding` settings). Every answer can be
 * changed later in Settings; "Redo setup" there opens this page again with
 * the answers filled in (`?redo=1`).
 *
 * A learner who finished or dismissed it, or who has progress, is sent on to
 * the dashboard (`needsOnboarding`); only "Redo setup" opens it for them.
 * Finishing applies the choices (the track at once, when picked) and keeps
 * the answers - on the account when signed in. When the learner asks for a
 * placement, it opens on the Learn page, rules first.
 */
export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redo = params.get('redo') === '1';
  const {
    contentReady,
    settings,
    tracks,
    selectedTrackId,
    setSelectedTrack,
    learningMode,
    dailyGoalId,
    goalOptions,
    onboardingAnswers,
    needsOnboarding,
    completeOnboarding,
    dismissOnboarding,
    placementStatus
  } = useSession();
  const config = settings.onboarding;

  const [answers, setAnswers] = useState<OnboardingAnswers>(() => ({
    motivation: redo ? onboardingAnswers.motivation : null,
    trackId: selectedTrackId,
    experience: redo ? onboardingAnswers.experience : null,
    dailyGoalId: dailyGoalId ?? settings.goals.defaultOptionId,
    learningMode
  }));
  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  // Steps skipped: their answers are not kept, not even a suggested mode.
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set());
  // Set on the way out, so the "already done" redirect never races the navigation.
  const leaving = useRef(false);
  // The track picked is applied at once (the placement offered at the end is
  // for it), so the one before is remembered on the first pick: Cancel,
  // "Skip setup" and skipping the track step put it back.
  const trackBefore = useRef<string | null>(null);
  const restoreTrack = () => {
    if (trackBefore.current === null) return;
    setSelectedTrack(trackBefore.current);
    trackBefore.current = null;
  };

  const steps = useMemo(
    () => visibleSteps(config, { hasGoals: settings.goals.enabled && goalOptions.length > 0, trackCount: tracks.length }),
    [config, settings.goals.enabled, goalOptions.length, tracks.length]
  );

  // Finished or put aside, switched off, or a learner with progress (their
  // account may arrive a moment after "Enter"): on to the dashboard. "Redo
  // setup" in Settings opens it for anyone.
  if (!leaving.current && !redo && (!needsOnboarding || !config.enabled)) return <Navigate to={ROUTES.dashboard} replace />;
  if (!contentReady) return <PageSkeleton label="Loading your setup" />;

  const done = finishing || steps.length === 0 || index >= steps.length;
  const step = done ? null : steps[Math.min(index, steps.length - 1)];
  const suggested = recommendedMode(config, answers.experience);
  const chosenMode: LearningMode | null = answers.learningMode ?? suggested;
  const trackId = answers.trackId && tracks.some((t) => t.track.id === answers.trackId) ? answers.trackId : selectedTrackId;

  const set = (patch: Partial<OnboardingAnswers>) => setAnswers((prev) => ({ ...prev, ...patch }));
  const moveOn = () => {
    if (index + 1 >= steps.length) setFinishing(true);
    else setIndex(index + 1);
  };
  const next = () => {
    // Answered after all (having gone back to it): no longer skipped.
    if (step && skipped.has(step.id)) setSkipped((prev) => new Set([...prev].filter((id) => id !== step.id)));
    moveOn();
  };
  const back = () => {
    if (finishing) setFinishing(false);
    else setIndex(Math.max(0, index - 1));
  };
  const skip = () => {
    if (!step) return;
    // A skipped step keeps nothing: the learner's earlier choice stands.
    const cleared: Partial<OnboardingAnswers> =
      step.id === 'motivation'
        ? { motivation: null }
        : step.id === 'experience'
          ? { experience: null }
          : step.id === 'goal'
            ? { dailyGoalId: null }
            : step.id === 'mode'
              ? { learningMode: null }
              : { trackId: null };
    set(cleared);
    if (step.id === 'track') restoreTrack();
    setSkipped((prev) => new Set([...prev, step.id]));
    moveOn();
  };

  const leaveSetup = () => {
    leaving.current = true;
    restoreTrack();
    if (redo) {
      navigate(ROUTES.settings);
      return;
    }
    dismissOnboarding();
    navigate(ROUTES.dashboard);
  };

  /* --------------------------------------------------------------- finish */
  const placement = trackId ? placementStatus(trackId) : null;
  const placementAvailable = Boolean(settings.placement.enabled && placement && (placement.eligible || placement.pending));
  const action = nextAction(answers, config, { placementAvailable });
  const wantedPlacement = experienceAction(config, answers.experience);
  const placementOffline = Boolean(placement?.offline && (wantedPlacement === 'placement' || wantedPlacement === 'offer-placement'));
  const finish = (withPlacement: boolean) => {
    leaving.current = true;
    completeOnboarding(
      answersToKeep(
        steps.filter((s) => !skipped.has(s.id)),
        { ...answers, learningMode: chosenMode }
      )
    );
    if (withPlacement && trackId) {
      navigate(ROUTES.learn);
      intents.openAssessment({ kind: 'placement', trackId });
      return;
    }
    navigate(redo ? ROUTES.settings : ROUTES.learn);
  };

  const answered = step ? stepAnswered(step, { ...answers, learningMode: chosenMode }) : true;
  const position = done ? steps.length : index;
  const percent = steps.length ? Math.round((position / steps.length) * 100) : 100;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="flex items-center justify-between gap-4 px-4 sm:px-6 h-14 border-b border-border-subtle">
        <Link to={ROUTES.landing} className="inline-flex" aria-label="CodeConsist home">
          <CodeConsistLogo size="sm" wordmark />
        </Link>
        <button type="button" className="text-sm text-fg-secondary hover:text-fg inline-flex items-center min-h-[44px] px-2" onClick={leaveSetup}>
          {redo ? 'Cancel' : 'Skip setup'}
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {index === 0 && !done && (
          <div className="mb-8">
            <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">{config.intro.title}</h1>
            {config.intro.body && <p className="text-fg-secondary mt-2">{config.intro.body}</p>}
          </div>
        )}

        {steps.length > 0 && (
          <div className="mb-6">
            <div className="font-mono text-xs text-fg-muted mb-2">{done ? 'All set' : `Step ${index + 1} of ${steps.length}`}</div>
            <ProgressBar value={percent} size="sm" label={done ? 'Setup complete' : `Step ${index + 1} of ${steps.length}`} />
          </div>
        )}

        {step && (
          <section aria-labelledby="onboarding-step-title">
            <h2 id="onboarding-step-title" className="text-xl font-semibold tracking-tight">
              {step.title}
            </h2>
            {step.subtitle && <p className="text-fg-secondary mt-1 mb-5">{step.subtitle}</p>}
            {!step.subtitle && <div className="mb-5" />}

            {step.id === 'motivation' && <MotivationStep options={config.motivation.options} value={answers.motivation ?? null} onChange={(id) => set({ motivation: id })} />}
            {step.id === 'track' && (
              <TrackStep
                tracks={tracks.map(({ track }) => ({ id: track.id, label: track.label, tagline: track.tagline }))}
                blurbs={config.track.blurbs}
                value={answers.trackId ?? null}
                onChange={(id) => {
                  set({ trackId: id });
                  // At once: the placement offered at the end is for this track.
                  if (trackBefore.current === null) trackBefore.current = selectedTrackId;
                  setSelectedTrack(id);
                }}
              />
            )}
            {step.id === 'experience' && (
              <ExperienceStep options={config.experience.options} value={answers.experience ?? null} onChange={(id) => set({ experience: id })} />
            )}
            {step.id === 'goal' && <GoalStep options={goalOptions} value={answers.dailyGoalId ?? null} onChange={(id) => set({ dailyGoalId: id })} />}
            {step.id === 'mode' && (
              <ModeStep options={config.mode.options} value={chosenMode} recommended={suggested} onChange={(mode) => set({ learningMode: mode })} />
            )}

            <div className="onboarding-actions mt-8 flex flex-wrap items-center justify-between gap-3">
              <div>
                {index > 0 && (
                  <Button variant="ghost" onClick={back}>
                    <ArrowLeft size={15} /> Back
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {step.skippable && (
                  <Button variant="secondary" onClick={skip}>
                    Skip
                  </Button>
                )}
                <Button variant="primary" onClick={next} disabled={!answered}>
                  Continue <ArrowRight size={15} />
                </Button>
              </div>
            </div>
          </section>
        )}

        {done && (
          <section aria-labelledby="onboarding-finish-title">
            <h2 id="onboarding-finish-title" className="text-[1.5rem] leading-tight font-semibold tracking-tight">
              {config.finish.title}
            </h2>
            {config.finish.body && <p className="text-fg-secondary mt-2">{config.finish.body}</p>}

            {action === 'offer-placement' && (
              <div className="mt-6 rounded-lg border border-border px-4 py-4">
                <h3 className="font-medium">{config.experience.placementPrompt.title}</h3>
                {config.experience.placementPrompt.body && <p className="text-sm text-fg-secondary mt-1">{config.experience.placementPrompt.body}</p>}
                <div className="onboarding-actions mt-4 flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => finish(true)}>
                    {config.experience.placementPrompt.startLabel}
                  </Button>
                  <Button variant="secondary" onClick={() => finish(false)}>
                    {config.experience.placementPrompt.skipLabel}
                  </Button>
                </div>
              </div>
            )}
            {placementOffline && <p className="text-sm text-fg-muted mt-4">{assessmentBlockText('offline')} You can take a placement later from the Learn page.</p>}

            <div className="onboarding-actions mt-8 flex flex-wrap items-center justify-between gap-3">
              <div>
                {steps.length > 0 && (
                  <Button variant="ghost" onClick={back}>
                    <ArrowLeft size={15} /> Back
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {action === 'placement' && (
                  <Button variant="secondary" onClick={() => finish(false)}>
                    {config.finish.ctaLabel}
                  </Button>
                )}
                {action === 'placement' ? (
                  <Button variant="primary" onClick={() => finish(true)}>
                    {config.finish.placementCtaLabel} <ArrowRight size={15} />
                  </Button>
                ) : action === 'start' ? (
                  <Button variant="primary" onClick={() => finish(false)}>
                    {config.finish.ctaLabel} <ArrowRight size={15} />
                  </Button>
                ) : null}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
