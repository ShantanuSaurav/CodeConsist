/**
 * The Gemini client with a stubbed fetch - the request it sends, the
 * response it accepts, and the friendly error it turns every failure into -
 * plus the wording-overlap helpers the assistant ranks the bank with.
 */
import { describe, expect, it, vi } from 'vitest';
import { GeminiError, createGeminiClient, jaccard, norm, parseGeminiResponse, rankSimilar, textOf, words } from '../ai.js';

const BANK = [
  { id: 'q1', title: 'Declare a constant', prompt: 'Which keyword declares a constant in JavaScript?', codeSnippet: '' },
  { id: 'q2', title: 'Constant keyword', prompt: 'In JavaScript, which keyword do you use to declare a constant binding?' },
  { id: 'q3', title: 'Sum a list', prompt: 'Write a function that returns the sum of a list of numbers.', codeSnippet: 'def total(nums):' },
  { id: 'q4', title: 'Reverse a string', prompt: 'Return the string reversed.' }
];

describe('text overlap helpers', () => {
  it('normalises case, punctuation and whitespace', () => {
    expect(norm('  Which KEYWORD declares  a "constant"?  ')).toBe('which keyword declares a constant');
    expect(words('What is the keyword that declares a constant?')).toEqual(['keyword', 'declares', 'constant']);
  });

  it('measures shared words as a share of the union', () => {
    expect(jaccard(['a', 'b', 'c'], ['b', 'c', 'd'])).toBeCloseTo(0.5);
    expect(jaccard([], ['x'])).toBe(0);
    expect(jaccard(['x'], ['x'])).toBe(1);
  });

  it('compares on title, prompt and snippet', () => {
    expect(textOf({ title: 'T', prompt: 'P', codeSnippet: 'C' })).toBe('T P C');
    expect(textOf({ title: 'T', prompt: 'P' })).toBe('T P ');
  });

  it('ranks the wording-level near-duplicate first and ignores stop words', () => {
    const ranked = rankSimilar('Which keyword declares a constant in JavaScript? The answer is const.', BANK);
    expect(ranked[0].challenge.id).toBe('q1');
    expect(ranked[1].challenge.id).toBe('q2');
    expect(ranked.every((r) => r.score >= 0.08)).toBe(true);
    expect(ranked.map((r) => r.challenge.id)).not.toContain('q4');
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
  });

  it('honours limit and min, and returns nothing for stop-word-only text', () => {
    expect(rankSimilar('keyword declares constant javascript', BANK, { limit: 1 })).toHaveLength(1);
    expect(rankSimilar('keyword declares constant javascript', BANK, { min: 0.99 })).toEqual([]);
    expect(rankSimilar('the a an of to', BANK)).toEqual([]);
    expect(rankSimilar('anything', null)).toEqual([]);
  });
});

/* ------------------------------------------------------------- client */

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const answer = (obj, extra = {}) => reply(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(obj) }] }, ...extra }] });
const SCHEMA = { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] };

