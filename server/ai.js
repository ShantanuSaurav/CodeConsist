/**
 * The Gemini client behind the admin console's question assistant, plus the
 * pure text-overlap helpers the assistant ranks the bank with.
 *
 * Server-side only: the key comes from GEMINI_API_KEY in .env and is sent to
 * Google in a request header - it is never logged, never returned to the
 * browser and never part of a URL. The client is built once in
 * server/index.js and handed to the admin router as `deps.ai`; everything
 * else in this file is a pure function (see server/__tests__/ai.test.mjs).
 *
 * No SDK: one POST to generateContent with a JSON response schema is all the
 * assistant needs, and a raw fetch keeps the dependency list unchanged.
 */

const DEFAULT_MODEL = 'gemini-2.5-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 8192;

/**
 * Anything that stops the assistant answering. `message` is written for the
 * admin (never a stack trace, never the key) and `status` is the HTTP status
 * the route answers with: 503 when there is no key at all, 502 when Google
 * failed or answered with something unusable.
 */
export class GeminiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

/* -------------------------------------------------------------- client */

/**
 * @returns {{ configured: boolean, model: string, generateJson: Function }}
 *   `generateJson({ system, user, schema, temperature })` resolves to the
 *   parsed JSON object Gemini produced for `schema`, or throws GeminiError.
 */
export function createGeminiClient({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || DEFAULT_MODEL, fetchImpl = fetch } = {}) {
  const key = String(apiKey ?? '').trim();
  const modelName = String(model ?? '').trim() || DEFAULT_MODEL;
  const configured = key.length > 0;
  // A key with a stray control character (a \n expanded inside a quoted .env
  // value, say) makes fetch reject with an error that QUOTES the header value;
  // refusing it here keeps that message - and the key - out of any response.
  const malformed = configured && !/^[\x21-\x7e]+$/.test(key);

  async function generateJson({ system, user, schema, temperature = 0.3 }) {
    if (!configured) {
      throw new GeminiError('Gemini is not configured - add GEMINI_API_KEY to .env at the project root and restart the API.', 503);
    }
    if (malformed) {
      throw new GeminiError('GEMINI_API_KEY contains characters that are not allowed - re-copy it from Google AI Studio into .env and restart the API.', 503);
    }
    const body = {
      systemInstruction: { parts: [{ text: String(system ?? '') }] },
      contents: [{ role: 'user', parts: [{ text: String(user ?? '') }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: Number.isFinite(temperature) ? temperature : 0.3,
        maxOutputTokens: MAX_OUTPUT_TOKENS
      }
    };

    let res;
    try {
      res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(modelName)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (err) {
      throw new GeminiError(`Could not reach Gemini (${networkReason(err)}).`, 502);
    }

    // Google answers errors as JSON too, but a proxy or outage may not.
    const json = await res.json().catch(() => null);
    if (!res.ok) throw httpError(res.status, json);
    return parseGeminiResponse(json);
  }

  return { configured, model: modelName, generateJson };
}

/**
 * A short, key-free reason for a failed connection. Only the timeout and the
 * OS error code are ever repeated: a raw fetch message can quote the request
 * headers, and one of those is the key.
 */
function networkReason(err) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return `timed out after ${TIMEOUT_MS / 1000} s`;
  const code = err?.cause?.code ?? err?.code;
  if (code) return String(code).slice(0, 40);
  return 'network error';
}

function httpError(status, json) {
  const detail = String(json?.error?.message ?? '').split('\n')[0].trim().slice(0, 200);
  if (status === 401 || status === 403) return new GeminiError('The Gemini API key was refused - check GEMINI_API_KEY in .env.', 502);
  if (status === 429) return new GeminiError('Gemini is rate-limiting this key - try again in a moment.', 502);
  if (status >= 500) return new GeminiError('Gemini is having trouble right now - try again in a moment.', 502);
  if (status === 400 || status === 404) return new GeminiError(`Gemini rejected the request (${detail || `HTTP ${status}`}).`, 502);
  return new GeminiError(`Gemini answered with HTTP ${status}${detail ? ` (${detail})` : ''}.`, 502);
}

/**
 * The JSON object inside a successful generateContent response. Anything
 * short of a complete STOP - a safety block, running out of output tokens,
 * an empty candidate list, text that is not JSON - is a GeminiError with a
 * plain message, because the caller is going to treat the result as data.
 */
export function parseGeminiResponse(json) {
  if (!json || typeof json !== 'object') throw new GeminiError('Gemini answered with an empty response - try again.', 502);
  const blocked = json.promptFeedback?.blockReason;
  if (blocked) throw new GeminiError(`Gemini declined this request (${String(blocked).toLowerCase()}) - reword the question and try again.`, 502);

  const candidate = Array.isArray(json.candidates) ? json.candidates[0] : null;
  if (!candidate) throw new GeminiError('Gemini returned no answer - try again.', 502);
  const finish = candidate.finishReason;
  if (finish && finish !== 'STOP') {
    if (finish === 'MAX_TOKENS') throw new GeminiError('Gemini ran out of room while answering - try a shorter, simpler description.', 502);
    if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || finish === 'BLOCKLIST') {
      throw new GeminiError('Gemini declined to answer this (safety filter) - reword the question and try again.', 502);
    }
    throw new GeminiError(`Gemini stopped early (${String(finish).toLowerCase()}) - try again.`, 502);
  }

  const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
  let text = parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('').trim();
  // A model in JSON mode should not fence its answer, but strip one if it does.
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1];
  if (!text) throw new GeminiError('Gemini returned an empty answer - try again.', 502);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiError('Gemini answered with something that was not valid JSON - try again.', 502);
  }
  if (!parsed || typeof parsed !== 'object') throw new GeminiError('Gemini answered with something that was not a JSON object - try again.', 502);
  return parsed;
}

/* --------------------------------------------------------- text overlap */

// Same normalisation as scripts/lint-content.mjs, so "near-duplicate" here
// means the same thing it means in the content linter.

/** Lowercase, collapse whitespace, drop punctuation that varies by phrasing. */
export const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[`"'’]/g, '')
    .replace(/[^a-z0-9_$.+\-*/%<>=!&|[\]() ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Words that say nothing about the topic. */
export const STOP = new Set(
  'the a an of to in on for and or is are was were be been it its this that these those with as at by from what which does do you your will not no if then else return'.split(
    ' '
  )
);

/** Content words, for overlap comparisons. */
export const words = (s) => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));

/** Overlap of two word lists as a share of their union: 0 (nothing shared) to 1 (identical). */
export function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / (A.size + B.size - shared);
}

/** The text a question is compared on - what the learner reads plus the code they look at. */
export const textOf = (challenge) => `${challenge?.title ?? ''} ${challenge?.prompt ?? ''} ${challenge?.codeSnippet ?? ''}`;

/**
 * The bank entries that share the most wording with `text`, best first.
 * Wording overlap is a cheap first pass: it finds what a duplicate check
 * should look at, and Gemini then decides what the overlap means.
 * @returns {{ challenge: object, score: number }[]}
 */
export function rankSimilar(text, bank, { limit = 12, min = 0.08 } = {}) {
  const target = words(text);
  if (!target.length) return [];
  const ranked = [];
  for (const challenge of Array.isArray(bank) ? bank : []) {
    if (!challenge || typeof challenge !== 'object') continue;
    const score = jaccard(target, words(textOf(challenge)));
    if (score >= min) ranked.push({ challenge, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, Math.max(0, limit));
}
