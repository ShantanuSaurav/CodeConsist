/**
 * Where the autocomplete popup goes depends on the editor's line height,
 * padding and character width. They are read from the textarea itself, so the
 * popup follows the CSS (--code-font-size, --code-line-height, the padding)
 * instead of numbers copied from it.
 *
 * Browser-only: call it from handlers, never at module load (tests import the
 * editors in node).
 */

export interface EditorMetrics {
  lineHeight: number;
  paddingTop: number;
  paddingLeft: number;
  charWidth: number;
}

// The editor font is monospace, so one advance places every column, and it
// changes only with the font: measure it once per font and keep it.
const charWidths = new Map<string, number>();
let measureCtx: CanvasRenderingContext2D | null | undefined;

function fontLoaded(font: string): boolean {
  try {
    return document.fonts.check(font);
  } catch {
    return true;
  }
}

function monoCharWidth(font: string, fontSize: number): number {
  const known = charWidths.get(font);
  if (known !== undefined) return known;
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  // JetBrains Mono's advance is 0.6em: the answer when nothing can measure.
  let width = fontSize * 0.6;
  if (measureCtx) {
    measureCtx.font = font;
    width = measureCtx.measureText('0'.repeat(50)).width / 50 || width;
  }
  // Until the web font arrives the canvas measures a fallback face; keep the
  // width only once the real one is in, so an early popup is not off for good.
  if (fontLoaded(font)) charWidths.set(font, width);
  return width;
}

export function readEditorMetrics(el: HTMLTextAreaElement): EditorMetrics {
  const style = getComputedStyle(el);
  const fontSize = parseFloat(style.fontSize) || 13;
  return {
    // A computed line-height is in px, or 'normal', which the editor never sets.
    lineHeight: parseFloat(style.lineHeight) || fontSize * 1.2,
    paddingTop: parseFloat(style.paddingTop) || 0,
    paddingLeft: parseFloat(style.paddingLeft) || 0,
    charWidth: monoCharWidth(`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`, fontSize)
  };
}
