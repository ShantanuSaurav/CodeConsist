import React, { useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import type { LearningMode } from '@/types';
import type { ExperienceLevel, OnboardingStepId } from '@/platform/settings';
import { describeGoalTarget } from '@/platform/habits';
import { ChoiceCards, LearningModeCards, TrackChoiceList } from '@/ui';
import { Card } from '../ui';
import { GenericSection } from './GenericSection';
import type { SectionProps } from './GenericSection';

const LEVELS: ExperienceLevel[] = ['new', 'some', 'experienced'];

type PreviewScreen = 'intro' | OnboardingStepId | 'finish';

/**
 * Onboarding: the generic fields, beside a live preview of the first-run
 * setup as a learner would see it with these (unsaved) values - drawn with
 * the same primitives the /welcome page uses (ChoiceCards, TrackChoiceList,
 * LearningModeCards). The preview's choices are for trying it out only.
 */
export const OnboardingSection: React.FC<SectionProps> = (props) => {
  const { draft, context } = props;
  const config = draft.onboarding;
  const goalsOn = draft.goals.enabled && draft.goals.options.some((o) => o.enabled);
  const tracks = useMemo(() => (context?.path?.tracks ?? []).filter((t) => !t.hidden), [context]);
  const steps = config.steps.filter((s, i) => s.enabled && config.steps.findIndex((o) => o.id === s.id) === i && (s.id !== 'goal' || goalsOn) && (s.id !== 'track' || tracks.length !== 1));
  const screens: PreviewScreen[] = ['intro', ...steps.map((s) => s.id), 'finish'];
  const [screen, setScreen] = useState<PreviewScreen>('intro');
  const shown = screens.includes(screen) ? screen : 'intro';
  const step = steps.find((s) => s.id === shown) ?? null;

  // Try-it-out answers (nothing is saved).
  const [motivation, setMotivation] = useState<string | null>(null);
  const [track, setTrack] = useState<string | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [mode, setMode] = useState<LearningMode | null>(null);
  const suggested = experience ? config.experience.options[experience]?.recommendMode : 'none';
  const recommended = suggested === 'learn' || suggested === 'practice' ? suggested : null;
  const action = experience ? config.experience.options[experience]?.action ?? 'start' : 'start';

  return (
    <div>
      <Card className="mb-4 !bg-surface-2">
        <div className="flex items-center gap-2 mb-3">
          <Eye size={15} className="text-fg-muted" />
          <h3 className="text-sm font-medium text-fg">Preview</h3>
          {!config.enabled && <span className="text-xs text-warning">The setup is switched off: nobody is sent to it.</span>}
        </div>
        <div className="flex flex-wrap gap-1 mb-4" role="tablist" aria-label="Preview screen">
          {screens.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={shown === id}
              className={`px-2.5 py-1 rounded-xs text-xs border ${shown === id ? 'border-accent text-fg' : 'border-border text-fg-muted hover:text-fg'}`}
              onClick={() => setScreen(id)}
            >
              {id === 'intro' ? 'Intro' : id === 'finish' ? 'Finish' : steps.find((s) => s.id === id)?.title || id}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-bg p-4 sm:p-6 max-w-2xl" data-testid="onboarding-preview">
          {shown === 'intro' && (
            <>
              <h4 className="text-xl font-semibold tracking-tight">{config.intro.title}</h4>
              <p className="text-fg-secondary mt-2 text-sm">{config.intro.body}</p>
              <p className="text-xs text-fg-muted mt-4">
                {steps.length} {steps.length === 1 ? 'step' : 'steps'}: {steps.map((s) => s.id).join(', ') || 'none'}
                {!goalsOn && config.steps.some((s) => s.id === 'goal' && s.enabled) ? ' (the goal step is hidden while daily goals are off)' : ''}.
              </p>
            </>
          )}
          {step && (
            <>
              <h4 className="text-lg font-semibold tracking-tight">{step.title}</h4>
              {step.subtitle && <p className="text-fg-secondary text-sm mt-1 mb-4">{step.subtitle}</p>}
              {step.id === 'motivation' && (
                <ChoiceCards
                  ariaLabel="Motivation (preview)"
                  value={motivation}
                  onChange={(id) => setMotivation(id)}
                  options={config.motivation.options.map((o) => ({ value: o.id || '?', title: o.label || o.id, description: o.description || undefined, meta: o.icon }))}
                />
              )}
              {step.id === 'track' && (
                <TrackChoiceList
                  ariaLabel="Track (preview)"
                  layout="list"
                  value={track ?? tracks[0]?.id ?? null}
                  onChange={setTrack}
                  tracks={tracks.map((t) => ({
                    id: t.id,
                    label: t.label,
                    description: (Object.prototype.hasOwnProperty.call(config.track.blurbs, t.id) ? config.track.blurbs[t.id] : '') || 'Its own tagline'
                  }))}
                />
              )}
              {step.id === 'experience' && (
                <ChoiceCards
                  ariaLabel="Experience (preview)"
                  columns={1}
                  value={experience}
                  onChange={(id) => setExperience(id)}
                  options={LEVELS.map((id) => ({
                    value: id,
                    title: config.experience.options[id]?.label ?? id,
                    description: config.experience.options[id]?.description || undefined,
                    meta: config.experience.options[id]?.action
                  }))}
                />
              )}
              {step.id === 'goal' && (
                <ChoiceCards
                  ariaLabel="Daily goal (preview)"
                  value={goal ?? draft.goals.defaultOptionId}
                  onChange={(id) => setGoal(id)}
                  options={draft.goals.options
                    .filter((o) => o.enabled)
                    .map((o) => ({ value: o.id, title: o.label, description: o.blurb || undefined, meta: describeGoalTarget(o.metric, o.target) }))}
                />
              )}
              {step.id === 'mode' && (
                <LearningModeCards options={config.mode.options} value={mode ?? recommended} recommended={recommended} recommendedLabel="Suggested for you" onChoose={setMode} />
              )}
              <p className="text-xs text-fg-muted mt-4">{step.skippable ? 'The learner can skip this step.' : 'The learner must answer to go on.'}</p>
            </>
          )}
          {shown === 'finish' && (
            <>
              <h4 className="text-xl font-semibold tracking-tight">{config.finish.title}</h4>
              <p className="text-fg-secondary mt-2 text-sm">{config.finish.body}</p>
              {action === 'offer-placement' && (
                <div className="mt-4 rounded-lg border border-border px-4 py-3">
                  <div className="font-medium text-sm">{config.experience.placementPrompt.title}</div>
                  <p className="text-sm text-fg-secondary mt-1">{config.experience.placementPrompt.body}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    <span className="btn btn-primary btn-sm">{config.experience.placementPrompt.startLabel}</span>
                    <span className="btn btn-secondary btn-sm">{config.experience.placementPrompt.skipLabel}</span>
                  </div>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {action === 'placement' && <span className="btn btn-secondary btn-sm">{config.finish.ctaLabel}</span>}
                <span className="btn btn-primary btn-sm">{action === 'placement' ? config.finish.placementCtaLabel : config.finish.ctaLabel}</span>
              </div>
              <p className="text-xs text-fg-muted mt-4">
                {experience
                  ? `After "${config.experience.options[experience]?.label}" (${action}). A placement is offered only while placement is on and there is something to place.`
                  : 'Pick an experience answer in its step to see where Finish leads.'}
              </p>
            </>
          )}
        </div>
      </Card>
      <GenericSection {...props} />
    </div>
  );
};
