/**
 * The bank from the API as a viewer without access to a premium stage gets
 * it: that stage's challenges are `locked` stubs (no prompt, no answers).
 * They must still group into their stage - the path shows the stage, its
 * lesson count and its test - and the list of locked stages must survive
 * into the bundle.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Challenge } from '@/types';

const content = vi.hoisted(() => ({ response: null as unknown, fail: false }));

vi.mock('../../api-client/api', () => ({
  api: {
    content: async () => {
      if (content.fail) throw new Error('offline');
      return content.response;
    }
  }
}));

import { groupIntoStages, loadFromApi, makeBundle } from '../content';
import { contentStatsOf } from '../useContentStats';

const stageMeta = (id: string, extra: { isPremium?: boolean } = {}) => ({
  id,
  index: '01',
  name: id,
  description: '',
  language: 'javascript' as const,
  isPremium: Boolean(extra.isPremium)
});

const lesson = (id: string, stageId: string, extra: Partial<Challenge> = {}): Challenge => ({
  id,
  stageId,
  title: id,
  type: 'quiz',
  difficulty: 'easy',
  language: 'javascript',
  prompt: `What does ${id} do?`,
  options: ['a', 'b'],
  correctIndex: 0,
  explanation: 'Because.',
  xpReward: 10,
  ...extra
});

/** What server/content.js lockedStub sends: the listing fields and `locked`. */
const stub = (id: string, stageId: string, extra: Partial<Challenge> = {}) =>
  ({ id, stageId, type: 'quiz', title: id, difficulty: 'easy', xpReward: 10, language: 'javascript', locked: true, ...extra }) as unknown as Challenge;

const RESPONSE = {
  stages: [stageMeta('s1'), stageMeta('s2', { isPremium: true })],
  challenges: [lesson('a', 's1'), lesson('b', 's1'), lesson('t1', 's1', { isStageTest: true }), stub('c', 's2'), stub('d', 's2'), stub('t2', 's2', { isStageTest: true })],
  languageTracks: [{ id: 'core', label: 'Developer path', icon: '', tagline: '', description: '', primaryLanguage: 'javascript', stageIds: ['s1', 's2'] }],
  hiddenLanguages: [],
  lockedStageIds: ['s2']
};

afterEach(() => {
  content.response = null;
  content.fail = false;
});

describe('groupIntoStages', () => {
  it('groups stubs into their stage, the stub test as its test', () => {
    const stages = groupIntoStages(RESPONSE.stages, RESPONSE.challenges);
    const premium = stages.find((s) => s.id === 's2')!;
    expect(premium.challenges.map((c) => c.id)).toEqual(['c', 'd']);
    expect(premium.challenges.every((c) => c.locked)).toBe(true);
    expect(premium.test?.id).toBe('t2');
    expect(premium.test?.locked).toBe(true);
    // Nothing that answers them came along.
    expect(premium.challenges[0].prompt).toBeUndefined();
    expect(premium.challenges[0].options).toBeUndefined();
  });
});

describe('loadFromApi', () => {
  it('keeps the stubs and the locked stage ids', async () => {
    content.response = RESPONSE;
    const bundle = await loadFromApi();
    expect(bundle).not.toBeNull();
    expect(bundle!.source).toBe('api');
    expect(bundle!.lockedStageIds).toEqual(['s2']);
    expect(bundle!.byId.get('c')?.locked).toBe(true);
    expect(bundle!.byId.get('a')?.locked).toBeUndefined();
    expect(bundle!.stages.find((s) => s.id === 's2')?.challenges).toHaveLength(2);
  });

  it('treats an older server that sends no lockedStageIds as none locked', async () => {
    const { lockedStageIds: _dropped, ...older } = RESPONSE;
    content.response = older;
    expect((await loadFromApi())!.lockedStageIds).toEqual([]);
  });

  it('is null when the server cannot be reached', async () => {
    content.fail = true;
    expect(await loadFromApi()).toBeNull();
  });
});

describe('makeBundle', () => {
  it('has no locked stages for the bundled content', () => {
    expect(makeBundle([], [], []).lockedStageIds).toEqual([]);
  });
});

describe('contentStatsOf', () => {
  it('counts stubs like any lesson, and splits free and premium stages', () => {
    expect(contentStatsOf(RESPONSE.challenges, RESPONSE.stages, 1)).toEqual({
      lessons: 4,
      tests: 2,
      stages: 2,
      tracks: 1,
      freeStages: 1,
      premiumStages: 1
    });
  });
});
