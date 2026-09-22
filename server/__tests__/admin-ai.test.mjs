/**
 * The /ai/* admin routes at the HTTP boundary with a stubbed Gemini: the
 * real content bank and stages, the real router, and every answer the
 * console relies on - including the ones for a missing key and a Gemini
 * that fails, which must be plain JSON errors and never a bare 500.
 */
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db.js', () => {
  let auditLog = [];
  return {
    reset: () => {
      auditLog = [];
    },
    load: async () => ({}),
    allUsers: () => [],
    allProgress: () => ({}),
    getProgress: () => ({ xp: 0, level: 1, streak: 0, bestStreak: 0, lastActiveDay: null, completedChallenges: [], completedStages: [], attempts: {} }),
    getContentOverrides: () => ({ stages: {}, challenges: {}, languages: {} }),
    allCustomChallenges: () => [],
    getCustomChallenge: () => null,
    appendAudit: (entry) => {
      auditLog.push(entry);
      return entry;
    },
    listAudit: () => [...auditLog].reverse(),
    getExcelSync: () => ({}),
    // The dashboard sums revenue from orders (server/billing.js); none here.
    allOrders: () => []
  };
});

vi.mock('../admin-auth.js', () => ({
  requireAdminAuth: (req, _res, next) => {
    req.admin = { id: 'admin-1', userId: 'admin' };
    next();
  },
  publicAdmin: (a) => a,
  updateAdminCredentials: async () => ({ ok: false, error: 'stub' })
}));

vi.mock('../excel.js', () => ({
  excelSettingsSummary: () => ({ configured: false }),
  testConnection: async () => ({ ok: false }),
  syncAllUsers: async () => ({ synced: 0, failed: 0 }),
  retryFailed: async () => ({ retried: 0, stillFailing: 0 })
}));

import * as store from '../db.js';
import { createAdminRouter } from '../admin.js';
import { GeminiError } from '../ai.js';
import { loadContent, contentSnapshot, allChallenges } from '../content.js';

const STAGE = 'stage-1';

/** A quiz draft the way Gemini answers it, fitted to the first stage. */
const quizAnswer = () => ({
  title: 'Declare a constant binding',
  prompt: 'Which keyword declares a value that cannot be reassigned?',
  explanation: 'const creates a binding that cannot be reassigned.',
  difficulty: 'easy',
  xpReward: 35,
  language: 'javascript',
  options: ['var', 'let', 'const', 'static'],
  correctIndex: 2,
  fit: { stageId: STAGE, confidence: 0.9, reason: 'Variable declarations live here.', alternatives: [] }
});

const ai = { configured: true, model: 'gemini-stub', generateJson: vi.fn() };
const deps = { validateChallenge: () => ({ ok: true, challenge: null, issues: [] }), runSolution: async () => ({ status: 'passed' }), ai };

let server;
let base;

