import React, { useEffect, useRef, useState } from 'react';
import { Award, Check, ChevronsUp, ClipboardList, Star, Target, Trophy } from 'lucide-react';
import { ProgressRing, StreakFlame } from '@/ui';
import { BadgeTierChip, LevelUpOverlay, XpCountUp } from '@/ui/celebrations';

/**
 * The end of a unit (or a stage test): the XP counting up, accuracy, time,
 * the streak flame, the perfect-unit line, any badges this run earned, and
 * what to do next. Loaded on demand (React.lazy in PracticeModal), so none
 * of this - nor the celebration pieces it uses - is in the shell chunk.
 *
 * Every figure comes in as a prop; PracticeModal works them out from the run
 * (session/useUnitRun.ts) and the settings (`celebrations`).
 */
export interface UnitCompleteProps {
  variant: 'unit' | 'test';
  heading: string;
  body?: React.ReactNode;
  /** XP paid during the run, bonus included. */
  xp: number;
  countUpMs: number;
  /** First-try share of the questions solved, or null when nothing was solved this run. */
  accuracy: number | null;
  /** "4 first try · 1 fixed on retry", once a question came back and was got right. */
  retryLine?: string | null;
  timeMs: number;
  streak: { before: number; after: number };
  /** "5-day streak" (`celebrations.copy.streakUp`), shown when the streak went up. */
  streakLine: string;
  /** "Perfect unit! +25 XP" when the bonus was paid. */
  perfectLine: string | null;
  /** "Flawless run" on a replay answered first try throughout. */
  flawlessLine: string | null;
  /** Today's daily goal as it stands (a ring beside the streak), or null when goals are off. */
  goal?: { done: number; target: number; met: boolean; percent: number; label: string } | null;
  /** "Daily goal met +10 XP" when a solve in this run met it (`reminders.goalMet.cardTitle`). */
  goalLine?: string | null;
  newBadges: Array<{ id: string; title: string; tierName?: string; tier?: number }>;
  /** Signed in but not confirmed by the server: say it is kept here. */
  pendingSync: boolean;
  /** The run crossed a level: the level-up screen after the count-up, or a line (see `levelUpOverlay`). */
  levelUp: { title: string; newRankLine: string | null; detail: string } | null;
  /**
   * `celebrations.levelUpOverlay`: false shows the level crossed as a line on
   * this screen instead of the full-screen dialog - never nothing.
   */
  levelUpOverlay?: boolean;
  /** Once, on arrival: confetti and the sound, as the caller's settings allow. */
  onEnter?: () => void;
  onLevelUp?: () => void;
  /** The level-up screen opened or closed (the lesson's own focus trap and keys pause meanwhile). */
  onOverlayChange?: (open: boolean) => void;
  actions: React.ReactNode;
}

function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** An admin-worded line as a spoken sentence: a full stop unless it already ends in one ("Unit complete!"). */
function sentence(text: string): string {
  const t = text.trim();
  return !t || /[.!?]$/.test(t) ? t : `${t}.`;
}

function spokenTime(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} seconds`;
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}${rest ? ` ${rest} seconds` : ''}`;
}

