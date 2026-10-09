/* ==========================================================================
   Editable copy with `{tokens}`.

   Copy is plain text - never HTML, never markdown - so an administrator's
   edit can only ever change words. A token that the text is not allowed to
   use is rejected when it is saved (schema.ts); one with no value at render
   time is simply left out rather than printed as "{name}".
   ========================================================================== */

const TOKEN_RE = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/** Upgrade shipped wording when an older API/cache supplies it. Custom copy stays editable. */
const LEGACY_COPY: Record<string, [string, string]> = {
  'copy.landing.heroFootnote': ['Free to start · {freeStages} free stages, {premiumStages} premium · Every stage ends in a coding test', 'Free to start · {freeStages} free stages, {premiumStages} premium · Every stage ends in a skill test'],
  'copy.landing.finalCta': ['Open the first stage. It takes about twenty minutes.', 'Your next chapter starts with one lesson.'],
  'copy.landing.pathLine': ['{stages} stages, in order, each ending in a coding test.', '{stages} stages, in order, each ending in a skill test.'],
  'copy.landing.pathLineWithSkip': ['{stages} stages, in order, each ending in a coding test. Already know some? Take a short placement or test out of a stage.', '{stages} stages, in order, each ending in a skill test. Already know some? Take a short placement or test out of a stage.'],
  'copy.playground.description': ['Web previews run in a sandboxed frame. JavaScript runs on the server with a browser fallback. Python runs in your browser; SQL uses a fresh, isolated SQLite database. Java, C and C++ use the server when a compiler is available.', 'Write code. Run it. Make it better. Explore JavaScript, Python and SQL, or bring HTML and CSS to life in a web preview.']
};

export function refreshProductCopy(key: string, template: string): string {
  const legacy = LEGACY_COPY[key.startsWith('copy.') ? key : `copy.${key}`];
  const text = legacy && template === legacy[0] ? legacy[1] : template;
  return text.replace(/\bpractis(e|ed|es|ing)\b/gi, (word) => word.replace(/s/i, word === word.toUpperCase() ? 'C' : 'c'));
}

/** The distinct `{tokens}` a template uses, in order of first appearance. */
export function tokensIn(template: string): string[] {
  const seen: string[] = [];
  if (typeof template !== 'string') return seen;
  for (const match of template.matchAll(TOKEN_RE)) {
    if (!seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
}

/** Fill `{tokens}` from `vars`. Unknown or missing tokens become empty text. */
export function fillCopy(template: string, vars: Record<string, string | number | null | undefined> = {}): string {
  if (typeof template !== 'string') return '';
  return template.replace(TOKEN_RE, (_whole, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) return '';
    const value = vars[name];
    return value === null || value === undefined ? '' : String(value);
  });
}
