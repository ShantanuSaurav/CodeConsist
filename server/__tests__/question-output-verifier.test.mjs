import { describe, expect, it } from 'vitest';
import { isExpansionQuestion, normalizeOutput, verifyPrediction } from '../../scripts/verify-question-expansion.mjs';

describe('question output verification', () => {
  const question = { id: 'stage-1-c01', type: 'output_prediction', options: ['42', '41', '0', 'undefined'], correctIndex: 0 };

  it('compares actual output, not merely a well-formed answer index', () => {
    expect(() => verifyPrediction(question, '42\n')).not.toThrow();
    expect(() => verifyPrediction(question, '41\n')).toThrow(/differs from the answer key/);
  });

  it('rejects duplicate matching answers', () => {
    expect(() => verifyPrediction({ ...question, options: ['42', '42', '0', '1'] }, '42')).toThrow(/exactly one option/);
  });

  it('normalizes Windows newlines without hiding significant spaces or blank lines', () => {
    expect(normalizeOutput('first\r\nsecond\r\n')).toBe('first\nsecond');
    expect(normalizeOutput(' value \n\n')).toBe(' value \n');
    expect(() => verifyPrediction(question, ' 42')).toThrow();
  });

  it('does not mistake existing questions or stage tests for new content', () => {
    for (const id of ['stage-1-c01', 'stage-10-c40', 'stage-c1-b01', 'stage-cpp1-b40']) expect(isExpansionQuestion({ id })).toBe(true);
    for (const id of ['stage-1-a00', 'stage-10-b01', 'stage-c1-a01', 'stage-1-test', 'stage-11-c01']) expect(isExpansionQuestion({ id })).toBe(false);
  });
});
