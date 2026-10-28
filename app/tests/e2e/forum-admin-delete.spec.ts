import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp, type App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// End-to-end admin moderation: an MFA-verified admin removes a reported
// thread through the admin panel while a member has it open with a reply
// half written. Covers the member's recovery path, the admin panel, the
// server-side cleanup, the audit trail, and that non-admins cannot delete.

const projectId = 'demo-watershed';
const host = '127.0.0.1';
const port = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 && value <= 65_535 ? value : fallback;
};
const firestorePort = port('E2E_FIRESTORE_PORT', 8080);
const authPort = port('E2E_AUTH_PORT', 9099);
const functionsPort = port('E2E_FUNCTIONS_PORT', 5001);
const appOrigin = `http://${host}:${port('E2E_APP_PORT', 5173)}`;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const password = 'local-test-password';
let testEnv;
let adminApp: AdminApp;

test.beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = `${host}:${firestorePort}`;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `${host}:${authPort}`;
  adminApp = initializeAdminApp({ projectId }, 'forum-admin-delete-e2e');
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { host, port: firestorePort, rules: readFileSync(path.join(repoRoot, 'firebase_rules/firestore.rules'), 'utf8') },
  });
});

test.afterAll(async () => {
  await testEnv?.cleanup();
  if (adminApp) await deleteAdminApp(adminApp);
});

type Member = { uid: string; email: string; userName: string; token: string };

async function createMember(request: APIRequestContext, userName: string, options: { admin?: boolean; moderated?: boolean } = {}): Promise<Member> {
  const email = `${userName}@example.test`;
  const account = await getAdminAuth(adminApp).createUser({ email, password, emailVerified: true });
  if (options.admin) await getAdminAuth(adminApp).setCustomUserClaims(account.uid, { admin: true, desktop_admin_mfa: true });
  await testEnv.withSecurityRulesDisabled(ctx => ctx.firestore().doc(`users/${account.uid}`).set({
    userName, name: userName, email, moderated: options.moderated === true,
  }));
  const signIn = await request.post(
    `http://${host}:${authPort}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    { data: { email, password, returnSecureToken: true } },
  );
  expect(signIn.ok()).toBe(true);
  return { uid: account.uid, email, userName, token: (await signIn.json()).idToken };
}

async function call(request: APIRequestContext, name: string, data: Record<string, unknown>, member: Member) {
  const response = await request.post(`http://${host}:${functionsPort}/${projectId}/us-central1/${name}`, {
    data: { data },
    headers: { Origin: appOrigin, Authorization: `Bearer ${member.token}` },
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok() && !payload.error, result: payload.result, error: payload.error?.message as string | undefined };
}

