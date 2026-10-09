import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PUBLIC_SETTINGS } from '../../settings/merge';
import { setSettingsSnapshot } from '../../settings/store';
import { executionDisabledReason } from '../policy';
import { compilerService, isRefusedRun } from '../compilerService';
import { api, ApiError } from '../../api-client/api';

afterEach(() => { setSettingsSnapshot(DEFAULT_PUBLIC_SETTINGS); vi.restoreAllMocks(); });

describe('coding policy', () => {
  it.each(['javascript', 'typescript', 'python', 'sql', 'java', 'c', 'cpp', 'go', 'html', 'css'] as const)('pauses %s without invoking an engine', async language => {
    const settings = structuredClone(DEFAULT_PUBLIC_SETTINGS);
    settings.coding.languages[language] = false;
    setSettingsSnapshot(settings);
    const request = vi.spyOn(api, 'execute');
    const result = await compilerService.executeCode('some code', language, { preferLocal: true });
    expect(result.reason).toBe('admin-disabled');
    expect(isRefusedRun(result)).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps workflows independent and does not confuse playground availability with runtime capability', async () => {
    const settings = structuredClone(DEFAULT_PUBLIC_SETTINGS);
    settings.coding.workflows.playground = false;
    setSettingsSnapshot(settings);
    expect(compilerService.canRun('javascript')).toBe(true);
    expect(executionDisabledReason(settings.coding, 'javascript', 'challenges')).toBeNull();
    expect((await compilerService.executeCode('console.log(1)', 'javascript')).reason).toBe('admin-disabled');
    settings.coding.workflows.examples = false;
    expect((await compilerService.executeCode('print(1)', 'python', { workflow: 'examples' })).reason).toBe('admin-disabled');
  });

  it('gates web previews on all three embedded languages, not just the selected editor tab', () => {
    const settings = structuredClone(DEFAULT_PUBLIC_SETTINGS.coding);
    settings.languages.javascript = false;
    expect(executionDisabledReason(settings, 'web')).toContain('HTML, CSS and JavaScript');
    expect(executionDisabledReason(settings, 'html', 'examples')).toContain('HTML, CSS and JavaScript');
  });

  it('does not fall back to a browser worker when the server explicitly refuses execution', async () => {
    vi.spyOn(api, 'execute').mockRejectedValue(new ApiError('Paused', 403, { reason: 'admin-disabled', payload: { stderr: 'Paused by admin.' } }));
    const result = await compilerService.executeCode('console.log(1)', 'javascript');
    expect(result).toMatchObject({ reason: 'admin-disabled', engine: 'none', status: 'error' });
  });

  it('applies the master switch to challenge code too', async () => {
    const settings = structuredClone(DEFAULT_PUBLIC_SETTINGS);
    settings.coding.enabled = false;
    setSettingsSnapshot(settings);
    const result = await compilerService.executeCode('return 1', 'javascript', { entryFunction: 'solve', testCases: [] });
    expect(result.reason).toBe('admin-disabled');
  });
});
