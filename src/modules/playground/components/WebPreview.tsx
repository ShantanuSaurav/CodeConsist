import React, { useEffect, useRef } from 'react';

export interface WebFiles {
  html: string;
  css: string;
  js: string;
}

export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  text: string;
}

/**
 * Runs inside the preview before any learner code. It forwards console output
 * and uncaught errors to the Playground, and swaps in in-memory storage: the
 * frame has an opaque origin (no allow-same-origin), so the real
 * localStorage throws there - which is exactly what keeps the app's own
 * session token out of reach of the page being previewed.
 */
const BRIDGE = String.raw`
(function () {
  var RUN = __RUN__;
  function fmt(v, depth) {
    depth = depth || 0;
    try {
      if (v === undefined) return 'undefined';
      if (v === null) return 'null';
      if (typeof v === 'string') return depth ? JSON.stringify(v) : v;
      if (typeof v === 'function') return 'ƒ ' + (v.name || 'anonymous') + '()';
      if (typeof v === 'symbol' || typeof v === 'bigint') return String(v) + (typeof v === 'bigint' ? 'n' : '');
      if (typeof v !== 'object') return String(v);
      if (v instanceof Error) return v.name + ': ' + v.message;
      if (typeof Element !== 'undefined' && v instanceof Element) {
        return '<' + v.tagName.toLowerCase() + (v.id ? '#' + v.id : '') +
          (typeof v.className === 'string' && v.className ? '.' + v.className.trim().split(/\s+/).join('.') : '') + '>';
      }
      if (depth > 2) return Array.isArray(v) ? '[…]' : '{…}';
      if (Array.isArray(v)) return '[' + v.map(function (x) { return fmt(x, depth + 1); }).join(', ') + ']';
      if (v instanceof Map) return 'Map(' + v.size + ')';
      if (v instanceof Set) return 'Set(' + v.size + ')';
      var keys = Object.keys(v);
      return '{' + keys.slice(0, 50).map(function (k) { return k + ': ' + fmt(v[k], depth + 1); }).join(', ') +
        (keys.length > 50 ? ', …' : '') + '}';
    } catch (e) {
      return String(v);
    }
  }
  function send(level, args) {
    try {
      parent.postMessage({ __devlingoPreview: RUN, level: level, text: Array.prototype.map.call(args, function (a) { return fmt(a); }).join(' ') }, '*');
    } catch (e) {}
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      send(level === 'debug' ? 'log' : level, arguments);
      if (original) original.apply(console, arguments);
    };
  });
  window.addEventListener('error', function (e) {
    send('error', [(e.error && e.error.name ? e.error.name + ': ' : '') + e.message + (e.lineno ? ' (line ' + e.lineno + ')' : '')]);
  });
  window.addEventListener('unhandledrejection', function (e) {
    send('error', ['Uncaught (in promise) ' + fmt(e.reason)]);
  });
  function memoryStorage() {
    var data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      clear: function () { data = {}; },
      key: function (i) { return Object.keys(data)[i] || null; },
      get length() { return Object.keys(data).length; }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try { window[name].getItem('x'); } catch (e) {
      try { Object.defineProperty(window, name, { value: memoryStorage(), configurable: true }); } catch (e2) {}
    }
  });
})();
`;

/** Stop learner text from closing our wrapper tags early. */
const escapeScript = (s: string) => s.replace(/<\/script/gi, '<\\/script');
const escapeStyle = (s: string) => s.replace(/<\/style/gi, '<\\/style');

/** One HTML document from the three files, with the console bridge first in line. */
export function buildDocument(files: WebFiles, runId: number): string {
  const bridge = `<script>${BRIDGE.replace('__RUN__', String(runId))}</script>`;
  const style = files.css.trim() ? `<style>\n${escapeStyle(files.css)}\n</style>` : '';
  const script = files.js.trim() ? `<script>\n${escapeScript(files.js)}\n</script>` : '';
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${bridge}${style}`;

  let html = files.html;
  const isFullDocument = /<html[\s>]/i.test(html) || /<head[\s>]/i.test(html) || /<body[\s>]/i.test(html);
  if (!isFullDocument) {
    return `<!DOCTYPE html><html><head>${head}</head><body>\n${html}\n${script}</body></html>`;
  }

  // A full document: slot our head content and script into the learner's own structure.
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => `${m}${head}`);
  else if (/<html[^>]*>/i.test(html)) html = html.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`);
  else html = `${head}${html}`;

  if (/<\/body>/i.test(html)) html = html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${script}</body>`);
  else html += script;
  return html;
}

interface WebPreviewProps {
  /** The document to show. A new value reloads the frame. */
  srcDoc: string;
  runId: number;
  onLog: (entry: LogEntry) => void;
}

/**
 * The live page. `sandbox` deliberately omits allow-same-origin: scripts run,
 * but in an opaque origin that cannot touch the app, its cookies or its
 * storage.
 */
export const WebPreview: React.FC<WebPreviewProps> = ({ srcDoc, runId, onLog }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.__devlingoPreview !== runId) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const level: LogLevel = ['info', 'warn', 'error'].includes(data.level) ? data.level : 'log';
      onLogRef.current({ level, text: String(data.text ?? '').slice(0, 5000) });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [runId]);

  return (
    <iframe
      ref={frameRef}
      title="Web preview"
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-modals allow-forms allow-popups"
      className="w-full h-full min-h-[18rem] border-0 bg-white"
    />
  );
};
