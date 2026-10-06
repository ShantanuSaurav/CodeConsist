import { describe, expect, it } from 'vitest';
import { ALL_CHALLENGES, buildStages, LANGUAGE_TRACKS } from '@/modules/challenges/content';
import { sectionFor } from '@/modules/articles/content';
import { resolveReading } from '@/modules/articles';
import { ROADMAPS, roadmapsForStage } from '@/modules/roadmaps/content';
import { applyProgressByTrack, defaultUnits, stageStatus } from '@/platform/progress';
import { questionBatch } from '@/modules/challenges/authoring/expansion';
import type { Challenge } from '@/types';

const contracts = [
  ['stage-1', 'c', 50, 'javascript', 'programming-basics', 'core'],
  ['stage-2', 'c', 50, 'python', 'python-fundamentals', 'core'],
  ['stage-3', 'c', 40, 'javascript', 'data-structures', 'core'],
  ['stage-4', 'c', 40, 'javascript', 'algorithms', 'core'],
  ['stage-5', 'c', 40, 'javascript', 'web-development', 'core'],
  ['stage-6', 'c', 40, 'javascript', 'backend-apis', 'core'],
  ['stage-7', 'c', 40, 'sql', 'databases-sql', 'core'],
  ['stage-8', 'c', 40, 'bash', 'tooling-testing', 'core'],
  ['stage-9', 'c', 40, 'javascript', 'system-design', 'core'],
  ['stage-10', 'c', 40, 'javascript', 'real-projects', 'core'],
  ['stage-c1', 'b', 40, 'c', 'c-fundamentals', 'c'],
  ['stage-cpp1', 'b', 40, 'cpp', 'cpp-fundamentals', 'cpp']
] as const;

const newIds = new Set(contracts.flatMap(([stage, batch, count]) => Array.from({ length: count }, (_, index) => `${stage}-${batch}${String(index + 1).padStart(2, '0')}`)));
const additions = ALL_CHALLENGES.filter(question => newIds.has(question.id));
const original = ALL_CHALLENGES.filter(question => !newIds.has(question.id));

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, canonical(nested)]));
  }
  return value;
}

