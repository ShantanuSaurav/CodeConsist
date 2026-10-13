import { transform } from 'esbuild';

/** Syntax conversion only: no bundling, imports, filesystem reads or code evaluation. */
export async function prepareJavaScript(code, language) {
  if (language !== 'typescript') return { code };
  try {
    const result = await transform(code, { loader: 'ts', target: 'es2022', sourcefile: 'main.ts', logLevel: 'silent' });
    return { code: result.code };
  } catch (error) {
    const first = error.errors?.[0];
    return { error: first ? `TypeScript ${first.location?.line ?? 1}:${(first.location?.column ?? 0) + 1}: ${first.text}` : 'TypeScript could not be compiled.' };
  }
}
