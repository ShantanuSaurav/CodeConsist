# modules/articles

**Owns:** one Markdown article per stage (`content/*.md`), the parser and schema, the section-by-tag matcher, the article page and the in-modal `ReadingPanel`.

**Public API (`index.ts`):** `ArticlePage`, `ReadingPanel`, `resolveReading`, `ARTICLES`, `articleFor`, `sectionFor`, `ArticleSchema`, `parseArticle`.

**Emits:** `practice:open`, `practice:openTest` (the article page CTA).

**Listens:** nothing.

**Does not own:** which challenge shows which section (the app passes `resolveReading` into the challenges and roadmaps pages).

Same layout as every module: `content/` (data + `spec.ts` + glob `index.ts`),
`components/`, `pages/`, `services/`, `schema.ts`, `__tests__/`. Anything not
exported from `index.ts` is private; `npm run lint:boundaries` enforces it.
