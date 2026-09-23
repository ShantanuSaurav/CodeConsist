import { describe, expect, it } from 'vitest';
import {
  CONSOLE_LINE_CAP,
  ConsoleEntry,
  FRAME_MESSAGE_SOURCE,
  WebPlayground,
  acceptFrameMessage,
  appendConsoleEntries,
  composeDocument,
  escapeClosingTag,
  fileFor,
  isFullDocument,
  normalizeWebDraft,
  readWebDraft,
  serializeForConsole,
  withFile,
  writeWebDraft
} from '../components/WebPlayground';
import { WEB_EXAMPLES, WebFiles, defaultExample, matchingExample } from '../components/webExamples';

const RUN = 'run-test-1';

function files(over: Partial<WebFiles> = {}): WebFiles {
  return { html: '<p>hi</p>', css: 'p { color: red; }', js: 'console.log(1);', ...over };
}

function entry(id: number): ConsoleEntry {
  return { id, level: 'log', text: 'line ' + id };
}

/* ------------------------------------------------------- document composition */

describe('composeDocument', () => {
  it('wraps a fragment in a full document with the CSS and JS threaded in', () => {
    const doc = composeDocument(files(), RUN);

    expect(doc.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(doc).toContain('<style>\np { color: red; }\n</style>');
    expect(doc).toContain('<script>\nconsole.log(1);\n</script>');
    expect(doc).toContain('<p>hi</p>');

    // The instrumentation is in <head> and the ready ping is last, so it only
    // fires once the learner's own script has returned.
    expect(doc.indexOf(FRAME_MESSAGE_SOURCE)).toBeLessThan(doc.indexOf('<p>hi</p>'));
    expect(doc.indexOf("kind: 'ready'")).toBeGreaterThan(doc.indexOf('console.log(1);'));
  });

  it('leaves out the style and script tags when those files are empty', () => {
    const doc = composeDocument({ html: '<p>hi</p>', css: '   ', js: '' }, RUN);
    expect(doc).not.toContain('<style>');
    // The console prologue and the ready ping are still scripts, so count those out.
    expect(doc).not.toContain('<script>\n\n</script>');
  });

  it('threads instrumentation through a full document the learner wrote', () => {
    const html = [
      '<!DOCTYPE html>',
      '<html>',
      '<head><title>Mine</title></head>',
      '<body><h1>Mine</h1></body>',
      '</html>'
    ].join('\n');

    const doc = composeDocument({ html, css: 'h1 { margin: 0; }', js: 'console.log(2);' }, RUN);

    expect(doc.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(doc).toContain('<title>Mine</title>');
    // Prologue lands inside the learner's own <head>, before their content.
    expect(doc.indexOf(FRAME_MESSAGE_SOURCE)).toBeLessThan(doc.indexOf('<h1>Mine</h1>'));
    // Their CSS and JS files still apply - they are files in the same project.
    expect(doc).toContain('h1 { margin: 0; }');
    expect(doc.indexOf('console.log(2);')).toBeLessThan(doc.indexOf('</body>'));
    expect(doc.indexOf("kind: 'ready'")).toBeLessThan(doc.indexOf('</body>'));
  });

  it('builds a head for a full document that has none', () => {
    const doc = composeDocument({ html: '<html><body>bare</body></html>', css: '', js: '' }, RUN);
    expect(doc).toContain('<head>');
    expect(doc.indexOf(FRAME_MESSAGE_SOURCE)).toBeLessThan(doc.indexOf('bare'));
  });

  it('neutralises a </script> hiding in the learner JavaScript', () => {
    const js = 'const bad = "</script><img src=x>";\nconsole.log(bad);';
    const doc = composeDocument(files({ js }), RUN);

    // If this ever fails, the injected block terminates early and the rest of
    // the learner's code is rendered as markup.
    expect(doc).not.toContain('"</script>');
    expect(doc).toContain('"<\\/script>');
    expect(doc).toContain('console.log(bad);');
  });

  it('neutralises a </style> hiding in the learner CSS', () => {
    const doc = composeDocument(files({ css: 'p::after { content: "</style>"; }' }), RUN);
    expect(doc).not.toContain('"</style>"');
    expect(doc).toContain('"<\\/style>"');
  });

  it('does not let $& or $1 in the learner code be eaten as a replacement pattern', () => {
    const js = "const re = 'a'.replace(/a/, '$&$&');";
    const css = 'p::after { content: "$1"; }';
    const doc = composeDocument({ html: '<html><head></head><body></body></html>', css, js }, RUN);

    expect(doc).toContain("'$&$&'");
    expect(doc).toContain('content: "$1";');
  });

  it('carries the run id so a stale frame can be told apart', () => {
    expect(composeDocument(files(), 'run-a')).toContain('"run-a"');
    expect(composeDocument(files(), 'run-b')).not.toContain('"run-a"');
  });

  it('resolves the line offset so an error points at script.js, not at the composed page', () => {
    const doc = composeDocument(files({ js: 'line1();\nline2();' }), RUN);

    expect(doc).not.toContain('__JS_LINE_OFFSET__');
    const offset = Number(doc.match(/var jsOffset = (\d+);/)?.[1]);
    expect(Number.isInteger(offset)).toBe(true);

    // Document line (offset + n) must be line n of script.js.
    const lines = doc.split('\n');
    expect(lines[offset]).toBe('line1();');
    expect(lines[offset + 1]).toBe('line2();');
  });

  it('leaves the offset at zero when there is no script.js to blame', () => {
    const doc = composeDocument({ html: '<p>hi</p>', css: '', js: '' }, RUN);
    expect(doc).toContain('var jsOffset = 0;');
  });

  it('injects the real serialiser, not a second copy that can drift', () => {
    const doc = composeDocument(files(), RUN);
    // Strings only this function produces. If the serialiser ever starts
    // closing over a module constant, its source stops being self-contained
    // and this is the test that notices.
    expect(doc).toContain('[Circular]');
    expect(doc).toContain('[unserializable value]');
    expect(doc).not.toContain('CONSOLE_LINE_CAP');
  });
});

describe('isFullDocument', () => {
  it('recognises a doctype or an <html> tag and nothing else', () => {
    expect(isFullDocument('<!DOCTYPE html><p>x</p>')).toBe(true);
    expect(isFullDocument('\n  <!doctype html>')).toBe(true);
    expect(isFullDocument('<html lang="en">')).toBe(true);
    expect(isFullDocument('<p>x</p>')).toBe(false);
    expect(isFullDocument('')).toBe(false);
    // A word starting with "html" is not a document.
    expect(isFullDocument('<htmlish>x</htmlish>')).toBe(false);
  });
});

describe('escapeClosingTag', () => {
  it('is case insensitive and leaves everything else alone', () => {
    expect(escapeClosingTag('a </SCRIPT> b', 'script')).toBe('a <\\/SCRIPT> b');
    expect(escapeClosingTag('a </scripting b', 'script')).toBe('a <\\/scripting b');
    expect(escapeClosingTag('const x = 1;', 'script')).toBe('const x = 1;');
  });
});

/* ------------------------------------------------------------- the serialiser */

describe('serializeForConsole', () => {
  it('prints primitives the way a console does', () => {
    expect(serializeForConsole(undefined)).toBe('undefined');
    expect(serializeForConsole(null)).toBe('null');
    expect(serializeForConsole('plain')).toBe('plain');
    expect(serializeForConsole(42)).toBe('42');
    expect(serializeForConsole(NaN)).toBe('NaN');
    expect(serializeForConsole(true)).toBe('true');
    expect(serializeForConsole(10n)).toBe('10n');
  });

  it('quotes strings once they are nested', () => {
    expect(serializeForConsole(['a, b'])).toBe('["a, b"]');
    expect(serializeForConsole({ k: 'v' })).toBe('{ k: "v" }');
  });

  it('names functions', () => {
    expect(serializeForConsole(function named() {})).toBe('[Function: named]');
    expect(serializeForConsole(() => {})).toContain('[Function:');
  });

  it('prints an Error as name and message, not as an empty object', () => {
    expect(serializeForConsole(new TypeError('bad input'))).toBe('TypeError: bad input');
  });

  it('describes a DOM node without walking into it', () => {
    const node = { nodeType: 1, nodeName: 'DIV', id: 'box', className: 'card wide' };
    expect(serializeForConsole(node)).toBe('<div#box.card.wide>');
    expect(serializeForConsole({ nodeType: 3, nodeName: '#text' })).toBe('<#text>');
  });

  it('survives a cycle', () => {
    const a: any = { name: 'a' };
    a.self = a;
    expect(serializeForConsole(a)).toBe('{ name: "a", self: [Circular] }');
  });

  it('prints the same object twice when it is a sibling, not a cycle', () => {
    const shared = { n: 1 };
    expect(serializeForConsole([shared, shared])).toBe('[{ n: 1 }, { n: 1 }]');
  });

  it('stops descending after a few levels', () => {
    expect(serializeForConsole({ a: { b: { c: { d: { e: 1 } } } } })).toContain('[Object]');
  });

  it('caps a long array and a long string', () => {
    const long = serializeForConsole(Array.from({ length: 80 }, (_, i) => i));
    expect(long).toContain('... 30 more');

    const huge = serializeForConsole('x'.repeat(5000));
    expect(huge.length).toBeLessThan(2100);
    expect(huge.endsWith('...')).toBe(true);
  });

  it('does not throw on a property that throws', () => {
    const trap = {};
    Object.defineProperty(trap, 'boom', {
      enumerable: true,
      get() {
        throw new Error('nope');
      }
    });
    expect(serializeForConsole(trap)).toBe('{ boom: [throws] }');
  });

  it('is self-contained, so its source can be injected verbatim', () => {
    const source = serializeForConsole.toString();
    expect(source).not.toMatch(/\bimport\b/);
    expect(source).not.toContain('CONSOLE_LEVELS');
    // Recursion goes through a function declared inside the body, so a
    // minifier renaming the outer binding cannot break it.
    expect(source).toContain('function render');
  });
});

/* ------------------------------------------------------- the postMessage gate */

describe('acceptFrameMessage', () => {
  const frame = { marker: 'the live frame' };
  const payload = { source: FRAME_MESSAGE_SOURCE, runId: RUN, kind: 'console', level: 'warn', text: 'careful' };

  it('accepts a well-formed message from the live frame', () => {
    expect(acceptFrameMessage({ data: payload, source: frame }, frame, RUN)).toEqual({
      kind: 'console',
      level: 'warn',
      text: 'careful'
    });
  });

  it('rejects a message from any other window', () => {
    const other = { marker: 'somebody else' };
    expect(acceptFrameMessage({ data: payload, source: other }, frame, RUN)).toBeNull();
    // Including the case where there is no frame mounted at all.
    expect(acceptFrameMessage({ data: payload, source: other }, null, RUN)).toBeNull();
    expect(acceptFrameMessage({ data: payload, source: null }, null, RUN)).toBeNull();
  });

  it('rejects a late message from a frame that has been replaced', () => {
    expect(acceptFrameMessage({ data: payload, source: frame }, frame, 'run-test-2')).toBeNull();
  });

  it('rejects anything not tagged as ours', () => {
    expect(acceptFrameMessage({ data: { ...payload, source: 'other-app' }, source: frame }, frame, RUN)).toBeNull();
    expect(acceptFrameMessage({ data: 'a string', source: frame }, frame, RUN)).toBeNull();
    expect(acceptFrameMessage({ data: null, source: frame }, frame, RUN)).toBeNull();
    expect(acceptFrameMessage({ data: { ...payload, kind: 'eval' }, source: frame }, frame, RUN)).toBeNull();
  });

  it('normalises an unknown level and a non-string body', () => {
    const odd = { ...payload, level: 'catastrophe', text: { a: 1 } };
    expect(acceptFrameMessage({ data: odd, source: frame }, frame, RUN)).toEqual({
      kind: 'console',
      level: 'log',
      text: '{ a: 1 }'
    });
  });

  it('passes the ready ping through', () => {
    const ping = { source: FRAME_MESSAGE_SOURCE, runId: RUN, kind: 'ready' };
    expect(acceptFrameMessage({ data: ping, source: frame }, frame, RUN)).toEqual({ kind: 'ready' });
  });
});

describe('appendConsoleEntries', () => {
  it('keeps the newest lines once the cap is reached', () => {
    const many = Array.from({ length: 260 }, (_, i) => entry(i));
    const kept = appendConsoleEntries([], many);

    expect(kept).toHaveLength(CONSOLE_LINE_CAP);
    expect(kept[0].id).toBe(260 - CONSOLE_LINE_CAP);
    expect(kept[kept.length - 1].id).toBe(259);
  });

  it('appends without a cap breach for a normal run', () => {
    expect(appendConsoleEntries([entry(1)], [entry(2)])).toHaveLength(2);
  });

  it('drops exactly one line when one line over', () => {
    const full = Array.from({ length: 4 }, (_, i) => entry(i));
    const kept = appendConsoleEntries(full, [entry(9)], 4);
    expect(kept.map((e) => e.id)).toEqual([1, 2, 3, 9]);
  });
});

/* ----------------------------------------------------------- files and drafts */

describe('tabs', () => {
  it('reads and writes the file the active tab names', () => {
    const three = files();
    expect(fileFor(three, 'html')).toBe('<p>hi</p>');
    expect(fileFor(three, 'css')).toBe('p { color: red; }');
    expect(fileFor(three, 'js')).toBe('console.log(1);');

    const edited = withFile(three, 'css', 'p { color: blue; }');
    expect(edited.css).toBe('p { color: blue; }');
    // Switching tabs must never touch the other two files.
    expect(edited.html).toBe(three.html);
    expect(edited.js).toBe(three.js);
    expect(three.css).toBe('p { color: red; }');
  });
});

describe('drafts', () => {
  it('falls back to the default example when there is nothing saved', () => {
    const draft = normalizeWebDraft(null);
    expect(draft.files).toEqual(defaultExample().files);
    expect(draft.example).toBe(defaultExample().id);
    expect(draft.tab).toBe('html');
    expect(draft.autoRun).toBe(true);
  });

  it('repairs a draft with junk in it', () => {
    const draft = normalizeWebDraft({ files: { html: '<p>kept</p>', css: 42 }, tab: 'rust', example: 'gone' });
    expect(draft.files.html).toBe('<p>kept</p>');
    expect(draft.files.css).toBe(defaultExample().files.css);
    expect(draft.tab).toBe('html');
    // An example id that no longer exists is worked out from the files instead.
    expect(draft.example).toBeNull();
  });

  it('round-trips through storage', () => {
    const saved = {
      files: { html: '<main>a</main>', css: 'main { color: teal; }', js: 'console.log("a");' },
      tab: 'js' as const,
      example: null,
      autoRun: false
    };
    writeWebDraft(saved);

    const back = readWebDraft();
    expect(back.files).toEqual(saved.files);
    expect(back.tab).toBe('js');
    expect(back.autoRun).toBe(false);
    expect(back.example).toBeNull();
  });

  it('recognises an unedited example after a round trip', () => {
    const example = WEB_EXAMPLES[2];
    writeWebDraft({ files: example.files, tab: 'css', example: null, autoRun: true });
    expect(readWebDraft().example).toBe(example.id);
  });
});

/* -------------------------------------------------------------- the example set */

describe('webExamples', () => {
  it('gives every example three real files and a unique id', () => {
    const ids = new Set<string>();
    for (const example of WEB_EXAMPLES) {
      expect(ids.has(example.id), `duplicate id ${example.id}`).toBe(false);
      ids.add(example.id);

      expect(example.name.length, example.id).toBeGreaterThan(0);
      expect(example.blurb.length, example.id).toBeGreaterThan(0);
      expect(example.files.html.trim().length, example.id).toBeGreaterThan(0);
      expect(example.files.css.trim().length, example.id).toBeGreaterThan(0);
      expect(example.files.js.trim().length, example.id).toBeGreaterThan(0);
    }
    expect(WEB_EXAMPLES.length).toBeGreaterThanOrEqual(6);
  });

  it('never reaches for the network or for storage', () => {
    // The frame has an opaque origin: a CDN link would silently fail and
    // localStorage throws outright. Neither belongs in a teaching example.
    for (const example of WEB_EXAMPLES) {
      const all = example.files.html + example.files.css + example.files.js;
      expect(all, example.id).not.toMatch(/https?:\/\//);
      expect(all, example.id).not.toContain('localStorage');
      expect(all, example.id).not.toContain('sessionStorage');
      expect(all, example.id).not.toContain('fetch(');
      // Mentioning innerHTML in a comment is fine; assigning to it is not.
      expect(all, example.id).not.toMatch(/\.innerHTML\s*=/);
    }
  });

  it('matches an example only when all three files are untouched', () => {
    const example = WEB_EXAMPLES[0];
    expect(matchingExample(example.files)).toBe(example.id);
    expect(matchingExample({ ...example.files, js: '// mine' })).toBeNull();
  });

  it('composes into a document that carries no closing-tag hazard', () => {
    for (const example of WEB_EXAMPLES) {
      const doc = composeDocument(example.files, RUN);
      // One <style> and one <script> for the files, plus prologue and epilogue.
      expect(doc.split('</script>').length - 1, example.id).toBe(3);
      expect(doc.split('</style>').length - 1, example.id).toBe(1);
    }
  });
});

describe('WebPlayground', () => {
  it('is a component taking no props, which is what Playground.tsx renders', () => {
    // Nothing deeper than this here: the test environment is node, so there is
    // no DOM to mount into and an iframe would never execute its scripts
    // anyway. Everything worth asserting lives in the pure helpers above.
    expect(typeof WebPlayground).toBe('function');
    expect(WebPlayground.length).toBeLessThanOrEqual(1);
  });
});
