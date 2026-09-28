/**
 * Vite plugin: fill the content numbers into index.html.
 *
 * index.html is what a search engine and a link preview read, before any
 * script runs - so its description cannot wait for the app to count the
 * bank. This fills the placeholders at build time (and in the dev server)
 * from the same loader the validators use:
 *
 *   %CC_LESSONS%  lessons, rounded down to a ten with "+" ("230+"), so questions
 *                 added later in the admin console never make it wrong
 *   %CC_TESTS%    stage tests
 *   %CC_STAGES%   stages
 *   %CC_TRACKS%   tracks
 *
 * Counted once per process. A production build fails if the bank cannot be
 * loaded, and also if a %CC_...% placeholder is left over after filling - a
 * typo such as %CC_TEST% would otherwise ship verbatim in the meta tag, since
 * Vite itself only reports unknown %VITE_...% names. The dev server only warns
 * in both cases and leaves the placeholders in the (never displayed) meta tag,
 * rather than refusing to serve the page over a content typo.
 */
import { computeContentStats, lessonsLabel } from './content-stats.mjs';

/** Anything that still looks like one of our placeholders once they are all filled. */
const UNFILLED = /%CC_[A-Z0-9_]*%/g;

export function contentStatsPlugin() {
  let command = 'build';
  /** @type {Promise<Record<string, string> | null> | null} */
  let values = null;

  const load = () =>
    computeContentStats().then((s) => ({
      '%CC_LESSONS%': lessonsLabel(s.lessons),
      '%CC_TESTS%': String(s.tests),
      '%CC_STAGES%': String(s.stages),
      '%CC_TRACKS%': String(s.tracks)
    }));

  return {
    name: 'codeconsist-content-stats',
    configResolved(config) {
      command = config.command;
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        if (!html.includes('%CC_')) return html;
        values ??= load().catch((err) => {
          if (command === 'build') throw err;
          console.warn(`[content-stats] could not count the content bank: ${err?.message ?? err}`);
          return null;
        });
        const replacements = await values;
        if (!replacements) return html;
        const filled = Object.entries(replacements).reduce((out, [token, value]) => out.replaceAll(token, value), html);

        const unknown = [...new Set(filled.match(UNFILLED) ?? [])];
        if (unknown.length) {
          const message =
            `index.html has ${unknown.length === 1 ? 'a placeholder' : 'placeholders'} this plugin does not fill: ` +
            `${unknown.join(', ')}. Known: ${Object.keys(replacements).join(', ')}.`;
          if (command === 'build') throw new Error(message);
          console.warn(`[content-stats] ${message}`);
        }
        return filled;
      }
    }
  };
}
