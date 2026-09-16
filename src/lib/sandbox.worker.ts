/// <reference lib="webworker" />
/**
 * In-browser JavaScript sandbox.
 *
 * Used when the local API server is not running. A worker (rather than an
 * iframe or a bare eval on the main thread) means the page stays responsive and
 * the caller can terminate a runaway loop - there is no other way to interrupt
 * synchronous JavaScript.
 */
import { displayValue, matchesExpected } from './grading';
import type { TestCase, TestResult } from '../types';

interface RunMessage {
  code: string;
  entryFunction?: string;
  testCases?: TestCase[];
}

const MAX_LOG_CHARS = 8000;

function run({ code, entryFunction, testCases = [] }: RunMessage) {
  let log = '';
  const append = (prefix: string) => (...args: unknown[]) => {
    if (log.length > MAX_LOG_CHARS) return;
    const line = args
      .map((a) => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');
    log += (log ? '\n' : '') + prefix + line;
  };

  const sandboxConsole = {
    log: append(''),
    info: append(''),
    debug: append(''),
    warn: append('warning: '),
    error: append('error: ')
  };

  let entry: unknown;
  try {
    // `new Function` keeps the submission out of this module's scope: it can see
    // globals and the console we pass in, but not our locals.
    const factory = new Function(
      'console',
      `"use strict";\n${code}\n;return typeof ${entryFunction || 'undefined'} === 'function' ? ${
        entryFunction || 'undefined'
      } : undefined;`
    );
    entry = factory(sandboxConsole);
  } catch (e: any) {
    return {
      status: 'error' as const,
      stdout: log,
      stderr:
        e instanceof SyntaxError
          ? `SyntaxError: ${e.message}\n\nThe code could not be parsed, so nothing ran. Check for a missing bracket or quote.`
          : `${e?.name ?? 'Error'}: ${e?.message ?? String(e)}`,
      testResults: []
    };
  }

  if (!testCases.length) {
    return { status: 'passed' as const, stdout: log, testResults: [] };
  }

  if (typeof entry !== 'function') {
    return {
      status: 'error' as const,
      stdout: log,
      stderr: `ReferenceError: no function named "${entryFunction}" was defined. Check the spelling and make sure it is declared at the top level.`,
      testResults: []
    };
  }

  const testResults: TestResult[] = [];
  let allPassed = true;

  for (const tc of testCases) {
    const before = log.length;
    const started = performance.now();
    try {
      const args = new Function(`"use strict";return [${tc.input}];`)();
      const actual = (entry as (...a: unknown[]) => unknown)(...args);

      if (actual && typeof (actual as any).then === 'function') {
        throw new Error('this challenge expects a value to be returned directly, not a promise');
      }

      const passed = matchesExpected(actual, tc.expected);
      if (!passed) allPassed = false;
      testResults.push({
        input: tc.input,
        expected: tc.expected,
        actual: displayValue(actual),
        passed,
        logs: log.slice(before),
        timeMs: Math.round((performance.now() - started) * 100) / 100
      });
    } catch (e: any) {
      allPassed = false;
      testResults.push({
        input: tc.input,
        expected: tc.expected,
        actual: `${e?.name ?? 'Error'}: ${e?.message ?? String(e)}`,
        passed: false,
        logs: log.slice(before)
      });
    }
  }

  return {
    status: allPassed ? ('passed' as const) : ('failed' as const),
    stdout: log,
    testResults
  };
}

self.onmessage = (event: MessageEvent<RunMessage>) => {
  try {
    (self as unknown as Worker).postMessage(run(event.data));
  } catch (e: any) {
    (self as unknown as Worker).postMessage({
      status: 'error',
      stderr: e?.message ?? String(e),
      testResults: []
    });
  }
};
