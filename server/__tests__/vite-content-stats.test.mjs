/**
 * The index.html plugin, run the way Vite runs it: configResolved, then the
 * transformIndexHtml handler, against the real bank.
 *
 * The helpers are covered in content-stats.test.mjs; what can only go wrong
 * here is a placeholder that nothing fills - a typo in index.html, or a new
 * %CC_...% name the plugin was never taught - shipping verbatim in the meta
 * description a search engine reads.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeContentStats, lessonsLabel } from '../../scripts/content-stats.mjs';
import { contentStatsPlugin } from '../../scripts/vite-content-stats.mjs';

const INDEX_HTML = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../index.html');

/** One plugin instance, told which command it is running under, as Vite would. */
function transformFor(command) {
  const plugin = contentStatsPlugin();
  plugin.configResolved({ command });
  return (html) => plugin.transformIndexHtml.handler(html);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('content stats Vite plugin', () => {
  it('fills every placeholder in the real index.html for a build', async () => {
    const html = await readFile(INDEX_HTML, 'utf8');
    expect(html).toContain('%CC_LESSONS%');

    const out = await transformFor('build')(html);
    const stats = await computeContentStats();

    expect(out).not.toMatch(/%CC_/);
    expect(out).toContain(`${lessonsLabel(stats.lessons)} bite-sized lessons`);
    expect(out).toContain(`${stats.tests} stage tests across ${stats.stages} stages on ${stats.tracks} tracks`);
  }, 30_000);

  it('fails a build over a placeholder it does not know, rather than shipping it', async () => {
    const html = '<meta name="description" content="%CC_LESSONS% lessons and %CC_TEST% tests" />';

    await expect(transformFor('build')(html)).rejects.toThrow(/%CC_TEST%/);
  }, 30_000);

  it('only warns in the dev server, so a typo never stops the page being served', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const html = '<meta name="description" content="%CC_LESSONS% lessons and %CC_TEST% tests" />';

    const out = await transformFor('serve')(html);

    expect(out).not.toContain('%CC_LESSONS%');
    expect(out).toContain('%CC_TEST%');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('%CC_TEST%'));
  }, 30_000);
});
