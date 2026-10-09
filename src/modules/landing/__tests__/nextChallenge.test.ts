import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Challenge, Stage } from '@/types';
import { useNextChallenge, type NextChallenge } from '../components/useNextChallenge';

const fixture = vi.hoisted(() => ({ session: {} }));
vi.mock('@/platform/session', () => ({ useSession: () => fixture.session }));
const stage = (id: string, state: Stage['state']) => ({ id, state });
const lesson = (id: string, stageId: string, type: Challenge['type'] = 'quiz') => ({ id, stageId, type } as Challenge);

function select(stages: ReturnType<typeof stage>[], challenges: Challenge[], solved: string[], match = (_c: Challenge) => true) {
  fixture.session = {
    learnerStages: stages,
    learnerChallenges: challenges.filter((c) => stages.some((s) => s.id === c.stageId)),
    allChallenges: challenges,
    stats: { completedChallenges: solved }
  };
  let result: NextChallenge | null = null;
  function Probe() { result = useNextChallenge(match); return null; }
  renderToString(React.createElement(Probe));
  return result as NextChallenge | null;
}

describe('landing lesson previews', () => {
  it('offers an accessible review while the next stage is locked', () => {
    const first = lesson('first', 'one');
    const result = select([stage('one', 'Test pending'), stage('two', 'Locked')], [first, lesson('later', 'two')], ['first']);
    expect(result?.challenge.id).toBe('first');
    expect(result?.position).toBe(1);
  });
  it('never substitutes a lesson from another language track', () => {
    expect(select([stage('c', 'In progress')], [lesson('c-quiz', 'c'), lesson('js-code', 'js', 'code_runner')], [], c => c.type === 'code_runner')).toBeNull();
  });
  it('excludes premium stubs and stage tests from the preview', () => {
    expect(select([stage('one', 'In progress')], [
      { ...lesson('premium', 'one'), locked: true },
      { ...lesson('test', 'one'), isStageTest: true }
    ], [])).toBeNull();
  });
});
