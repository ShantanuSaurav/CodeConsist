import React from 'react';
import { Bell, Users } from 'lucide-react';
import { REMINDER_SAMPLE, fillCopy } from '@/platform/settings';
import { Card } from '../ui';
import { GenericSection } from './GenericSection';
import type { SectionProps } from './GenericSection';
import { learners, useEngagement } from './useEngagement';

/** One message as a learner would see it, filled with the sample values. */
const Preview: React.FC<{ label: string; title: string; body?: string; cta?: string }> = ({ label, title, body, cta }) => (
  <li className="py-2 border-b border-border-subtle last:border-b-0">
    <div className="text-[11px] font-mono uppercase tracking-wider text-fg-muted mb-0.5">{label}</div>
    <div className="text-sm">
      <div className="font-medium text-fg">{title || '—'}</div>
      {body ? <div className="text-fg-secondary">{body}</div> : null}
      {cta ? <span className="mt-1 inline-block badge">{cta}</span> : null}
    </div>
  </li>
);

/**
 * In-app reminders: the generic fields (each text field previews itself),
 * plus every message together as learners would see it - the welcome-back
 * tiers included, which the table editor cannot preview - with the sample
 * values, and who would see the at-risk and repair banners now.
 */
export const RemindersSection: React.FC<SectionProps> = (props) => {
  const r = props.draft.reminders;
  const engagement = useEngagement();
  const s = REMINDER_SAMPLE;
  const tiers = [...(r.welcomeBack.tiers ?? [])].sort((a, b) => a.minDays - b.minDays);

  return (
    <div>
      {engagement && (
        <Card className="mb-4 !bg-surface-2">
          <div className="flex items-center gap-2 mb-2">
            <Users size={15} className="text-fg-muted" />
            <h3 className="text-sm font-medium text-fg">Who this affects</h3>
          </div>
          <p className="text-sm text-fg-secondary" data-testid="reminder-impact">
            Right now {learners(engagement.atRiskNow)} would see the at-risk banner and {learners(engagement.repairsOpen)} the repair banner.{' '}
            {learners(engagement.metGoalToday)} met their goal today. Reminders appear in the app only - no email or push is sent.
          </p>
        </Card>
      )}

      <Card className="mb-4 !bg-surface-2">
        <div className="flex items-center gap-2 mb-1">
          <Bell size={15} className="text-fg-muted" />
          <h3 className="text-sm font-medium text-fg">Preview</h3>
        </div>
        <p className="text-xs text-fg-muted mb-2">
          With sample values ({s.name}, a {s.streak}-day streak, {s.freezes} freeze of {s.maxFreezes}). A learner sees one banner at a time: welcome back, then a
          streak to repair, then a freeze used, then at risk.
        </p>
        <ul data-testid="reminder-preview">
          {tiers.map((tier) => (
            <Preview
              key={`${tier.minDays}:${tier.title}`}
              label={`Welcome back · away ${tier.minDays}+ days`}
              title={fillCopy(tier.title, { name: s.name, days: tier.minDays, bestStreak: s.bestStreak })}
              body={fillCopy(tier.body, { name: s.name, days: tier.minDays, bestStreak: s.bestStreak })}
              cta={r.welcomeBack.enabled ? r.welcomeBack.cta : undefined}
            />
          ))}
          <Preview
            label="Streak ended"
            title={fillCopy(r.streakBroken.title, { lostStreak: s.lostStreak })}
            body={fillCopy(r.streakBroken.body, { remaining: s.remaining, deadline: s.deadline })}
            cta={r.streakBroken.cta}
          />
          <Preview label="Freeze used" title={fillCopy(r.freezeUsed, { streak: s.streak, days: s.days })} />
          <Preview
            label={`At risk · from ${String(r.atRisk.fromLocalHour).padStart(2, '0')}:00${r.atRisk.enabled ? '' : ' (off)'}`}
            title={fillCopy(r.atRisk.title, { streak: s.streak })}
            body={fillCopy(r.atRisk.body, { streak: s.streak, hoursLeft: s.hoursLeft })}
            cta={r.atRisk.cta}
          />
          <Preview label="At risk, with a freeze" title={fillCopy(r.atRisk.title, { streak: s.streak })} body={fillCopy(r.atRisk.bodyWithFreeze, { freezes: s.freezes })} />
          <Preview label="Goal met · toast" title={fillCopy(r.goalMet.toast, { goal: s.goal, bonusXp: s.bonusXp })} />
          <Preview
            label="Goal met · in a lesson"
            title={r.goalMet.cardTitle}
            body={`${fillCopy(r.goalMet.cardBody, { streak: s.streak, bonusXp: s.bonusXp })} [${r.goalMet.doneLabel}] [${r.goalMet.moreLabel}]`}
          />
          <Preview label="Freeze earned" title={fillCopy(r.freezeEarned, { freezes: s.freezes, maxFreezes: s.maxFreezes })} />
          <Preview label="Streak repaired" title={fillCopy(r.streakRepaired, { streak: s.streak })} />
        </ul>
      </Card>

      <GenericSection {...props} />
    </div>
  );
};
