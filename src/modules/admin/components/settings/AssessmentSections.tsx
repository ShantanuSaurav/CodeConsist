import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Info } from 'lucide-react';
import { maxRunsFor } from '@/platform/progress';
import { pathsInSection } from '@/platform/settings';
import type { SettingsContext } from '../../services/adminApi';
import { Badge, Card } from '../ui';
import { GenericSection } from './GenericSection';
import type { SectionProps } from './GenericSection';

type PathStage = NonNullable<SettingsContext['path']>['stages'][number];
type PathTrack = NonNullable<SettingsContext['path']>['tracks'][number];

const LANGUAGE_LABEL: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  html: 'HTML'
};

/** "at most 3 runs" for a pass mark, with the retry penalty being edited. */
export function runsLine(passMark: number, retryPenalty: number): string {
  const runs = maxRunsFor(passMark, retryPenalty);
  return `At ${passMark}%, at most ${runs} ${runs === 1 ? 'run' : 'runs'} can pass (each run after the first costs ${retryPenalty} points).`;
}

/**
 * Whether this server can check a stage test's answer itself, in words. With
 * `access.requireServerVerification` on, a test it cannot check cannot be
 * tested out of (and a guest's claim for it is refused).
 */
export function verifiabilityText(test: NonNullable<PathStage['test']>, required: boolean): { text: string; ok: boolean } {
  const language = LANGUAGE_LABEL[test.language] ?? test.language;
  if (test.verifiable === null) return { text: 'Not known yet (the server is starting).', ok: true };
  if (test.verifiable) return { text: `${language}: checked on this server.`, ok: true };
  if (!required) return { text: `${language}: not verifiable on this server - taken on trust (server checks are off).`, ok: true };
  return { text: `${language}: not verifiable on this server, so it cannot be tested out of.`, ok: false };
}

/** A stage test's row: its stage, its test, whether the server can check it, and a link to edit it. */
const StageRow: React.FC<{
  stage: PathStage;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  label: string;
  requireCheck: boolean;
  /** Why this box cannot be changed now (shown as its tooltip), or undefined. */
  lockedReason?: string;
}> = ({ stage, checked, onToggle, label, requireCheck, lockedReason }) => {
  const test = stage.test;
  const check = test ? verifiabilityText(test, requireCheck) : null;
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 border-b border-border-subtle last:border-b-0">
      <label className="flex items-start gap-2 min-w-0 flex-1 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1"
          checked={checked}
          disabled={!test || Boolean(lockedReason)}
          title={lockedReason}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`${label}: Stage ${stage.index} ${stage.name}`}
        />
        <span className="min-w-0">
          <span className="text-sm text-fg">
            Stage {String(stage.index).padStart(2, '0')} · {stage.name}
          </span>{' '}
          {stage.isPremium && <Badge tone="warning">Premium</Badge>}
          <span className={`block text-xs ${check && !check.ok ? 'text-warning' : 'text-fg-muted'}`}>
            {test ? `Test: ${test.title} · ${check?.text}` : 'No stage test - nothing to take.'}
          </span>
          {lockedReason && <span className="block text-xs text-fg-muted">{lockedReason}</span>}
        </span>
      </label>
      {test && (
        <Link
          to={`/admin/challenges?stage=${encodeURIComponent(stage.id)}&edit=${encodeURIComponent(test.id)}`}
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline min-h-[32px]"
          title="The stage tests are the placement and test-out content"
        >
          Edit the test <ExternalLink size={12} />
        </Link>
      )}
    </li>
  );
};

function tracksWithStages(context: SettingsContext | null): Array<{ track: PathTrack; stages: PathStage[] }> {
  const path = context?.path;
  if (!path) return [];
  const byId = new Map(path.stages.map((s) => [s.id, s]));
  return path.tracks
    .filter((t) => !t.hidden)
    .map((track) => ({ track, stages: track.stageIds.map((id) => byId.get(id)).filter((s): s is PathStage => Boolean(s)) }))
    .filter((t) => t.stages.length > 0);
}

