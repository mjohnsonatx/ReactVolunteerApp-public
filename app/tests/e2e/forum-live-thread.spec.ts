import { test, expect } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp, type App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// A member writing a reply must keep the thread and their draft on screen
// while everything around them changes: other replies, votes, reports,
// moderation, other threads, network loss, and window focus changes.

const projectId = 'demo-watershed';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const requestedFirestorePort = Number(process.env.E2E_FIRESTORE_PORT);
const firestorePort = Number.isInteger(requestedFirestorePort) && requestedFirestorePort > 0 && requestedFirestorePort <= 65_535
  ? requestedFirestorePort
  : 8080;
let testEnv;
let adminApp: AdminApp;

test.beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${firestorePort}`;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${Number(process.env.E2E_AUTH_PORT || 9099)}`;
  adminApp = initializeAdminApp({ projectId }, 'forum-live-thread-e2e');
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: firestorePort, rules: readFileSync(path.join(repoRoot, 'firebase_rules/firestore.rules'), 'utf8') },
  });
});

test.afterAll(async () => {
  await testEnv?.cleanup();
  if (adminApp) await deleteAdminApp(adminApp);
});

test('a reply draft and its thread survive live activity, moderation, and network loss', async ({ page, context }) => {
  test.slow();
  const suffix = Date.now();
  const password = 'local-test-password';
  const userName = `drafter-${suffix}`;
  const email = `${userName}@example.test`;
  const title = `Live thread ${suffix}`;
  const postId = `live-${suffix}`;
  const otherPostId = `other-${suffix}`;
  const account = await getAdminAuth(adminApp).createUser({ email, password, emailVerified: true });
  const reply = (id: string, text: string) => ({
    id, text, author: 'sam', authorUserName: 'sam', authorId: 'someone-else', anonymous: false,
    date: 'today', flagged: false, upvotes: 0, downvotes: 0,
  });
  const write = (fn: (db: any) => Promise<unknown>) => testEnv.withSecurityRulesDisabled(ctx => fn(ctx.firestore()));
  await write(async db => {
    await db.doc(`users/${account.uid}`).set({ userName, name: userName, email, moderated: false });
    await db.doc(`forumPosts/${postId}`).set({
      title, content: 'Plan the next cleanup.', author: 'sam', authorUserName: 'sam', authorId: 'someone-else', anonymous: false,
      date: 'today', createdAt: new Date(), status: 'approved', flagged: false, upvotes: 0, downvotes: 0,
      replies: [reply('r1', 'First reply.')],
    });
  });

  await page.goto(`/forum/${postId}`);
  await page.getByRole('button', { name: 'Sign In' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign In' });
  await dialog.getByPlaceholder('Email').fill(email);
  await dialog.getByPlaceholder('Password').fill(password);
  await dialog.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();

  const draft = 'I can bring gloves and';
  await page.getByPlaceholder('Write a reply...').fill(draft);

  // Record every moment, however brief, that the thread or draft is not on screen.
  await page.evaluate(({ title, draft }) => {
    const w = window as any;
    w.__threadGlitches = new Set<string>();
    const check = () => {
      const headings = [...document.querySelectorAll('h2')].map(h => h.textContent);
      if (!headings.includes(title)) w.__threadGlitches.add(`thread hidden; h2s=${JSON.stringify(headings)}; body=${document.body.innerText.slice(0, 120)}`);
      const input = document.querySelector<HTMLInputElement>('input[placeholder="Write a reply..."]');
      if (!input) w.__threadGlitches.add('reply box missing');
      else if (input.value !== draft) w.__threadGlitches.add(`draft changed to ${JSON.stringify(input.value)}`);
    };
    new MutationObserver(check).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    w.__threadCheck = setInterval(check, 25);
  }, { title, draft });
  const glitches = () => page.evaluate(() => [...(window as any).__threadGlitches]);

  const steps: Array<[string, () => Promise<unknown>]> = [
    ['another member replies', () => write(db => db.doc(`forumPosts/${postId}`).update({ replies: [reply('r1', 'First reply.'), reply('r2', 'Second reply.')] }))],
    ['votes change', () => write(db => db.doc(`forumPosts/${postId}`).update({ upvotes: 3, downvotes: 1 }))],
    ['someone reports the thread', () => write(db => db.doc(`forumPosts/${postId}`).update({ flagged: true }))],
    ['an admin removes a reply', () => write(db => db.doc(`forumPosts/${postId}`).update({ replies: [reply('r2', 'Second reply.')] }))],
    ['a reply author deletes their account', () => write(db => db.doc(`forumPosts/${postId}`).update({ replies: [{ ...reply('r2', '[Removed after account deletion]'), author: '[Deleted User]', authorId: 'deleted' }] }))],
    ['a new thread is posted', () => write(db => db.doc(`forumPosts/${otherPostId}`).set({
      title: 'Other thread', content: 'x', author: 'sam', authorUserName: 'sam', authorId: 'someone-else', anonymous: false,
      date: 'today', createdAt: new Date(), status: 'approved', flagged: false, upvotes: 0, downvotes: 0, replies: [],
    }))],
    ['another thread is deleted', () => write(db => db.doc(`forumPosts/${otherPostId}`).delete())],
    ['the member\'s own profile document changes', () => write(db => db.doc(`users/${account.uid}`).update({ votes: { [`${postId}_post_up`]: true } }))],
    ['the window loses and regains focus', () => page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    })],
    ['the network drops long enough for Firestore to go offline, then returns', async () => {
      await context.setOffline(true);
      await page.waitForTimeout(12_000);
      await context.setOffline(false);
      await page.waitForTimeout(5_000);
    }],
    ['activity resumes after reconnecting', () => write(db => db.doc(`forumPosts/${postId}`).update({ upvotes: 4 }))],
  ];

  const report: string[] = [];
  for (const [label, action] of steps) {
    await action();
    await page.waitForTimeout(1_500);
    const seen = await glitches();
    report.push(`${label}: ${seen.length ? seen.join(' | ') : 'ok'}`);
    await page.evaluate(() => (window as any).__threadGlitches.clear());
  }
  console.log(`[forum-live-thread]\n${report.join('\n')}`);

  expect(report.filter(line => !line.endsWith(': ok'))).toEqual([]);
  await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
  await expect(page.getByPlaceholder('Write a reply...')).toHaveValue(draft);

  // Finally a moderator removes the thread itself: the member gets a plain
  // explanation and a way back, not a blank or broken page.
  await page.evaluate(() => clearInterval((window as any).__threadCheck));
  await write(db => db.doc(`forumPosts/${postId}`).delete());
  const removed = page.getByRole('heading', { name: 'This discussion has been removed' });
  await expect(removed).toBeVisible();
  await expect(removed).toBeFocused();
  await expect(page.getByPlaceholder('Write a reply...')).toHaveCount(0);
  await page.getByRole('link', { name: /back to forum/i }).click();
  await expect(page).toHaveURL(/\/forum$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Forum' })).toBeVisible();
});
