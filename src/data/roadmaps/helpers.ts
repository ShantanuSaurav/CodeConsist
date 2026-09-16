import type { ResourceKind, RoadmapResource } from '../../types';

/** Shorthand for a resource link. */
export const link = (title: string, url: string, kind: ResourceKind = 'article'): RoadmapResource => ({
  title,
  url,
  kind
});

export const docs = (title: string, url: string) => link(title, url, 'docs');
export const video = (title: string, url: string) => link(title, url, 'video');
export const course = (title: string, url: string) => link(title, url, 'course');
export const book = (title: string, url: string) => link(title, url, 'book');
export const practice = (title: string, url: string) => link(title, url, 'practice');

/** The matching roadmap on roadmap.sh. */
export const roadmapSh = (slug: string) => link(`${slug} roadmap on roadmap.sh`, `https://roadmap.sh/${slug}`, 'roadmap');

export const MDN = 'https://developer.mozilla.org/en-US/docs';
export const PY = 'https://docs.python.org/3';
export const PG = 'https://www.postgresql.org/docs/current';
