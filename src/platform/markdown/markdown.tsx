import React from 'react';
import { CodeBlock } from '@/ui/primitives/CodeBlock';
import type { SupportedLanguage } from '@/types';
import { slugify } from './slugify';

/* ==========================================================================
   A deliberately small Markdown renderer for the stage articles.

   Supports: # / ## / ### headings, paragraphs, fenced code blocks with a
   language, "- " and "1. " lists, "> " notes, and inline `code`, **bold**,
   *italic* and [links](url). Nothing else, on purpose - the articles are
   authored in-repo, so a full parser (and its attack surface) is not needed.
   ========================================================================== */

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string; id: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'code'; language: string; code: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string };

export { slugify } from './slugify';

const LANGUAGES = new Set<string>([
  'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'go', 'sql', 'html', 'css', 'bash', 'pseudocode'
]);

function normaliseLanguage(raw: string): SupportedLanguage {
  const l = raw.trim().toLowerCase();
  if (l === 'js') return 'javascript';
  if (l === 'ts') return 'typescript';
  if (l === 'py') return 'python';
  if (l === 'sh' || l === 'shell' || l === 'zsh') return 'bash';
  if (l === 'text' || l === 'txt' || l === 'plain' || l === '') return 'pseudocode';
  return (LANGUAGES.has(l) ? l : 'pseudocode') as SupportedLanguage;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank lines and HTML comments (authoring metadata) are not content.
    if (line.trim() === '' || /^<!--.*-->s*$/.test(line.trim())) {
      i++;
      continue;
    }

    // Fenced code
    const fence = line.match(/^```\s*([\w+-]*)\s*$/);
    if (fence) {
      const language = fence[1];
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push({ kind: 'code', language, code: code.join('\n') });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const text = heading[2].trim();
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, text, id: slugify(text) });
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        parts.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ kind: 'quote', text: parts.join(' ') });
      continue;
    }

    const bullet = /^[-*]\s+/;
    const numbered = /^\d+\.\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const marker = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length && marker.test(lines[i])) {
        let item = lines[i].replace(marker, '');
        i++;
        // Continuation lines indented by two or more spaces belong to the item.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !marker.test(lines[i].trim())) {
          item += ' ' + lines[i].trim();
          i++;
        }
        items.push(item);
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    // Paragraph: consecutive non-empty, non-special lines.
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !bullet.test(lines[i]) &&
      !numbered.test(lines[i]) &&
      !/^<!--.*-->s*$/.test(lines[i].trim())
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ kind: 'paragraph', text: para.join(' ') });
  }

  return blocks;
}

/* ------------------------------------------------------------------ inline */

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+|#[^)\s]+|\/[^)\s]*)\))/g;

export function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const token = m[0];
    if (m[1]) {
      out.push(
        <code key={key++} className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>
      );
    } else if (m[2]) {
      out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (m[3]) {
      out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (m[4]) {
      const label = token.slice(1, token.indexOf(']('));
      const href = m[5];
      const external = href.startsWith('http');
      out.push(
        <a
          key={key++}
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noreferrer' : undefined}
          className="text-[var(--color-secondary)] underline underline-offset-2 hover:opacity-80"
        >
          {label}
        </a>
      );
    }
    last = idx + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/* --------------------------------------------------------------- component */

interface MarkdownProps {
  source: string;
  /** Offsets heading levels, e.g. 1 turns "## " into an h3 inside a card. */
  headingOffset?: 0 | 1;
  className?: string;
}

export const Markdown: React.FC<MarkdownProps> = ({ source, headingOffset = 0, className }) => {
  const blocks = React.useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className={`space-y-4 text-[15px] leading-relaxed text-gray-700 dark:text-gray-300 ${className ?? ''}`}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading': {
            const level = Math.min(4, b.level + headingOffset);
            const cls =
              level === 1
                ? 'text-3xl font-bold text-gray-900 dark:text-white mt-2'
                : level === 2
                  ? 'text-2xl font-bold text-gray-900 dark:text-white mt-8 scroll-mt-24'
                  : level === 3
                    ? 'text-lg font-bold text-gray-900 dark:text-white mt-6'
                    : 'text-base font-bold text-gray-900 dark:text-white mt-4';
            return React.createElement(`h${level}`, { key: i, id: b.id, className: cls }, renderInline(b.text));
          }
          case 'paragraph':
            return <p key={i}>{renderInline(b.text)}</p>;
          case 'code':
            return (
              <CodeBlock key={i} code={b.code} language={normaliseLanguage(b.language)} showLineNumbers={b.code.split('\n').length > 3} />
            );
          case 'list':
            return b.ordered ? (
              <ol key={i} className="list-decimal pl-6 space-y-1.5">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="list-disc pl-6 space-y-1.5">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ul>
            );
          case 'quote':
            return (
              <blockquote
                key={i}
                className="border-l-4 border-[var(--color-primary)]/60 bg-[var(--color-primary)]/5 rounded-r-lg px-4 py-3 text-gray-800 dark:text-gray-200"
              >
                {renderInline(b.text)}
              </blockquote>
            );
          default:
            return null;
        }
      })}
    </div>
  );
};
