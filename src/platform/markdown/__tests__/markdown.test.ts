import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../markdown';
import { slugify } from '../slugify';

describe('markdown parser', () => {
  it('parses headings, paragraphs, fences, lists and quotes', () => {
    const blocks = parseMarkdown(`## Loops and off-by-one
<!-- ignored by the renderer -->
A paragraph
that wraps.

\`\`\`javascript
for (;;) {}
\`\`\`

- one
- two
  continued

1. first
2. second

> Note here
> and more`);
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'code', 'list', 'list', 'quote']);
    expect((blocks[1] as any).text).toBe('A paragraph that wraps.');
    expect(blocks[0]).toMatchObject({ level: 2, id: 'loops-and-off-by-one' });
    expect(blocks[2]).toMatchObject({ language: 'javascript', code: 'for (;;) {}' });
    expect((blocks[3] as any).items).toEqual(['one', 'two continued']);
    expect((blocks[4] as any).ordered).toBe(true);
    expect((blocks[5] as any).text).toBe('Note here and more');
  });

  it('keeps an unterminated fence from swallowing the parser', () => {
    const blocks = parseMarkdown('```js\nconst x = 1;');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('code');
  });

  it('slugifies headings the way anchors expect', () => {
    expect(slugify('HTTP methods, safety and idempotency')).toBe('http-methods-safety-and-idempotency');
    expect(slugify('`typeof` and coercion!')).toBe('typeof-and-coercion');
  });
});
