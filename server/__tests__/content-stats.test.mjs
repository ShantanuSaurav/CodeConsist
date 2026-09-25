/**
 * The helpers behind `npm run content:stats` and the index.html numbers.
 * Pure text in, text out - the counting itself is exercised by the script in
 * `npm run check`, against the real bank.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  README_END,
  README_START,
  isDirectRun,
  lessonsLabel,
  packageDescription,
  readmeBlock,
  updatePackageJson,
  updateReadme
} from '../../scripts/content-stats.mjs';

const stats = {
  lessons: 234,
  tests: 12,
  stages: 12,
  tracks: 3,
  freeStages: 10,
  premiumStages: 2,
  byTrack: [
    { id: 'core', label: 'Developer path', stages: 10, lessons: 204 },
    { id: 'c', label: 'C', stages: 1, lessons: 15 }
  ]
};

describe('content stats', () => {
  it('rounds lessons down to a ten, so console-added questions never make the meta wrong', () => {
    expect(lessonsLabel(234)).toBe('230+');
    expect(lessonsLabel(240)).toBe('240+');
    expect(lessonsLabel(7)).toBe('7');
  });

  it('rewrites only the marked README block, in the file’s own line endings', () => {
    const before = `# Title\r\n\r\n${README_START}\r\nold numbers\r\n${README_END}\r\n\r\nRest.\r\n`;
    const after = updateReadme(before, stats);
    expect(after).toBe(`# Title\r\n\r\n${README_START}\r\n${readmeBlock(stats)}\r\n${README_END}\r\n\r\nRest.\r\n`);
    expect(readmeBlock(stats)).toContain('234 lessons and 12 stage tests across 12 stages on 3 tracks');
    expect(readmeBlock(stats)).toContain('C: 15 lessons in 1 stage');
    expect(updateReadme(after, stats)).toBe(after);
  });

  it('refuses a README without the markers rather than guessing where the numbers go', () => {
    expect(() => updateReadme('# Title\n', stats)).toThrow(/content-stats:start/);
  });

  it('replaces the package.json description and nothing else', () => {
    const before = '{\n  "name": "x",\n  "description": "old \\"quoted\\" text",\n  "engines": {}\n}\n';
    const after = updatePackageJson(before, stats);
    expect(JSON.parse(after).description).toBe(packageDescription(stats));
    expect(after.replace(/"description": ".*",/, '')).toBe(before.replace(/"description": ".*",/, ''));
  });
});

/**
 * `--check` only runs when the script is the one node was asked to run. If
 * that test goes wrong the script prints nothing and exits 0, and
 * `npm run check` passes whatever the README says - so a checkout reached
 * through a symlink or a Windows junction has to count as a direct run.
 */
describe('content stats direct-run detection', () => {
  let dir;
  let real;
  let script;
  let other;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'cc-stats-'));
    real = path.join(dir, 'repo');
    mkdirSync(path.join(real, 'scripts'), { recursive: true });
    script = path.join(real, 'scripts', 'content-stats.mjs');
    other = path.join(real, 'scripts', 'other.mjs');
    writeFileSync(script, '');
    writeFileSync(other, '');
    // 'junction' needs no admin rights on Windows and is ignored elsewhere.
    symlinkSync(real, path.join(dir, 'link'), 'junction');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('is a direct run when node was given this file, by any path', () => {
    const url = pathToFileURL(script).href;
    expect(isDirectRun(url, script)).toBe(true);
    expect(isDirectRun(url, path.join(dir, 'link', 'scripts', 'content-stats.mjs'))).toBe(true);
    expect(isDirectRun(url, path.join(real, 'scripts', '..', 'scripts', 'content-stats.mjs'))).toBe(true);
  });

  it('is not a direct run when the file is imported by something else', () => {
    const url = pathToFileURL(script).href;
    expect(isDirectRun(url, other)).toBe(false);
    expect(isDirectRun(url, path.join(dir, 'missing.mjs'))).toBe(false);
    expect(isDirectRun(url, undefined)).toBe(false);
  });
});