beforeAll(async () => {
  await loadContent();
  const app = express().use(express.json()).use('/api/admin', createAdminRouter(deps));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api/admin`;
}, 60_000);

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
});

beforeEach(() => {
  store.reset();
  ai.configured = true;
  ai.generateJson.mockReset();
});

const api = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json() };
};

describe('GET /ai/status and /dashboard', () => {
  it('reports whether Gemini is configured and which model answers', async () => {
    expect(await api('GET', '/ai/status')).toEqual({ status: 200, json: { configured: true, model: 'gemini-stub' } });
    ai.configured = false;
    expect((await api('GET', '/ai/status')).json).toEqual({ configured: false, model: 'gemini-stub' });
  });

  it('carries geminiConfigured on the dashboard', async () => {
    expect((await api('GET', '/dashboard')).json.geminiConfigured).toBe(true);
    ai.configured = false;
    expect((await api('GET', '/dashboard')).json.geminiConfigured).toBe(false);
  });
});

describe('POST /ai/draft', () => {
  it('400s on a short description or an unknown kind, without calling Gemini', async () => {
    const short = await api('POST', '/ai/draft', { kind: 'quiz', text: 'too short' });
    expect(short.status).toBe(400);
    expect(short.json.error).toMatch(/at least 10 characters/);

    const badKind = await api('POST', '/ai/draft', { kind: 'essay', text: 'A perfectly long description of a question.' });
    expect(badKind.status).toBe(400);
    expect(badKind.json.error).toMatch(/question type/);

    const badStage = await api('POST', '/ai/draft', { kind: 'quiz', text: 'A perfectly long description of a question.', stageId: 'stage-999' });
    expect(badStage.status).toBe(400);
    expect(badStage.json).toEqual({ error: 'No such stage.' });
    expect(ai.generateJson).not.toHaveBeenCalled();
  });

  it('503s with notConfigured when there is no key', async () => {
    ai.configured = false;
    const { status, json } = await api('POST', '/ai/draft', { kind: 'quiz', text: 'Ask which keyword declares a constant in JavaScript.' });
    expect(status).toBe(503);
    expect(json.notConfigured).toBe(true);
    expect(json.error).toMatch(/GEMINI_API_KEY/);
    expect(ai.generateJson).not.toHaveBeenCalled();
  });

  it('answers with a wizard-shaped draft and the fit, and audits without the text', async () => {
    ai.generateJson.mockResolvedValueOnce(quizAnswer());
    const text = 'Ask which keyword declares a constant in JavaScript. Correct: const.';
    const { status, json } = await api('POST', '/ai/draft', { kind: 'quiz', text });
    expect(status).toBe(200);
    expect(json.draft).toMatchObject({ stageId: STAGE, type: 'quiz', language: 'javascript', title: 'Declare a constant binding', options: ['var', 'let', 'const', 'static'], correctIndex: 2, uiPreview: false });
    expect(json.draft).toHaveProperty('testCases');
    expect(json.draft).toHaveProperty('pseudocodeLines');
    expect(json.fit).toEqual({ stageId: STAGE, confidence: 0.9, reason: 'Variable declarations live here.', alternatives: [] });

    const { user } = ai.generateJson.mock.calls[0][0];
    for (const stage of contentSnapshot().stages) expect(user).toContain(`- ${stage.id} |`);

    const entry = store.listAudit()[0];
    expect(entry).toMatchObject({ action: 'ai.draft', details: { kind: 'quiz', stageId: STAGE, chars: text.length } });
    expect(JSON.stringify(entry)).not.toContain('Correct: const');
  });

  it('turns a Gemini failure into a plain 502, never a bare 500', async () => {
    ai.generateJson.mockRejectedValueOnce(new GeminiError('Gemini is rate-limiting this key - try again in a moment.', 502));
    const { status, json } = await api('POST', '/ai/draft', { kind: 'quiz', text: 'Ask which keyword declares a constant in JavaScript.' });
    expect(status).toBe(502);
    expect(json).toEqual({ error: 'Gemini is rate-limiting this key - try again in a moment.' });
  });
});

describe('POST /ai/duplicates', () => {
  it('runs the wording check against the real bank and returns the computed verdict', async () => {
    const existing = allChallenges().find((c) => c.type === 'quiz');
    ai.generateJson.mockImplementationOnce(async ({ user }) => {
      expect(user).toContain(`id: ${existing.id}`);
      return { items: [{ id: existing.id, verdict: 'duplicate', reason: 'Same question.' }] };
    });
    const draft = { title: existing.title, prompt: existing.prompt, type: existing.type, language: existing.language, options: existing.options, correctIndex: existing.correctIndex, codeSnippet: existing.codeSnippet };
    const { status, json } = await api('POST', '/ai/duplicates', { draft, text: existing.prompt });
    expect(status).toBe(200);
    const stageName = contentSnapshot().stages.find((s) => s.id === existing.stageId).name;
    expect(json.verdict).toEqual({ push: 'no', reason: `Already covered by "${existing.title}" (${stageName}).` });
    expect(json.candidates[0]).toMatchObject({ id: existing.id, stageId: existing.stageId, stageName, verdict: 'duplicate', reason: 'Same question.' });
    expect(json.candidates.length).toBeLessThanOrEqual(12);
    expect(store.listAudit()[0]).toMatchObject({ action: 'ai.duplicates', details: { push: 'no', candidates: json.candidates.length } });
  });

  it('needs a draft, and a key', async () => {
    expect((await api('POST', '/ai/duplicates', { text: 'x' })).status).toBe(400);
    ai.configured = false;
    const { status, json } = await api('POST', '/ai/duplicates', { draft: { title: 'Anything', prompt: 'Anything at all.' } });
    expect(status).toBe(503);
    expect(json.notConfigured).toBe(true);
  });
});

describe('POST /ai/suggest', () => {
  it('400s on an unknown stage or kind', async () => {
    expect(await api('POST', '/ai/suggest', { stageId: 'stage-999' })).toEqual({ status: 400, json: { error: 'No such stage.' } });
    expect((await api('POST', '/ai/suggest', { stageId: STAGE, kind: 'essay' })).status).toBe(400);
    expect(ai.generateJson).not.toHaveBeenCalled();
  });

  it('returns suggestions with novelty against the real bank', async () => {
    const existing = allChallenges().find((c) => c.stageId === STAGE && c.type === 'quiz');
    ai.generateJson.mockResolvedValueOnce({
      suggestions: [
        { title: existing.title, prompt: existing.prompt, kind: 'quiz', difficulty: 'easy', why: 'Already there.' },
        { title: 'Tachyon flux capacitor', prompt: 'Explain quantum tachyon reversal polarity.', kind: 'debug', difficulty: 'hard', why: 'Nothing like it.' }
      ]
    });
    const { status, json } = await api('POST', '/ai/suggest', { stageId: STAGE, count: 2 });
    expect(status).toBe(200);
    expect(json.suggestions).toHaveLength(2);
    expect(json.suggestions[0]).toMatchObject({ kind: 'quiz', novel: false });
    expect(json.suggestions[0].overlaps[0]).toMatchObject({ id: existing.id, title: existing.title });
    expect(json.suggestions[1]).toMatchObject({ kind: 'debug', novel: true, overlaps: [] });
    expect(store.listAudit()[0]).toMatchObject({ action: 'ai.suggest', details: { stageId: STAGE, kind: null, count: 2 } });
  });
});
