/** Actual native API contracts against a separate server and temporary database.
 * No existing account, payment provider or compiler service is changed. */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let child, base, dataDir, bootLog = '';
beforeAll(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'codeconsist-mobile-e2e-'));
  const env = { ...process.env, PORT: '0', API_PORT: '0', DATA_DIR: dataDir, JWT_SECRET: 'temporary-mobile-integration-secret-not-a-production-key' };
  for (const name of ['ADMIN_USER_ID', 'ADMIN_PASSWORD', 'APP_ORIGIN', 'MICROSOFT_TENANT_ID', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_EXCEL_DRIVE_ID', 'MICROSOFT_EXCEL_WORKBOOK_ID', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'GEMINI_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'JUDGE0_API_URL', 'JUDGE0_API_KEY', 'JUDGE0_AUTH_TOKEN', 'VITE_JUDGE0_API_URL', 'VITE_JUDGE0_API_KEY']) env[name] = '';
  env.ADMIN_USER_ID = 'mobile-test-admin';
  env.ADMIN_PASSWORD = 'Only-For-Isolated-Tests-9384!';
  child = spawn(process.execPath, ['server/index.js'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Isolated API did not start: ${bootLog.slice(-1500)}`)), 90000);
    const read = chunk => {
      bootLog += String(chunk);
      const match = bootLog.match(/API listening on http:\/\/localhost:(\d+)/);
      if (match) { base = `http://127.0.0.1:${match[1]}`; clearTimeout(timeout); resolve(); }
    };
    child.stdout.on('data', read); child.stderr.on('data', read);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { if (!base) { clearTimeout(timeout); reject(new Error(`Isolated API exited ${code}: ${bootLog.slice(-1500)}`)); } });
  });
}, 95000);

afterAll(async () => {
  if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  // Validate the exact target before recursively removing this test's own directory.
  if (dataDir && path.dirname(path.resolve(dataDir)) === path.resolve(os.tmpdir()) && path.basename(dataDir).startsWith('codeconsist-mobile-e2e-')) await rm(dataDir, { recursive: true, force: true });
});

