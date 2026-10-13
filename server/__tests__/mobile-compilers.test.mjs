import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { prepareJavaScript } from '../typescript.js';
import { pythonTestHarness } from '../python-judge.js';

describe('native TypeScript conversion', () => {
  it('removes types and lowers enums while preserving callable lesson functions', async () => {
    const { code } = await prepareJavaScript('enum Mode { Learn = 4 }; function twice(n: number): number { return n * 2 + Mode.Learn; }', 'typescript');
    const context = vm.createContext({}); new vm.Script(code).runInContext(context);
    expect(vm.runInContext('twice(3)', context)).toBe(10);
  });
  it('reports syntax failures without running anything', async () => {
    const result = await prepareJavaScript('const broken: = 1;', 'typescript');
    expect(result.error).toMatch(/^TypeScript 1:/); expect(result.code).toBeUndefined();
  });
  it('does not resolve or bundle imports from the PC', async () => {
    const { code } = await prepareJavaScript('import fs from "node:fs"; fs.readFileSync(".env");', 'typescript');
    expect(code).toContain('node:fs');
    expect(() => new vm.Script(code).runInNewContext({})).toThrow();
  });
});

describe('native Python harness', () => {
  it('embeds submitted text as data, even with quote and multiline delimiters', () => {
    const source = 'def example():\n    return "\"\"\"\\n<script>"';
    const harness = pythonTestHarness({ code: source, entryFunction: 'example', testCases: [{ input: '', expected: '1' }] });
    const encoded = harness.match(/b64decode\("([A-Za-z0-9+/=]+)"\)/)[1];
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString());
    expect(decoded.code).toBe(source);
    expect(decoded.testCases).toEqual([{ input: '' }]);
    expect(harness).not.toContain('<script>');
    expect(harness).toContain("exec(compile(_payload['code']");
  });
});
