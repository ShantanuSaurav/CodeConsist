/* ==========================================================================
   Editable copy with `{tokens}`.

   Copy is plain text - never HTML, never markdown - so an administrator's
   edit can only ever change words. A token that the text is not allowed to
   use is rejected when it is saved (schema.ts); one with no value at render
   time is simply left out rather than printed as "{name}".
   ========================================================================== */

const TOKEN_RE = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

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
