import express from 'express';
import * as store from './db.js';

export function createPlaygroundRouter({ requireAuth, writeLimit, learningDeps }) {
  const router = express.Router();
  router.use('/playground/snippets', requireAuth, (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  const bucketFor = (userId) => {
    const all = store.db().playgroundSnippets;
    const value = Object.hasOwn(all, userId) ? all[userId] : null;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  };
  router.get('/playground/snippets', (req, res) => {
    if (!learningDeps.lib.playgroundLanguage(req.query.language)) {
      return res.status(400).json({ error: 'Choose a supported playground language.' });
    }
    const snippets = Object.values(bucketFor(req.user.id))
      .filter((entry) => entry && learningDeps.lib.normalizePlaygroundProgram(entry.program) &&
        entry.program.language === req.query.language && typeof entry.updatedAt === 'string')
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    res.json({ snippets });
  });
  router.use('/playground/snippets/:id', writeLimit, (req, res, next) => {
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(req.params.id) || ['constructor', 'prototype'].includes(req.params.id)) return res.status(400).json({ error: 'Invalid save identifier.' });
    next();
  });
  router.put('/playground/snippets/:id', async (req, res) => {
    const { normalizePlaygroundProgram, playgroundTitle, samePlaygroundProgram } = learningDeps.lib;
    const program = normalizePlaygroundProgram(req.body?.program);
    const title = playgroundTitle(req.body?.title);
    if (!program || !title) return res.status(400).json({ error: 'Use a name of 1–80 characters, up to 100,000 code characters and 10,000 input characters.' });
    const bucket = bucketFor(req.user.id);
    const existing = Object.hasOwn(bucket, req.params.id) ? bucket[req.params.id] : null;
    if (existing) {
      if (!samePlaygroundProgram(existing.program, program)) return res.status(409).json({ error: 'This save already contains different code. Save a new copy.' });
      await store.persistNow({ strict: true });
      return res.json({ snippet: existing });
    }
    if (Object.keys(bucket).length >= 100 || Buffer.byteLength(JSON.stringify(bucket)) + Buffer.byteLength(JSON.stringify(program)) + 400 > 2_000_000) {
      return res.status(409).json({ error: 'Your library is full (100 saves or 2 MB). Delete an unneeded save first.' });
    }
    const now = new Date().toISOString();
    const snippet = { id: req.params.id, title, program, createdAt: now, updatedAt: now };
    Object.defineProperty(bucket, snippet.id, { value: snippet, enumerable: true, writable: true, configurable: true });
    Object.defineProperty(store.db().playgroundSnippets, req.user.id, { value: bucket, enumerable: true, writable: true, configurable: true });
    await store.persistNow({ strict: true });
    res.status(201).json({ snippet });
  });
  router.patch('/playground/snippets/:id', async (req, res) => {
    const title = learningDeps.lib.playgroundTitle(req.body?.title);
    if (!title) return res.status(400).json({ error: 'Use a name of 1–80 characters.' });
    const bucket = bucketFor(req.user.id);
    if (!Object.hasOwn(bucket, req.params.id)) return res.status(404).json({ error: 'Saved code not found.' });
    const snippet = { ...bucket[req.params.id], title, updatedAt: new Date().toISOString() };
    bucket[req.params.id] = snippet;
    await store.persistNow({ strict: true });
    res.json({ snippet });
  });
  router.delete('/playground/snippets/:id', async (req, res) => {
    const bucket = bucketFor(req.user.id);
    delete bucket[req.params.id];
    if (!Object.keys(bucket).length) delete store.db().playgroundSnippets[req.user.id];
    await store.persistNow({ strict: true });
    res.json({ ok: true });
  });
  return router;
}
