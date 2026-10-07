import { describe, expect, it } from 'vitest';
import { appendPlaygroundRun, normalizePlaygroundProgram, playgroundTitle, samePlaygroundProgram, successfulPlaygroundRun, PLAYGROUND_LANGUAGES, type PlaygroundProgram } from '../model';

const program: PlaygroundProgram = { language: 'javascript', code: 'console.log(1)', stdin: '' };
describe('playground library contracts', () => {
  it.each(PLAYGROUND_LANGUAGES)('accepts and normalizes %s snapshots', (language) => {
    const value = language === 'web' ? { language, files: { html: '<p>Hi</p>', css: '', js: '' } } : { ...program, language };
    expect(normalizePlaygroundProgram({ ...value, userId: 'not-the-owner' })).toEqual(value);
  });
  it.each([null, [], {}, { ...program, language: '__proto__' }, { ...program, code: 4 }, { ...program, stdin: 'ignored' }, { ...program, code: 'x'.repeat(100001) }, { ...program, language: 'java', stdin: 'x'.repeat(10001) }, { language: 'web', files: { html: 'x', css: 4, js: '' } }, { language: 'web', files: { html: 'x'.repeat(100001), css: '', js: '' } }])('rejects malformed or oversized programs %#', (value) => {
    expect(normalizePlaygroundProgram(value)).toBeNull();
  });
  it('requires an actual successful execution without stderr', () => {
    expect(successfulPlaygroundRun({ status: 'passed' })).toBe(true);
    expect(successfulPlaygroundRun({ status: 'passed', stderr: 'error' })).toBe(false);
    expect(successfulPlaygroundRun({ status: 'failed' })).toBe(false);
    expect(successfulPlaygroundRun({ status: 'error', reason: 'runtime-unavailable' })).toBe(false);
  });
  it('includes language, stdin and every web file when checking save eligibility', () => {
    expect(samePlaygroundProgram(program, { ...program })).toBe(true);
    expect(samePlaygroundProgram(program, { ...program, language: 'python' })).toBe(false);
    expect(samePlaygroundProgram(program, { ...program, code: 'changed' })).toBe(false);
    expect(samePlaygroundProgram({ ...program, language: 'java', stdin: '1' }, { ...program, language: 'java', stdin: '2' })).toBe(false);
    const web: PlaygroundProgram = { language: 'web', files: { html: '', css: '', js: '' } };
    for (const file of ['html', 'css', 'js']) expect(samePlaygroundProgram(web, { ...web, files: { ...web.files, [file]: 'changed' } })).toBe(false);
  });
  it('caps history independently per language and deduplicates exact programs', () => {
    let history = [{ id: 'sql', ranAt: '', program: { language: 'sql', code: 'SELECT 1;', stdin: '' } as PlaygroundProgram }];
    for (let index = 0; index < 30; index++) history = appendPlaygroundRun(history, { id: String(index), program: { ...program, code: String(index) }, ranAt: '' });
    expect(history).toHaveLength(21);
    expect(history[0].id).toBe('sql');
    history = appendPlaygroundRun(history, { id: 'retry', program: { ...program, code: '29' }, ranAt: '' });
    expect(history).toHaveLength(21);
    expect(history[1].id).toBe('retry');
  });
  it('validates trimmed names without interpreting markup', () => {
    expect(playgroundTitle('  My code  ')).toBe('My code');
    expect(playgroundTitle('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
    expect(playgroundTitle(' ')).toBeNull();
    expect(playgroundTitle('x'.repeat(81))).toBeNull();
  });
});
