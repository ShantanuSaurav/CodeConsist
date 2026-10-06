import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadContent } from '../src/platform/content-registry/loader.build.mjs';

export function isExpansionQuestion(question) {
  return /^stage-(?:[1-9]|10)-c\d{2}$/.test(question.id) || /^stage-(?:c1|cpp1)-b\d{2}$/.test(question.id);
}

export function normalizeOutput(output) {
  return output.replace(/\r\n/g, '\n').replace(/\n$/, '');
}

export function verifyPrediction(question, actual) {
  assert.equal(question.type, 'output_prediction', question.id);
  const expected = question.options[question.correctIndex];
  assert.equal(normalizeOutput(actual), expected, `${question.id}: runtime output differs from the answer key`);
  assert.equal(question.options.filter(option => option === normalizeOutput(actual)).length, 1, `${question.id}: output must match exactly one option`);
}

function executable(candidates, argumentsForProbe) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      execFileSync(candidate, argumentsForProbe, { stdio: 'ignore', timeout: 5000, windowsHide: true });
      return candidate;
    } catch {}
  }
  throw new Error(`Required runtime missing. Tried ${candidates.filter(Boolean).join(', ')}. Configure PYTHON, CC or CXX as appropriate.`);
}

export async function verifyExpansion() {
  const loaded = await loadContent('challenges');
  assert.equal(loaded.issues.length, 0, 'The challenge schema must pass before executing content');
  const questions = loaded.items.filter(isExpansionQuestion);
  assert.equal(questions.length, 500, 'Expected the complete 500-question expansion');
  const predictions = questions.filter(question => question.type === 'output_prediction');
  assert.equal(predictions.length, 140);
  const python = executable([process.env.PYTHON, 'python3', 'python', 'py'], ['-c', 'import sys; assert sys.version_info.major == 3']);
  const compilerC = executable([process.env.CC, 'gcc', 'clang'], ['--version']);
  const compilerCpp = executable([process.env.CXX, 'g++', 'clang++'], ['--version']);
  const temporaryRoot = realpathSync(tmpdir());
  const workspace = mkdtempSync(path.join(temporaryRoot, 'codeconsist-output-check-'));
  const counts = { javascript: 0, python: 0, c: 0, cpp: 0 };
  const failures = [];
  try {
    for (const question of predictions) {
      try {
        let actual;
        assert.ok(!question.codeSnippet.includes('\0'), `${question.id}: snippet contains an embedded NUL byte`);
        if (question.language === 'javascript') {
          const lines = [];
          const context = vm.createContext({ console: { log: (...values) => lines.push(values.map(String).join(' ')) } });
          vm.runInContext(question.codeSnippet, context, { timeout: 1000, filename: question.id });
          actual = lines.join('\n');
        } else if (question.language === 'python') {
          actual = execFileSync(python, ['-I', '-c', question.codeSnippet], { encoding: 'utf8', timeout: 5000, windowsHide: true });
        } else {
          const isC = question.language === 'c';
          assert.ok(isC || question.language === 'cpp', `Unsupported prediction language: ${question.language}`);
          const source = path.join(workspace, `${question.id}.${isC ? 'c' : 'cpp'}`);
          const binary = path.join(workspace, `${question.id}${process.platform === 'win32' ? '.exe' : ''}`);
          writeFileSync(source, question.codeSnippet, 'utf8');
          execFileSync(isC ? compilerC : compilerCpp, [isC ? '-std=c11' : '-std=c++14', '-pedantic-errors', '-Wall', '-Wextra', source, '-o', binary], {
            encoding: 'utf8', timeout: 30000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
          });
          actual = execFileSync(binary, [], { encoding: 'utf8', timeout: 5000, windowsHide: true });
        }
        verifyPrediction(question, actual);
        counts[question.language]++;
      } catch (error) {
        failures.push(`${question.id}: ${error.message}`);
      }
    }
  } finally {
    const resolved = realpathSync(workspace);
    assert.equal(path.dirname(resolved), temporaryRoot, 'Refuse cleanup outside the verified temporary root');
    assert.ok(path.basename(resolved).startsWith('codeconsist-output-check-'));
    rmSync(resolved, { recursive: true, force: true });
  }
  assert.equal(failures.length, 0, failures.join('\n\n'));
  assert.deepEqual(counts, { javascript: 50, python: 50, c: 20, cpp: 20 });
  console.log(`Verified 140 new predictions against real runtimes: ${JSON.stringify(counts)}. No skipped runtimes.`);
  return counts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyExpansion().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
