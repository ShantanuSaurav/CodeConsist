/**
 * Every kind of authored content, registered in one place.
 *
 * The Node loader (platform/content-registry/loader.build.mjs) compiles this
 * file to learn what to discover and validate, so the server and the scripts
 * see exactly the content the browser sees. A new content kind is one import
 * and one array entry.
 *
 * Only `content/spec` files are imported here - never a module barrel. Specs
 * are pure (schema + paths); the barrels pull in import.meta.glob and React.
 */
import type { ContentSpec } from '@/platform/content-registry';
import { challengesSpec, STAGE_META, LANGUAGE_TRACKS } from '@/modules/challenges/content/spec';
import { roadmapsSpec } from '@/modules/roadmaps/content/spec';
import { articlesSpec } from '@/modules/articles/content/spec';

export const CONTENT_SPECS: ContentSpec<any>[] = [challengesSpec, roadmapsSpec, articlesSpec];

export { STAGE_META, LANGUAGE_TRACKS };
