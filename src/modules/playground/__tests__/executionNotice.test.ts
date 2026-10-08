import { describe, expect, it } from 'vitest';
import { largeProgramNotice } from '../components/executionNotice';

describe('large-program execution notices', () => {
  it.each(['c', 'cpp', 'java', 'go'] as const)('identifies server resources for %s without browser advice', language => {
    const notice = largeProgramNotice(language);
    expect(notice).toContain('Runs on our server, not your device.');
    expect(notice).toContain('server resources are busy');
    expect(notice).not.toContain('Close unused tabs');
  });

  it.each(['python', 'sql'] as const)('identifies local browser resources for %s', language => {
    const notice = largeProgramNotice(language);
    expect(notice).toContain('Runs in your browser');
    expect(notice).toContain('Close unused tabs');
    expect(notice).not.toContain('server resources');
  });

  it.each(['javascript', 'typescript'] as const)('explains both execution paths for %s', language => {
    const notice = largeProgramNotice(language);
    expect(notice).toContain('Normally runs on our server');
    expect(notice).toContain('offline browser execution');
    expect(notice).toContain('only when running in your browser');
  });
});
