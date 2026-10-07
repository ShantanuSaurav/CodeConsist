import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { ALL_CHALLENGES, buildStages, LANGUAGE_TRACKS } from '@/modules/challenges/content';
import { sectionFor } from '@/modules/articles';
import { roadmapsForStage } from '@/modules/roadmaps';
import { defaultUnits } from '@/platform/progress';
import { executeSql } from '@/platform/execution/sql-engine';

const additions = ALL_CHALLENGES.filter(question => /^stage-7-d\d+$/.test(question.id));
const before = ALL_CHALLENGES.filter(question => !/^stage-7-d\d+$/.test(question.id));
let runtime: SqlJsStatic;
beforeAll(async () => { runtime = await initSqlJs(); });

describe('100 executable SQL exercises', () => {
  it('adds exactly 100 distinct SQL lessons to the existing stage and core track', () => {
    expect(additions).toHaveLength(100);
    expect(new Set(additions.map(question => question.id)).size).toBe(100);
    expect(new Set(additions.map(question => question.prompt)).size).toBe(100);
    expect(new Set(additions.map(question => question.solutionCode)).size).toBe(100);
    expect(ALL_CHALLENGES).toHaveLength(846);
    expect(before).toHaveLength(746);
    expect(LANGUAGE_TRACKS.filter(track => track.stageIds.includes('stage-7')).map(track => track.id)).toEqual(['core']);
  });

  it.each(additions)('$id executes against both fixed, independent datasets and rejects a placeholder', question => {
    expect(question.type).toBe('code_runner');
    expect(question.language).toBe('sql');
    expect(question.stageId).toBe('stage-7');
    expect(question.isStageTest).toBeUndefined();
    expect(question.testCases).toHaveLength(2);
    expect(question.testCases![0].input).not.toBe(question.testCases![1].input);
    expect(executeSql(runtime, { code: question.solutionCode!, testCases: question.testCases })).toMatchObject({ status: 'passed', testResults: [{ passed: true }, { passed: true }] });
    expect(executeSql(runtime, { code: question.starterCode!, testCases: question.testCases }).status).not.toBe('passed');
    const reading = sectionFor(question);
    expect(reading?.article.stageId).toBe('stage-7');
    expect(reading?.section.tags).toContain(question.tags![0]);
    expect(roadmapsForStage(question.stageId).length).toBeGreaterThan(0);
  });

  it('keeps all old unit memberships and adds 20 SQL units without moving other stages', () => {
    const current = buildStages();
    for (const stage of buildStages(before)) {
      const oldUnits = defaultUnits(stage.id, stage.challenges);
      const units = defaultUnits(stage.id, current.find(item => item.id === stage.id)!.challenges);
      expect(units.slice(0, oldUnits.length)).toEqual(oldUnits);
      expect(units.length - oldUnits.length).toBe(stage.id === 'stage-7' ? 20 : 0);
    }
  });
});
