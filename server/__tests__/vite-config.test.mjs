/**
 * Source maps stay out of production builds.
 *
 * A .map file next to the bundle hands every visitor the original source,
 * comments and all. vite.config.ts decides per build; scripts/check-dist.mjs
 * is the CI backstop that looks at what a build actually wrote.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import configFn from '../../vite.config.ts';

let savedSourcemap;

beforeEach(() => {
  savedSourcemap = process.env.SOURCEMAP;
  // loadEnv reads process.env too, so a SOURCEMAP left in the shell must not decide the test.
  delete process.env.SOURCEMAP;
});

afterEach(() => {
  if (savedSourcemap === undefined) delete process.env.SOURCEMAP;
  else process.env.SOURCEMAP = savedSourcemap;
});

const sourcemapFor = async (mode) => {
  const config = await configFn({ mode, command: 'build', isSsrBuild: false, isPreview: false });
  return config.build.sourcemap;
};

describe('vite build sourcemaps', () => {
  it('are off for a production build', async () => {
    expect(await sourcemapFor('production')).toBe(false);
  });

  it('are on for a development-mode build', async () => {
    expect(await sourcemapFor('development')).toBe(true);
  });

  it('can be switched on for one debugging build with SOURCEMAP=true', async () => {
    process.env.SOURCEMAP = 'true';
    expect(await sourcemapFor('production')).toBe(true);
  });
});