async function api(route, body, token, method, headers = {}) {
  const response = await fetch(base + '/api' + route, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Time-Zone': 'Asia/Kolkata', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json() };
}

describe('the real native learner API', () => {
  it('shares saved programs across clients and revokes only the signed-out session', async () => {
    const credentials = { email: 'sessions@example.test', password: 'Native-Sessions-9384!' };
    const mobile = await api('/auth/register', { ...credentials, username: 'Session QA' }, undefined, 'POST', { 'X-CodeConsist-Client': 'android' });
    const web = await api('/auth/login', credentials, undefined, 'POST', { 'User-Agent': 'Mozilla/5.0 Chrome/130.0' });
    expect(mobile.status).toBe(201); expect(web.status).toBe(200);
    expect(mobile.body.token).not.toBe(web.body.token);
    const sessionRoute = `/admin/users/${mobile.body.user.id}/sessions`;
    expect((await api(sessionRoute)).status).toBe(401);
    expect((await api(sessionRoute, undefined, mobile.body.token)).status).toBe(401);
    const admin = await api('/admin-auth/login', { userId: 'mobile-test-admin', password: 'Only-For-Isolated-Tests-9384!' });
    expect(admin.status).toBe(200);
    const devices = await api(sessionRoute, undefined, admin.body.token);
    expect(devices.body.sessions.map(row => row.platform).sort()).toEqual(['Android app', 'Desktop web']);
    expect(JSON.stringify(devices.body)).not.toContain(mobile.body.token);
    for (const language of ['c', 'cpp', 'java', 'python', 'typescript', 'go', 'web']) {
      const program = language === 'web' ? { language, files: { html: '<h1>Hello</h1>', css: 'h1 {color:red}', js: 'console.log(1)' } } : { language, code: 'shared exact code', stdin: '42' };
      const route = `/playground/snippets/mobile-save-${language}`;
      expect((await api(route, { title: 'From Android', program }, mobile.body.token, 'PUT')).status).toBe(201);
      const saved = await api(`/playground/snippets?language=${language}`, undefined, web.body.token);
      expect(saved.body.snippets[0].program).toEqual(program);
      expect((await api(route, { title: 'Renamed on web' }, web.body.token, 'PATCH')).status).toBe(200);
      expect((await api(`/playground/snippets?language=${language}`, undefined, mobile.body.token)).body.snippets[0].title).toBe('Renamed on web');
      expect((await api(route, undefined, mobile.body.token, 'DELETE')).status).toBe(200);
    }
    expect((await api('/auth/logout', {}, mobile.body.token)).status).toBe(200);
    expect((await api('/auth/me', undefined, mobile.body.token)).status).toBe(401);
    expect((await api('/auth/me', undefined, web.body.token)).status).toBe(200);
    expect((await api(sessionRoute, undefined, admin.body.token)).body.sessions.find(row => row.platform === 'Android app').status).toBe('Signed out');
  }, 30000);
  it('registers, verifies a lesson, calculates real achievements and reflects a test purchase', async () => {
    expect((await api('/auth/me')).status).toBe(401);
    const registered = await api('/auth/register', { email: 'mobile-e2e@example.test', username: 'Mobile QA', password: 'Mobile-Only-Testing-4381!' });
    expect(registered.status).toBe(201);
    const { token, user, progress } = registered.body;
    expect(token).toEqual(expect.any(String)); expect(user.id).toBeTruthy(); expect(progress.completedChallenges).toEqual([]);
    const login = await api('/auth/login', { email: 'mobile-e2e@example.test', password: 'Mobile-Only-Testing-4381!' });
    expect(login.body.user.id).toBe(user.id); expect(login.body.habits).toBeTruthy();
    const content = await api('/content', undefined, token);
    expect(content.body.challenges.length).toBeGreaterThan(800);
    expect(content.body.languageTracks.length).toBeGreaterThan(0);
    const quiz = content.body.challenges.find(row => row.stageId === 'stage-1' && row.type === 'quiz' && !row.isStageTest && !row.locked);
    expect(quiz).toBeTruthy();
    const wrong = await api('/progress/solve', { challengeId: quiz.id, answer: (quiz.correctIndex + 1) % quiz.options.length, attempts: 1, hintsUsed: 0 }, token);
    expect(wrong.status).toBe(422);
    const solved = await api('/progress/solve', { challengeId: quiz.id, answer: quiz.correctIndex, attempts: 2, hintsUsed: 0, context: 'lesson', learningMode: 'learn' }, token);
    expect(solved.status).toBe(200);
    expect(solved.body.verified).toBe(true); expect(solved.body.awardedXp).toBeGreaterThan(0);
    const me = await api('/auth/me', undefined, token);
    expect(me.body.progress.completedChallenges).toContain(quiz.id);
    expect(me.body.habits.streak).toBeGreaterThan(0);
    const badges = await api('/achievements', undefined, token);
    expect(badges.status).toBe(200);
    expect(badges.body.achievements.find(row => row.id === 'first-solve').earnedAt).toBeTruthy();
    const league = await api('/leagues/current', undefined, token);
    expect(league.status).toBe(200); expect(league.body.rows).toEqual(expect.any(Array));
    const board = await api('/leaderboard', undefined, token);
    expect(board.body.me.username).toBe(user.username);
    const review = await api('/review/session', {}, token);
    expect(review.status).toBe(200); expect(review.body.items).toEqual(expect.any(Array));
    const catalog = await api('/billing/catalog', undefined, token);
    expect(catalog.body.mode).toBe('test'); expect(catalog.body.catalog.lifetime.amount).toBeGreaterThan(0);
    const order = await api('/billing/orders', { product: { kind: 'lifetime' } }, token);
    expect(order.status).toBe(201); expect(order.body.order.status).toBe('created');
    expect((await api('/mobile/checkout', { orderId: order.body.order.id }, token)).status).toBe(409);
    const paid = await api(`/billing/orders/${order.body.order.id}/test-complete`, {}, token);
    expect(paid.body.user.isPremium).toBe(true);
    expect((await api('/auth/me', undefined, token)).body.user.isPremium).toBe(true);
    expect((await api('/billing/orders', undefined, token)).body.orders[0].status).toBe('paid');
    expect((await api('/certificates', undefined, token)).body.certificates).toEqual([]);
  }, 30000);

  it('executes typed TypeScript and SQL, reports test failures and never claims missing Python ran', async () => {
    const health = await api('/health');
    expect(health.body.serverRuntimes.typescript.available).toBe(true);
    expect(health.body.serverRuntimes.python.available).toBe(false);
    const typed = await api('/execute', { language: 'typescript', code: 'function twice(n: number): number { return n * 2; }', entryFunction: 'twice', testCases: [{ input: '3', expected: '6' }, { input: '4', expected: '8' }] });
    expect(typed.status).toBe(200); expect(typed.body.status).toBe('passed'); expect(typed.body.testResults).toHaveLength(2);
    const wrong = await api('/execute', { language: 'typescript', code: 'function twice(n: number): number { return n; }', entryFunction: 'twice', testCases: [{ input: '3', expected: '6' }] });
    expect(wrong.body.status).toBe('failed'); expect(wrong.body.testResults[0].passed).toBe(false);
    const sql = await api('/execute', { language: 'sql', code: "SELECT 'mobile-ok' AS result;" });
    expect(sql.body.status).toBe('passed'); expect(sql.body.stdout).toContain('mobile-ok');
    const python = await api('/execute', { language: 'python', code: 'print(1)' });
    expect(python.status).toBe(501); expect(python.body.status).toBe('error'); expect(python.body.reason).toBe('runtime-unavailable');
  }, 30000);
});