describe('createGeminiClient', () => {
  it('sends one generateContent request with the key in a header and a JSON response schema', async () => {
    const fetchImpl = vi.fn(async () => answer({ ok: true, n: 1 }));
    const ai = createGeminiClient({ apiKey: 'secret-key', model: 'gemini-test', fetchImpl });
    expect(ai.configured).toBe(true);
    expect(ai.model).toBe('gemini-test');

    const result = await ai.generateJson({ system: 'SYS', user: 'USER', schema: SCHEMA, temperature: 0.7 });
    expect(result).toEqual({ ok: true, n: 1 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('gemini-test');
    expect(url).toContain(':generateContent');
    expect(url).not.toContain('secret-key');
    expect(init.method).toBe('POST');
    expect(init.headers['x-goog-api-key']).toBe('secret-key');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toBe('SYS');
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'USER' }] }]);
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.7 });
  });

  it('joins several text parts before parsing', async () => {
    const fetchImpl = async () => reply(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":' }, { text: 'true}' }] } }] });
    const ai = createGeminiClient({ apiKey: 'k', fetchImpl });
    expect(await ai.generateJson({ system: '', user: '', schema: SCHEMA })).toEqual({ ok: true });
  });

  it('falls back to the default model', () => {
    expect(createGeminiClient({ apiKey: 'k', model: '' }).model).toBe('gemini-2.5-flash');
  });

  it.each([
    [401, 'The Gemini API key was refused - check GEMINI_API_KEY in .env.'],
    [403, 'The Gemini API key was refused - check GEMINI_API_KEY in .env.'],
    [429, 'Gemini is rate-limiting this key - try again in a moment.'],
    [500, 'Gemini is having trouble right now - try again in a moment.'],
    [503, 'Gemini is having trouble right now - try again in a moment.']
  ])('maps HTTP %i to a friendly GeminiError with status 502', async (status, message) => {
    const ai = createGeminiClient({ apiKey: 'k', fetchImpl: async () => reply(status, { error: { code: status, message: 'API key not valid', status: 'X' } }) });
    const err = await ai.generateJson({ system: '', user: '', schema: SCHEMA }).catch((e) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect(err.status).toBe(502);
    expect(err.message).toBe(message);
  });

  it("quotes Google's message for a rejected request", async () => {
    const ai = createGeminiClient({ apiKey: 'k', fetchImpl: async () => reply(400, { error: { code: 400, message: 'Invalid JSON schema', status: 'INVALID_ARGUMENT' } }) });
    const err = await ai.generateJson({ system: '', user: '', schema: SCHEMA }).catch((e) => e);
    expect(err.message).toBe('Gemini rejected the request (Invalid JSON schema).');
    expect(err.status).toBe(502);
  });

  it('turns a safety stop, a truncated answer and invalid JSON into GeminiErrors', async () => {
    const run = (body) => createGeminiClient({ apiKey: 'k', fetchImpl: async () => reply(200, body) }).generateJson({ system: '', user: '', schema: SCHEMA }).catch((e) => e);

    const safety = await run({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] });
    expect(safety).toBeInstanceOf(GeminiError);
    expect(safety.status).toBe(502);
    expect(safety.message).toMatch(/safety/i);

    const truncated = await run({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"ok":' }] } }] });
    expect(truncated.message).toMatch(/ran out of room/);

    const blocked = await run({ promptFeedback: { blockReason: 'OTHER' }, candidates: [] });
    expect(blocked.message).toMatch(/declined/);

    const garbage = await run({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }] });
    expect(garbage.message).toBe('Gemini answered with something that was not valid JSON - try again.');

    const empty = await run({ candidates: [] });
    expect(empty.message).toBe('Gemini returned no answer - try again.');
    for (const e of [safety, truncated, blocked, garbage, empty]) expect(e.message).not.toMatch(/at .*\.js/);
  });

  it('accepts a fenced JSON answer', () => {
    expect(parseGeminiResponse({ candidates: [{ content: { parts: [{ text: '```json\n{"ok":true}\n```' }] } }] })).toEqual({ ok: true });
  });

  it('reports a network failure without the key', async () => {
    const ai = createGeminiClient({
      apiKey: 'k',
      fetchImpl: async () => {
        throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
      }
    });
    const err = await ai.generateJson({ system: '', user: '', schema: SCHEMA }).catch((e) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect(err.message).toBe('Could not reach Gemini (ENOTFOUND).');

    const slow = createGeminiClient({
      apiKey: 'k',
      fetchImpl: async () => {
        throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
      }
    });
    const timeout = await slow.generateJson({ system: '', user: '', schema: SCHEMA }).catch((e) => e);
    expect(timeout.message).toBe('Could not reach Gemini (timed out after 60 s).');
  });

  it('never repeats a fetch error message, which can quote the key', async () => {
    const secret = 'AIzaSECRET-abc';
    const ai = createGeminiClient({
      apiKey: secret,
      fetchImpl: async () => {
        throw new TypeError(`Headers.append: "${secret}" is an invalid header value.`);
      }
    });
    const err = await ai.generateJson({ system: '', user: '', schema: SCHEMA }).catch((e) => e);
    expect(err.message).toBe('Could not reach Gemini (network error).');
    expect(err.message).not.toContain(secret);
  });

  it('refuses a key with control characters before touching the network', async () => {
    const fetchImpl = vi.fn();
    const ai = createGeminiClient({ apiKey: 'AIzaSECRET-abc\rdef', fetchImpl });
    const err = await ai.generateJson({ system: '', user: '', schema: SCHEMA }).catch((e) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect(err.status).toBe(503);
    expect(err.message).not.toContain('SECRET');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('is unconfigured without a key and refuses with 503 before touching the network', async () => {
    const fetchImpl = vi.fn();
    const ai = createGeminiClient({ apiKey: '', fetchImpl });
    expect(ai.configured).toBe(false);
    const err = await ai.generateJson({ system: '', user: '', schema: SCHEMA }).catch((e) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect(err.status).toBe(503);
    expect(err.message).toMatch(/GEMINI_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