const UnitComplete: React.FC<UnitCompleteProps> = ({
  variant,
  heading,
  body,
  xp,
  countUpMs,
  accuracy,
  retryLine = null,
  timeMs,
  streak,
  streakLine,
  perfectLine,
  flawlessLine,
  goal = null,
  goalLine = null,
  newBadges,
  pendingSync,
  levelUp,
  levelUpOverlay = true,
  onEnter,
  onLevelUp,
  onOverlayChange,
  actions
}) => {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const entered = useRef(false);
  const streakUp = streak.after > streak.before;
  const levelLine = levelUp && !levelUpOverlay ? levelUp : null;

  // Confetti and the sound, once.
  useEffect(() => {
    if (entered.current) return;
    entered.current = true;
    onEnter?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The level-up screen (or just its sound, when it is a line) follows the
  // count-up. Keyed on the title, not the object, which is new every render.
  const levelShown = useRef(false);
  const levelTitle = levelUp?.title ?? null;
  useEffect(() => {
    if (!levelTitle || levelShown.current) return;
    const timer = window.setTimeout(() => {
      levelShown.current = true;
      if (levelUpOverlay) {
        setOverlayOpen(true);
        onOverlayChange?.(true);
      }
      onLevelUp?.();
    }, Math.max(0, countUpMs) + 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelTitle, levelUpOverlay]);

  // Back from the level-up screen, the keyboard lands on what to do next
  // (Continue, Take the stage test, ...) rather than on the dialog itself.
  const actionsRef = useRef<HTMLDivElement>(null);
  const closeOverlay = () => {
    setOverlayOpen(false);
    onOverlayChange?.(false);
    window.setTimeout(() => {
      const actions = actionsRef.current;
      (actions?.querySelector<HTMLElement>('.btn-solid') ?? actions?.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
    }, 0);
  };

  const summary = [
    sentence(heading),
    `${xp} XP earned.`,
    accuracy !== null ? `Accuracy ${accuracy}%.` : '',
    retryLine ? sentence(retryLine) : '',
    `Time ${spokenTime(timeMs)}.`,
    streakUp ? sentence(streakLine) : '',
    perfectLine ? sentence(perfectLine) : flawlessLine ? sentence(flawlessLine) : '',
    goalLine ? sentence(goalLine) : goal ? `Daily goal ${goal.percent}% done.` : '',
    // The level-up dialog announces itself; the line does not.
    levelLine ? sentence(levelLine.title) : '',
    levelLine?.newRankLine ? sentence(levelLine.newRankLine) : '',
    newBadges.length ? `New ${newBadges.length === 1 ? 'badge' : 'badges'}: ${newBadges.map((b) => b.title).join(', ')}.` : '',
    pendingSync ? 'Saved on this device, will sync.' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="celebration-view unit-complete">
      <p className="sr-only" role="status">
        {summary}
      </p>

      <div className="celebration-icon" aria-hidden="true">
        {variant === 'test' ? <Trophy size={20} /> : perfectLine ? <Star size={20} /> : <ClipboardList size={20} />}
      </div>

      <h2 className="celebration-title">{heading}</h2>
      <XpCountUp to={xp} durationMs={countUpMs} className="unit-complete-xp" />
      {body ? <div className="unit-complete-body">{body}</div> : null}

      {perfectLine ? (
        <p className="unit-complete-perfect">
          <Star size={14} aria-hidden="true" /> {perfectLine}
        </p>
      ) : flawlessLine ? (
        <p className="unit-complete-perfect is-flawless">
          <Check size={14} aria-hidden="true" /> {flawlessLine}
        </p>
      ) : null}

      {retryLine ? <p className="unit-complete-retry">{retryLine}</p> : null}

      {goalLine ? (
        <p className="unit-complete-perfect is-goal">
          <Target size={14} aria-hidden="true" /> {goalLine}
        </p>
      ) : null}

      {levelLine ? (
        <p className="unit-complete-level" aria-hidden="true">
          <ChevronsUp size={14} /> {levelLine.title}
          {levelLine.newRankLine ? <span className="unit-complete-rank"> · {levelLine.newRankLine}</span> : null}
        </p>
      ) : null}

      <div className={`celebration-stats ${goal ? 'has-goal' : ''}`.trim()} aria-hidden="true">
        <div className="celebration-stat-box">
          <strong>{accuracy === null ? '—' : `${accuracy}%`}</strong>
          <span>Accuracy</span>
        </div>
        <div className="celebration-stat-box">
          <strong>{formatTime(timeMs)}</strong>
          <span>Time</span>
        </div>
        <div className="celebration-stat-box">
          <strong>
            <StreakFlame streak={streak.after} increased={streakUp} size={16} />
          </strong>
          <span>{streakUp ? streakLine : 'Day streak'}</span>
        </div>
        {goal && (
          <div className="celebration-stat-box">
            <strong>
              <ProgressRing value={goal.done} max={goal.target} size={30} stroke={3} tone={goal.met ? 'success' : 'accent'} label={goal.label}>
                {goal.met ? <Check size={12} strokeWidth={3} /> : null}
              </ProgressRing>
            </strong>
            <span>{goal.met ? 'Goal met' : `Goal ${goal.percent}%`}</span>
          </div>
        )}
      </div>

      {newBadges.length > 0 && (
        <ul className="unit-complete-badges" aria-hidden="true">
          {newBadges.map((badge) => (
            <li key={badge.id}>
              <Award size={14} className="text-accent" />
              <span>{badge.title}</span>
              {badge.tierName ? <BadgeTierChip tierName={badge.tierName} tierIndex={badge.tier ?? 0} /> : null}
            </li>
          ))}
        </ul>
      )}

      {pendingSync && <p className="unit-complete-sync">Saved on this device, will sync.</p>}

      <div className="celebration-actions" ref={actionsRef}>
        {actions}
      </div>

      {overlayOpen && levelUp && levelUpOverlay && (
        <LevelUpOverlay title={levelUp.title} newRankLine={levelUp.newRankLine} detail={levelUp.detail} onClose={closeOverlay} />
      )}
    </div>
  );
};

export default UnitComplete;