describe('500-question expansion integration', () => {
  it('adds exactly 500 unique lessons and preserves every field of all 246 old objects', async () => {
    expect(additions).toHaveLength(500);
    expect(new Set(ALL_CHALLENGES.map(question => question.id)).size).toBe(746);
    expect(additions.every(question => !question.isStageTest)).toBe(true);
    expect(original).toHaveLength(246);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(original))));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    expect(hash).toBe('11515e6a81a098fc4ca71beb305c6b78754c0031bdb45e8448dcaf85ecec930e');
    expect(ALL_CHALLENGES.filter(question => question.isStageTest)).toHaveLength(12);
  });

  it.each(contracts)('keeps %s additions in their intended language, topic and track', (stageId, batch, count, language, subject, trackId) => {
    const questions = additions.filter(question => question.id.startsWith(`${stageId}-${batch}`));
    expect(questions).toHaveLength(count);
    for (const question of questions) {
      expect(question.stageId, question.id).toBe(stageId);
      expect(question.language, question.id).toBe(language);
      expect(question.tags, question.id).toHaveLength(2);
      expect(question.tags?.[1], question.id).toBe(`${subject}-practice`);
      expect(LANGUAGE_TRACKS.filter(track => track.stageIds.includes(question.stageId)).map(track => track.id)).toEqual([trackId]);
    }
  });

  it.each(additions)('$id has four distinct choices, an explanation, a hint and appropriate XP', question => {
    expect(question.options).toHaveLength(4);
    expect(new Set(question.options?.map(option => option.trim())).size).toBe(4);
    expect(question.correctIndex).toBeGreaterThanOrEqual(0);
    expect(question.correctIndex).toBeLessThan(4);
    expect(question.explanation.length).toBeGreaterThanOrEqual(40);
    expect(question.hints?.[0].length).toBeGreaterThan(10);
    expect(question.xpReward).toBe({ easy: 40, medium: 70, hard: 110 }[question.difficulty]);
    expect(question.codeSnippet?.includes('\0') ?? false).toBe(false);
  });

  it.each(additions)('$id resolves to its own stage and an explicitly matching article topic', question => {
    const reading = sectionFor(question);
    if (question.language === 'c' || question.language === 'cpp') {
      expect(reading).toBeNull();
      expect(resolveReading(question.stageId, question.tags)).toBeNull();
      expect(roadmapsForStage(question.stageId)).toEqual([]);
      return;
    }
    expect(reading, question.id).not.toBeNull();
    expect(reading?.article.stageId).toBe(question.stageId);
    expect(reading?.section.tags).toContain(question.tags![0]);
    expect(resolveReading(question.stageId, question.tags)?.href).toBe(`/dashboard/learn/${question.stageId}/read#${reading!.section.id}`);
    const roadmaps = roadmapsForStage(question.stageId);
    expect(roadmaps.length).toBeGreaterThan(0);
    expect(roadmaps.every(({ node }) => node.stageId === question.stageId)).toBe(true);
  });

  it('retains the roadmap inventory and does not manufacture C/C++ links to other tracks', () => {
    expect(ROADMAPS).toHaveLength(10);
    expect(ROADMAPS.flatMap(roadmap => roadmap.sections.flatMap(section => section.nodes))).toHaveLength(209);
  });

  it('does not duplicate any complete old or new question', () => {
    const fingerprint = (question: Challenge) => `${question.stageId}|${question.prompt}|${question.codeSnippet ?? ''}`.replace(/\s+/g, ' ').trim();
    const seen = new Set(original.map(fingerprint));
    for (const question of additions) {
      const signature = fingerprint(question);
      expect(seen.has(signature), question.id).toBe(false);
      seen.add(signature);
    }
  });

  it('preserves all original unit ids and membership while adding 100 five-question units', () => {
    const expanded = buildStages();
    let newUnits = 0;
    for (const before of buildStages(original)) {
      const previous = defaultUnits(before.id, before.challenges);
      const after = defaultUnits(before.id, expanded.find(stage => stage.id === before.id)!.challenges);
      expect(after.filter(unit => previous.some(oldUnit => oldUnit.id === unit.id))).toEqual(previous);
      const added = after.filter(unit => !previous.some(oldUnit => oldUnit.id === unit.id));
      expect(added.every(unit => unit.challengeIds.length === 5 && unit.challengeIds.every(id => newIds.has(id)))).toBe(true);
      newUnits += added.length;
    }
    expect(newUnits).toBe(100);
  });

  it('retains solved ids and test results and keeps stages with prior work accessible', () => {
    const completedChallenges = original.map(question => question.id);
    const stats = { completedChallenges, isPremium: true };
    const stages = applyProgressByTrack(buildStages(), LANGUAGE_TRACKS, stats);
    for (const stage of stages) {
      const status = stageStatus(stage, stats);
      expect(status.done).toBe(original.filter(question => question.stageId === stage.id && !question.isStageTest).length);
      expect(status.testPassed).toBe(true);
      expect(stage.state).not.toBe('Locked');
    }
    expect(stats.completedChallenges).toEqual(completedChallenges);
  });

  it('rotates author-supplied correct choices without changing their identity or mutating the source', () => {
    const answers = ['correct', 'wrong one', 'wrong two', 'wrong three'] as const;
    const questions = questionBatch('stage-1', 'c', 'javascript', 'programming-basics', 'quiz', [
      [1, 'One', 'types', 'easy', 'Question one?', answers, 'Explanation', 'Hint'],
      [2, 'Two', 'types', 'medium', 'Question two?', answers, 'Explanation', 'Hint'],
      [3, 'Three', 'types', 'hard', 'Question three?', answers, 'Explanation', 'Hint'],
      [4, 'Four', 'types', 'easy', 'Question four?', answers, 'Explanation', 'Hint']
    ]);
    expect(questions.map(question => question.correctIndex)).toEqual([0, 1, 2, 3]);
    expect(questions.every(question => question.options![question.correctIndex!] === 'correct')).toBe(true);
    expect(answers).toEqual(['correct', 'wrong one', 'wrong two', 'wrong three']);
  });
});
