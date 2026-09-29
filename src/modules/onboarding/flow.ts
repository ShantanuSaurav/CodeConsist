/**
 * The first-run setup's rules, pure (Phase 5): which steps show, what an
 * experience answer suggests, and where Finish leads.
 *
 * Every word and every switch is the admin's (`onboarding` settings); this
 * file only decides with them, so the page and its tests agree.
 */
import type { LearningMode, OnboardingAnswers } from '@/types';
import type { ExperienceAction, ExperienceLevel, OnboardingSettings, OnboardingStep } from '@/platform/settings';

const EXPERIENCE_LEVELS: readonly ExperienceLevel[] = ['new', 'some', 'experienced'];

/** Is this one of the fixed experience answers? */
export function isExperienceLevel(value: unknown): value is ExperienceLevel {
  return typeof value === 'string' && (EXPERIENCE_LEVELS as readonly string[]).includes(value);
}

/**
 * The steps a learner walks through, in the admin's order: the ones switched
 * on - and of those, the goal step only while daily goals are on (with an
 * option to pick), and the track step only when there is a track to choose.
 */
export function visibleSteps(config: Pick<OnboardingSettings, 'enabled' | 'steps'>, ctx: { hasGoals: boolean; trackCount: number }): OnboardingStep[] {
  if (!config.enabled) return [];
  const seen = new Set<string>();
  return config.steps.filter((step) => {
    if (!step.enabled || seen.has(step.id)) return false;
    seen.add(step.id);
    if (step.id === 'goal' && !ctx.hasGoals) return false;
    if (step.id === 'track' && ctx.trackCount <= 1) return false;
    return true;
  });
}

/** What an experience answer leads to (null: none given). */
export function experienceAction(config: Pick<OnboardingSettings, 'experience'>, experience: string | null | undefined): ExperienceAction | null {
  if (!isExperienceLevel(experience)) return null;
  return config.experience.options[experience]?.action ?? null;
}

/** The learning mode an experience answer suggests on the mode step, or null. */
export function recommendedMode(config: Pick<OnboardingSettings, 'experience'>, experience: string | null | undefined): LearningMode | null {
  if (!isExperienceLevel(experience)) return null;
  const mode = config.experience.options[experience]?.recommendMode;
  return mode === 'learn' || mode === 'practice' ? mode : null;
}

/** Where Finish leads: straight to the path, into a placement, or the placement offered beside the path. */
export type FinishAction = 'start' | 'placement' | 'offer-placement';

/**
 * Where the setup ends, from the experience answer: its `action` - while a
 * placement is possible for the chosen track (placement on, something to
 * place). Without one (no answer, placement off, nothing to place) it is
 * the path.
 */
export function nextAction(
  answers: Pick<OnboardingAnswers, 'experience'>,
  config: Pick<OnboardingSettings, 'experience'>,
  ctx: { placementAvailable: boolean }
): FinishAction {
  const action = experienceAction(config, answers.experience);
  if (!action || action === 'start' || !ctx.placementAvailable) return 'start';
  return action;
}

/** Has this step been answered? (A skipped step has not.) */
export function stepAnswered(step: Pick<OnboardingStep, 'id'>, answers: OnboardingAnswers): boolean {
  switch (step.id) {
    case 'motivation':
      return typeof answers.motivation === 'string' && answers.motivation.length > 0;
    case 'track':
      return typeof answers.trackId === 'string' && answers.trackId.length > 0;
    case 'experience':
      return isExperienceLevel(answers.experience);
    case 'goal':
      return typeof answers.dailyGoalId === 'string' && answers.dailyGoalId.length > 0;
    case 'mode':
      return answers.learningMode === 'learn' || answers.learningMode === 'practice';
    default:
      return false;
  }
}

/**
 * The answers to keep: only those of the steps shown (a step switched off,
 * or skipped, leaves its field out - the learner's earlier choice stands).
 */
export function answersToKeep(steps: readonly Pick<OnboardingStep, 'id'>[], answers: OnboardingAnswers): OnboardingAnswers {
  const out: OnboardingAnswers = {};
  for (const step of steps) {
    if (!stepAnswered(step, answers)) continue;
    if (step.id === 'motivation') out.motivation = answers.motivation;
    else if (step.id === 'track') out.trackId = answers.trackId;
    else if (step.id === 'experience') out.experience = answers.experience;
    else if (step.id === 'goal') out.dailyGoalId = answers.dailyGoalId;
    else if (step.id === 'mode') out.learningMode = answers.learningMode;
  }
  return out;
}
