import React, { useEffect, useMemo, useState } from 'react';
import { RotateCw, Globe, Sparkles } from 'lucide-react';

interface UiPreviewProps {
  html: string;
  title?: string;
  minHeight?: number | string;
  className?: string;
  badgeText?: string;
}

export const UiPreview: React.FC<UiPreviewProps> = ({
  html,
  title = 'Interactive UI Preview',
  minHeight = 320,
  className = '',
  badgeText = 'Live Component'
}) => {
  const [reloadKey, setReloadKey] = useState(0);
  const [debouncedHtml, setDebouncedHtml] = useState(html);
  const [isUpdating, setIsUpdating] = useState(false);

  // Debounce preview reloads so typing in the editor does not thrash the iframe
  useEffect(() => {
    setIsUpdating(true);
    const timer = setTimeout(() => {
      setDebouncedHtml(html);
      setIsUpdating(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [html]);

  // Wrap html with standard styling reset and error capture
  const documentSrc = useMemo(() => {
    const activeHtml = debouncedHtml;
    // If the html already has full doctype/html/body, we embed it with our script;
    // otherwise wrap it in a complete modern HTML template.
    const isFullDoc = /<!DOCTYPE/i.test(activeHtml) || /<html/i.test(activeHtml);
    const script = `
      <script>
        window.addEventListener('error', function(e) {
          var bar = document.getElementById('__error_bar');
          if (!bar) {
            bar = document.createElement('div');
            bar.id = '__error_bar';
            bar.style.cssText = 'position:fixed;bottom:10px;left:10px;right:10px;padding:10px 14px;background:#ef4444;color:#fff;border-radius:8px;font-family:sans-serif;font-size:12px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
            document.body.appendChild(bar);
          }
          bar.textContent = 'Runtime error: ' + (e.message || String(e));
        });
      </script>
    `;

    const baseCss = `
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 24px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: #0d1117;
          background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
          background-size: 16px 16px;
          color: #e6edf3;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
        }
      </style>
    `;

    if (isFullDoc) {
      if (activeHtml.includes('<head>')) {
        return activeHtml.replace('<head>', `<head>${baseCss}${script}`);
      }
      return `${baseCss}${script}${activeHtml}`;
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${baseCss}
  ${script}
</head>
<body>
  ${activeHtml}
</body>
</html>`;
  }, [debouncedHtml]);

  return (
    <div className={`ui-preview-frame ${className}`.trim()}>
      <div className="ui-preview-browser-bar">
        <div className="ui-preview-dots" aria-hidden="true">
          <span className="dot dot-red" />
          <span className="dot dot-yellow" />
          <span className="dot dot-green" />
        </div>

        <div className="ui-preview-url-bar">
          <Globe size={13} className="ui-preview-url-icon" />
          <span className="ui-preview-url-text">preview.devlingo.local</span>
          <span className="ui-preview-pill">
            <Sparkles size={11} />
            <span>{badgeText}</span>
            <span className={`ui-preview-status-tag ${isUpdating ? 'is-updating' : 'is-live'}`}>
              {isUpdating ? '● updating...' : '● live'}
            </span>
          </span>
        </div>

        <div className="ui-preview-actions">
          <button
            type="button"
            className="ui-preview-reload-btn"
            onClick={() => {
              setDebouncedHtml(html);
              setIsUpdating(false);
              setReloadKey((k) => k + 1);
            }}
            title="Force reload preview"
            aria-label="Force reload preview"
          >
            <RotateCw size={13} />
          </button>
        </div>
      </div>

      <div className="ui-preview-viewport" style={minHeight ? { minHeight } : undefined}>
        <iframe
          key={reloadKey}
          srcDoc={documentSrc}
          title={title}
          sandbox="allow-scripts allow-same-origin allow-modals allow-forms"
          className="ui-preview-iframe"
        />
      </div>
    </div>
  );
};
