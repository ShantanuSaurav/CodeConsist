import type { Challenge } from '@/types';
import { SQL_EXERCISES } from '../../authoring/sql-exercises';
import { SQL_FIXTURES } from '../../authoring/sql-fixtures';
import expected from '../../authoring/sql-expected.json';

export const challenges: Challenge[] = SQL_EXERCISES.map(([number, title, topic, difficulty, task, solutionCode, hint, explanation]) => ({
  id: `stage-7-d${String(number).padStart(2, '0')}`,
  stageId: 'stage-7',
  title,
  type: 'code_runner',
  language: 'sql',
  difficulty,
  prompt: task,
  starterCode: 'SELECT 1;',
  solutionCode,
  testCases: SQL_FIXTURES.map((input, index) => ({
    input,
    expected: JSON.stringify((expected as Record<string, unknown[]>)[String(number)][index]),
    hidden: index > 0,
    description: index === 0 ? 'Sample database' : 'Independent dataset with different values, ties and NULLs'
  })),
  hints: [hint],
  explanation,
  xpReward: { easy: 40, medium: 70, hard: 110 }[difficulty],
  tags: [topic, 'sqlite-practice']
}));