async function signInThroughUi(page: Page, member: Member) {
  await page.getByRole('button', { name: 'Sign In' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign In' });
  await dialog.getByPlaceholder('Email').fill(member.email);
  await dialog.getByPlaceholder('Password').fill(password);
  await dialog.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
}

// withSecurityRulesDisabled resolves to void, so hand results out explicitly.
async function readDb<T>(read: (db: any) => Promise<T>): Promise<T> {
  let result: T | undefined;
  await testEnv.withSecurityRulesDisabled(async ctx => { result = await read(ctx.firestore()); });
  return result as T;
}
const docs = (collection: string, field: string, value: string) => readDb(async db =>
  (await db.collection(collection).where(field, '==', value).get()).docs.map(d => ({ id: d.id, ...d.data() })));
const exists = (docPath: string) => readDb(async db => (await db.doc(docPath).get()).exists);

test('an admin removes a reported thread while a member is replying to it', async ({ page, browser, baseURL, request }) => {
  test.slow();
  const suffix = Date.now();
  const admin = await createMember(request, `moderator-${suffix}`, { admin: true });
  const author = await createMember(request, `author-${suffix}`);
  const viewer = await createMember(request, `viewer-${suffix}`);
  const helper = await createMember(request, `helper-${suffix}`);
  const held = await createMember(request, `held-${suffix}`, { moderated: true });
  const title = `Thread to remove ${suffix}`;

  // Build a thread with every kind of related record the deletion must clean
  // up: anonymous author identity, an anonymous reply, a reply held for
  // moderation, and a member report.
  const created = await call(request, 'submitForumPost', { title, content: 'Something that breaks the rules.', anonymous: true }, author);
  expect(created).toMatchObject({ ok: true, result: { status: 'approved' } });
  const postId: string = created.result.id;
  expect((await call(request, 'submitReply', { postId, text: 'Visible anonymous reply.', anonymous: true }, helper)).ok).toBe(true);
  expect((await call(request, 'submitReply', { postId, text: 'Reply waiting for review.', anonymous: false }, held)).result).toMatchObject({ status: 'pending' });
  expect((await call(request, 'flagContent', { postId, replyId: null, reason: 'unsafe', details: 'Please review this thread.' }, viewer)).ok).toBe(true);
  expect(await docs('forumAuthors', 'postId', postId)).toHaveLength(2);
  expect(await docs('forumPendingReplies', 'postId', postId)).toHaveLength(1);
  expect(await exists(`forumAnonymousThreads/${postId}`)).toBe(true);

  // A member cannot delete the thread themselves.
  const denied = await call(request, 'deleteForumPost', { id: postId }, viewer);
  expect(denied.ok).toBe(false);
  expect(denied.error).toMatch(/admin/i);
  expect(await exists(`forumPosts/${postId}`)).toBe(true);

  // The member opens the thread and starts a reply.
  await page.goto(`/forum/${postId}`);
  await signInThroughUi(page, viewer);
  await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
  await expect(page.getByText('Visible anonymous reply.')).toBeVisible();
  await expect(page.getByText('Reply waiting for review.')).toHaveCount(0);
  const draft = 'I was about to say';
  await page.getByPlaceholder('Write a reply...').fill(draft);

  const adminContext = await browser.newContext({ baseURL });
  try {
    // The admin finds the reported thread in the moderation queue, reviews it,
    // and deletes it from the thread view.
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/forum');
    await signInThroughUi(adminPage, admin);
    await adminPage.goto('/admin/forum');
    await expect(adminPage.getByRole('heading', { name: /needs attention/i })).toBeVisible();
    await adminPage.getByRole('button', { name: `View post: ${title}` }).first().click();
    await expect(adminPage.getByText('Something that breaks the rules.')).toBeVisible();
    await adminPage.getByRole('button', { name: `Delete post: ${title}` }).click();

    // Admin panel: back to the forum tab with the thread gone everywhere.
    await expect(adminPage.getByRole('heading', { name: /^All Posts/ })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: `Delete post: ${title}` })).toHaveCount(0);
    await expect(adminPage.getByText(title)).toHaveCount(0);

    // Member: a plain explanation, focus on it, no reply box, and a way back.
    const removed = page.getByRole('heading', { name: 'This discussion has been removed' });
    await expect(removed).toBeVisible();
    await expect(removed).toBeFocused();
    await expect(page.getByText(/a moderator removed it/i)).toBeVisible();
    await expect(page.getByPlaceholder('Write a reply...')).toHaveCount(0);
    await expect(page.getByText(draft)).toHaveCount(0);
    await expect(page.getByText('Visible anonymous reply.')).toHaveCount(0);
    await page.getByRole('link', { name: /back to forum/i }).click();
    await expect(page).toHaveURL(/\/forum$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Forum' })).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);

    // Coming back later (history, bookmark, notification) finds nothing.
    await page.goBack();
    await expect(page.getByRole('heading', { name: /this discussion has been removed|this discussion isn.t available/i })).toBeVisible();
    await page.goto(`/forum/${postId}`);
    await expect(page.getByRole('heading', { name: /this discussion isn.t available/i })).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);

    // Replying to the removed thread is refused by the server too.
    const lateReply = await call(request, 'submitReply', { postId, text: 'Too late.' }, viewer);
    expect(lateReply.ok).toBe(false);
    expect(lateReply.error).toMatch(/not found/i);

    // Server: the thread and everything that hangs off it are gone, and the
    // deletion is attributed to the admin in the audit log.
    expect(await exists(`forumPosts/${postId}`)).toBe(false);
    expect(await docs('forumPendingReplies', 'postId', postId)).toEqual([]);
    expect(await docs('forumAuthors', 'postId', postId)).toEqual([]);
    expect(await exists(`forumAnonymousThreads/${postId}`)).toBe(false);
    const audit = await docs('adminAuditLogs', 'resourceId', postId);
    expect(audit).toEqual([expect.objectContaining({ action: 'forum-post.delete', resourceType: 'forum-post', actorUid: admin.uid })]);
  } finally {
    await adminContext.close();
  }
});