const NoContext: React.FC = () => (
  <p className="text-xs text-fg-muted">The server has not sent the stages yet - the list appears once it has. The JSON field below edits the same setting.</p>
);

/**
 * Placement: the generic fields, the runs its pass mark allows, and which
 * stages a placement may test - a checklist per track (none ticked by hand
 * means every stage with a test, in order).
 */
export const PlacementSection: React.FC<SectionProps> = (props) => {
  const { draft, context, onChange } = props;
  const rules = draft.placement;
  const groups = tracksWithStages(context);
  const byTrack = rules.stagesByTrack ?? {};
  const requireCheck = draft.access?.requireServerVerification !== false;

  const toggle = (trackId: string, withTests: string[], stageId: string, on: boolean) => {
    const listed = Object.prototype.hasOwnProperty.call(byTrack, trackId) && byTrack[trackId].length > 0 ? byTrack[trackId] : withTests;
    const next = on ? [...new Set([...listed, stageId])] : listed.filter((id) => id !== stageId);
    const ordered = withTests.filter((id) => next.includes(id));
    const map: Record<string, string[]> = { ...byTrack };
    // Every stage ticked is the same as none listed: the default, kept sparse.
    if (ordered.length === withTests.length || ordered.length === 0) delete map[trackId];
    else map[trackId] = ordered;
    onChange('placement.stagesByTrack', map);
  };

  return (
    <div>
      <Card className="mb-4 !bg-surface-2">
        <div className="flex items-center gap-2 mb-2">
          <Info size={15} className="text-fg-muted" />
          <h3 className="text-sm font-medium text-fg">At these values</h3>
        </div>
        <p className="text-sm text-fg-secondary">{runsLine(rules.passMark, draft.xp.retryPenalty)}</p>
        <p className="text-sm text-fg-secondary mt-1">
          A placement holds at most {rules.maxStages} {rules.maxStages === 1 ? 'test' : 'tests'}, from the first stage the learner has not cleared
          {rules.stopOnFirstFail ? ', and ends at the first one not passed' : ''}. It can be taken again {rules.retakeAfterDays === 0 ? 'at once' : `after ${rules.retakeAfterDays} ${rules.retakeAfterDays === 1 ? 'day' : 'days'}`}.
        </p>
        {!rules.enabled && <p className="text-sm text-warning mt-1">Placement is switched off: none can start.</p>}
      </Card>

      <Card className="mb-4">
        <h3 className="text-sm font-medium text-fg mb-1">Stages a placement may test</h3>
        <p className="text-xs text-fg-muted mb-3">Per track. With every stage ticked (the default), a placement uses every stage that has a test, in order.</p>
        {groups.length === 0 ? (
          <NoContext />
        ) : (
          groups.map(({ track, stages }) => {
            const withTests = stages.filter((s) => s.test).map((s) => s.id);
            const listed = Object.prototype.hasOwnProperty.call(byTrack, track.id) && byTrack[track.id].length > 0 ? byTrack[track.id] : null;
            // The last stage ticked stays ticked: none listed means every
            // stage, so unticking it would tick them all again.
            const ticked = listed ? listed.filter((id) => withTests.includes(id)) : withTests;
            const lastOne = ticked.length === 1 ? ticked[0] : null;
            return (
              <section key={track.id} className="mb-4 last:mb-0" aria-label={`${track.label} stages`}>
                <h4 className="text-xs font-medium text-fg-secondary uppercase tracking-wide mb-1">
                  {track.label} {listed ? `· ${listed.length} of ${withTests.length} chosen` : '· every stage with a test'}
                </h4>
                <ul>
                  {stages.map((stage) => (
                    <StageRow
                      key={stage.id}
                      stage={stage}
                      label="Use in placement"
                      requireCheck={requireCheck}
                      checked={Boolean(stage.test) && (listed ? listed.includes(stage.id) : true)}
                      onToggle={(on) => toggle(track.id, withTests, stage.id, on)}
                      lockedReason={stage.id === lastOne ? 'At least one stage stays ticked. To offer no placement, switch placement off below.' : undefined}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </Card>

      <GenericSection {...props} only={pathsInSection('placement').filter((p) => p !== 'placement.stagesByTrack')} />
      {/* The same setting as JSON, for tracks the list cannot show (hidden ones). */}
      <GenericSection {...props} only={['placement.stagesByTrack']} />
    </div>
  );
};

/**
 * Test-out: the generic fields, the runs its pass mark allows, and which
 * stages can be tested out of - every stage with its test, whether this
 * server can check that test, and a link to edit it.
 */
export const TestOutSection: React.FC<SectionProps> = (props) => {
  const { draft, context, onChange } = props;
  const rules = draft.testOut;
  const groups = tracksWithStages(context);
  const disabled = new Set(rules.disabledStages);
  const requireCheck = draft.access?.requireServerVerification !== false;
  const unverifiable = (context?.path?.stages ?? []).filter((s) => s.test && s.test.verifiable === false && !disabled.has(s.id));

  const toggle = (stageId: string, allowed: boolean) => {
    const next = allowed ? rules.disabledStages.filter((id) => id !== stageId) : [...new Set([...rules.disabledStages, stageId])];
    onChange('testOut.disabledStages', next);
  };

  return (
    <div>
      <Card className="mb-4 !bg-surface-2">
        <div className="flex items-center gap-2 mb-2">
          <Info size={15} className="text-fg-muted" />
          <h3 className="text-sm font-medium text-fg">At these values</h3>
        </div>
        <p className="text-sm text-fg-secondary">{runsLine(rules.passMark, draft.xp.retryPenalty)}</p>
        <p className="text-sm text-fg-secondary mt-1">
          {rules.maxAttempts} {rules.maxAttempts === 1 ? 'test-out' : 'test-outs'} of a stage per {rules.attemptWindowHours} hours
          {rules.cooldownMinutes > 0 ? `, ${rules.cooldownMinutes} minutes apart after one that failed` : ''}; each stays open {rules.sessionMinutes} minutes.
          {rules.countsAsCleared ? ' A pass clears the stage and opens the next one.' : ' A pass opens the stage; the next one waits for its lessons.'}
        </p>
        {!rules.enabled && <p className="text-sm text-warning mt-1">Test-out is switched off: the path shows no Test out button.</p>}
        {requireCheck && unverifiable.length > 0 && (
          <p className="flex items-start gap-2 text-sm text-warning mt-2" role="alert">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              {unverifiable.length} {unverifiable.length === 1 ? 'stage test' : 'stage tests'} cannot be checked on this server, so {unverifiable.length === 1 ? 'that stage' : 'those stages'} cannot be
              tested out of while "Test-outs need a server check" is on (Limits &amp; access). Leave {unverifiable.length === 1 ? 'it' : 'them'} out below, or relax that rule.
            </span>
          </p>
        )}
      </Card>

      <Card className="mb-4">
        <h3 className="text-sm font-medium text-fg mb-1">Stages that can be tested out of</h3>
        <p className="text-xs text-fg-muted mb-3">Untick a stage to hide its Test out button (it is added to the list of stages that cannot be tested out of).</p>
        {groups.length === 0 ? (
          <NoContext />
        ) : (
          groups.map(({ track, stages }) => (
            <section key={track.id} className="mb-4 last:mb-0" aria-label={`${track.label} stages`}>
              <h4 className="text-xs font-medium text-fg-secondary uppercase tracking-wide mb-1">{track.label}</h4>
              <ul>
                {stages.map((stage) => (
                  <StageRow
                    key={stage.id}
                    stage={stage}
                    label="Can be tested out of"
                    requireCheck={requireCheck}
                    checked={Boolean(stage.test) && !disabled.has(stage.id)}
                    onToggle={(on) => toggle(stage.id, on)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </Card>

      <GenericSection {...props} only={pathsInSection('testOut').filter((p) => p !== 'testOut.disabledStages')} />
      <GenericSection {...props} only={['testOut.disabledStages']} />
    </div>
  );
};
