import { test, expect } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp, type App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectId = 'demo-watershed';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const requestedFirestorePort = Number(process.env.E2E_FIRESTORE_PORT);
const firestorePort = Number.isInteger(requestedFirestorePort)
  && requestedFirestorePort > 0
  && requestedFirestorePort <= 65_535
  ? requestedFirestorePort
  : 8080;
let testEnv;
let adminApp: AdminApp;

test.beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${firestorePort}`;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${Number(process.env.E2E_AUTH_PORT || 9099)}`;
  adminApp = initializeAdminApp({ projectId }, 'volunteer-journey-e2e');
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: firestorePort,
      rules: readFileSync(path.join(repoRoot, 'firebase_rules/firestore.rules'), 'utf8'),
    },
  });
});

test.afterAll(async () => {
  await testEnv?.cleanup();
  if (adminApp) await deleteAdminApp(adminApp);
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc('siteContent/main').set({
      mission: 'Keep the creek clean and the trail welcoming.',
      goals: 'Host monthly cleanups and share public resources.',
      about: {
        name: 'River Lead',
        bio: 'Local cleanup organizer.',
        imageUrl: '',
        imagePath: '',
      },
    });
    await db.doc('events/event-1').set({
      title: 'Trail Cleanup',
      date: '2026-06-15',
      time: '9:00 AM',
      location: 'Creek Park',
      description: 'Bring water and comfortable shoes.',
      lat: 30.244,
      lng: -97.712,
      createdAt: new Date(),
    });
    await db.doc('documents/doc-1').set({
      userId: 'public-owner',
      title: 'Cleanup Packet',
      name: 'cleanup-packet.pdf',
      type: 'PDF',
      size: '42 KB',
      notes: 'Public planning notes.',
      published: true,
      status: 'approved',
      visibility: 'public',
      storagePath: 'documents/public-owner/missing-cleanup-packet.pdf',
      thumbnailPath: '',
      uploadDate: new Date(),
    });
  });
});

test('visitor can use public navigation and forms without the gated document feature', async ({ page }) => {
  const suffix = Date.now();

  await page.goto('/');
  const primaryNavigation = page.getByRole('navigation', { name: /primary navigation/i });
  await expect(primaryNavigation).toBeVisible();
  await expect(primaryNavigation.getByRole('link', { name: /about me/i })).toHaveCount(0);
  await expect(page.getByRole('region', { name: /about me/i })).toHaveCount(0);
  await page.getByRole('contentinfo').getByRole('link', { name: /about me/i }).click();
  await expect(page.getByRole('region', { name: /about me/i })).toContainText('River Lead');
  await expect(page.getByRole('region', { name: /about me/i }).locator('img')).toHaveCount(0);
  await page.getByRole('link', { name: /home/i }).click();
  await expect(page.getByRole('heading', { name: /creek & watershed clean-up/i })).toBeVisible();
  await expect(page.getByText(/restoration plan priorities/i)).toBeVisible();

  await page.getByRole('link', { name: 'Plant ID', exact: true }).click();
  await expect(page).toHaveURL(/\/plants$/);
  await expect(page.getByText(/triadica sebifera/i)).toBeVisible();
  await expect(page.getByText('Warm-season growth', { exact: true })).toBeVisible();
  await expect(page.getByText('Fall color', { exact: true })).toBeVisible();
  await expect(page.getByText('Summer seed pods', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: /home/i }).click();

  await page.getByPlaceholder('Name').fill('Visitor Tester');
  await page.getByPlaceholder('Email').first().fill(`visitor_${suffix}@example.test`);
  await page.getByRole('button', { name: /sign up/i }).click();
  await expect(page.getByText(/thanks for signing up/i)).toBeVisible();

  await page.getByPlaceholder('Email').nth(1).fill(`newsletter_${suffix}@example.test`);
  await page.getByRole('button', { name: /subscribe/i }).click();
  await expect(page.getByText(/subscribed/i)).toBeVisible();

  await expect(page.getByRole('link', { name: /documents/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /documents/i })).toHaveCount(0);

  await page.getByRole('link', { name: 'Events', exact: true }).click();
  await expect(page.getByText('Trail Cleanup')).toBeVisible();
  await page.getByRole('button', { name: /rsvp/i }).click();
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
});

test('production document gate removes desktop/mobile entrypoints and redirects bookmarks without fetching PDFs', async ({ page }) => {
  const documentRequests: string[] = [];
  page.on('request', request => {
    if (/listPublicDocuments|missing-cleanup-packet|PdfPreview-|pdf\.worker/.test(request.url())) {
      documentRequests.push(request.url());
    }
  });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const path of ['/documents', '/documents/doc-1?from=bookmark', '/documentDetail']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { name: /creek & watershed clean-up/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /documents/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /documents/i })).toHaveCount(0);
      await expect(page.getByRole('dialog', { name: /cleanup packet/i })).toHaveCount(0);
      await page.getByRole('link', { name: 'Events', exact: true }).click();
      await expect(page.getByText('Trail Cleanup')).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/\/$/);
    }
  }
  expect(documentRequests).toEqual([]);
});

test('signed-in visitor can create an account, RSVP, and post safely', async ({ page }) => {
  const suffix = Date.now();
  page.on('dialog', dialog => {
    throw new Error(`Unexpected dialog fired: ${dialog.message()}`);
  });

  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('dialog', { name: /sign in/i }).getByRole('button', { name: /sign up/i }).click();
  const signupDialog = page.getByRole('dialog', { name: /create account/i });
  await expect(signupDialog.getByPlaceholder('Full Name')).toHaveCount(0);
  await expect(signupDialog.getByPlaceholder('Username')).toHaveCount(0);
  await signupDialog.getByPlaceholder('Email').fill(`e2e_${suffix}@example.test`);
  await signupDialog.getByPlaceholder('Password', { exact: true }).fill('secret123456789');
  await signupDialog.getByPlaceholder('Confirm Password').fill('secret123456789');
  await signupDialog.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('button', { name: /account menu/i })).toBeVisible();
  await expect(signupDialog).toHaveCount(0);
  const email = `e2e_${suffix}@example.test`;
  const authPort = Number(process.env.E2E_AUTH_PORT || 9099);
  const uid = (await getAdminAuth(adminApp).getUserByEmail(email)).uid;
  await testEnv.withSecurityRulesDisabled(async context => {
    expect((await context.firestore().doc(`users/${uid}`).get()).data()).toMatchObject({ userName: `e2e_${suffix}`, name: `e2e_${suffix}` });
  });
  const verification = await page.request.post(`http://127.0.0.1:${authPort}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key`, {
    headers: { Authorization: 'Bearer owner' },
    data: { localId: uid, emailVerified: true },
  });
  expect(verification.ok()).toBe(true);
  await page.getByRole('button', { name: /i verified my email/i }).click();
  await expect(page.getByText(/verify your email address before posting/i)).toHaveCount(0);

  await page.getByRole('link', { name: 'Events', exact: true }).click();
  await page.getByRole('button', { name: /rsvp/i }).click();
  await page.getByRole('button', { name: /confirm rsvp/i }).click();
  await expect(page.getByRole('button', { name: /going/i })).toBeVisible();

  await page.getByRole('link', { name: /forum/i }).click();
  await page.getByRole('button', { name: /new post/i }).click();
  const newPostDialog = page.getByRole('dialog', { name: /new post/i });
  const safeTitle = `First cleanup ${suffix}`;
  await newPostDialog.getByPlaceholder('Title').fill(safeTitle);
  await newPostDialog.getByPlaceholder("What's on your mind?").fill('Meet at the creek at 9 AM.');
  await newPostDialog.getByRole('button', { name: /^preview post$/i }).click();
  await expect(newPostDialog.getByRole('region', { name: 'Post preview' })).toContainText(`@e2e_${suffix}`);
  await newPostDialog.getByRole('button', { name: /^create post$/i }).click();
  await expect(page.getByText(safeTitle)).toBeVisible();

  await page.getByRole('button', { name: /new post/i }).click();
  const unsafeDialog = page.getByRole('dialog', { name: /new post/i });
  await unsafeDialog.getByPlaceholder('Title').fill('Unsafe post');
  await unsafeDialog.getByPlaceholder("What's on your mind?").fill('<script>alert(1)</script>');
  await unsafeDialog.getByRole('button', { name: /^preview post$/i }).click();
  await expect(page.getByText(/post blocked/i)).toBeVisible();
});

test('an Auth-only account verifies email, completes its profile, and previews before posting', async ({ page }, testInfo) => {
  const suffix = Date.now();
  const email = `incomplete_${suffix}@example.test`;
  const password = 'secret123456789';
  const account = await getAdminAuth(adminApp).createUser({ email, password, emailVerified: false });
  const userName = `incomplete_${suffix}`;
  await page.goto('/forum');
  await page.getByRole('button', { name: /sign in/i }).click();
  const signIn = page.getByRole('dialog', { name: /sign in/i });
  await signIn.getByPlaceholder('Email').fill(email);
  await signIn.getByPlaceholder('Password').fill(password);
  await signIn.getByRole('button', { name: /^sign in$/i }).click();
  await expect(signIn).toHaveCount(0);
  await expect(page.getByText(/verify your email address first/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Complete your public profile' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Resend verification email' }).click();
  await expect(page.getByText(/verification email sent/i)).toBeVisible();

  // Consume the emulator's actual verification action code, without a real inbox.
  const authOrigin = `http://127.0.0.1:${Number(process.env.E2E_AUTH_PORT || 9099)}`;
  const codes = await page.request.get(`${authOrigin}/emulator/v1/projects/${projectId}/oobCodes`);
  const code = (await codes.json()).oobCodes.find((item: any) => item.email === email && item.requestType === 'VERIFY_EMAIL');
  expect(code?.oobCode).toBeTruthy();
  const verified = await page.request.post(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key`, { data: { oobCode: code.oobCode } });
  expect(verified.ok()).toBe(true);
  await page.getByRole('button', { name: 'I verified my email' }).click();
  await expect(page.getByRole('heading', { name: 'Complete your public profile' })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByLabel('Display name')).toHaveCount(0);
  await expect(page.getByLabel('Username', { exact: true })).toHaveCount(0);
  const identityPreview = page.getByRole('region', { name: 'Public profile preview' });
  await expect(identityPreview).toContainText(`@${userName}`);
  await expect(identityPreview).not.toContainText(email);
  await page.screenshot({ path: testInfo.outputPath('profile-setup-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save profile and continue' }).click();
  await expect(page.getByRole('heading', { name: 'Complete your public profile' })).toHaveCount(0);
  await testEnv.withSecurityRulesDisabled(async context => {
    expect((await context.firestore().doc(`users/${account.uid}`).get()).data()).toMatchObject({ name: userName, userName, accountStatus: 'active' });
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Forum', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'New Post', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'New Post' });
  await modal.getByPlaceholder('Title').fill('A first post');
  await modal.getByPlaceholder("What's on your mind?").fill('Line one\nLine two');
  await modal.getByRole('button', { name: 'Preview post' }).click();
  await expect(modal.getByRole('region', { name: 'Post preview' })).toContainText(`@${userName}`);
  await testEnv.withSecurityRulesDisabled(async context => {
    expect((await context.firestore().collection('forumPosts').get()).empty).toBe(true);
  });
  await page.screenshot({ path: testInfo.outputPath('post-preview-mobile.png'), fullPage: true });
  await modal.getByRole('button', { name: 'Edit post' }).click();
  await modal.getByPlaceholder('Title').fill('A reviewed first post');
  await modal.getByRole('button', { name: 'Preview post' }).click();
  await modal.getByRole('button', { name: 'Create Post' }).click();
  await expect(modal).toHaveCount(0);
  await page.getByRole('heading', { name: 'A reviewed first post' }).click();
  await expect(page.getByText(`@${userName}`, { exact: true })).toBeVisible();
  await expect(page.getByText('Line one\nLine two')).toBeVisible();
  await page.getByPlaceholder('Write a reply...').fill('I can bring cleanup supplies.');
  await page.getByPlaceholder('Write a reply...').press('Enter');
  await expect(page.getByText('I can bring cleanup supplies.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '1 Replies', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('heading', { name: 'A reviewed first post' }).click();
  await expect(page.getByText('I can bring cleanup supplies.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('button', { name: 'My Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Display name')).toHaveCount(0);
  const updatedUserName = `updated-${suffix}`;
  await page.getByLabel('Username', { exact: true }).fill(updatedUserName);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: `@${updatedUserName}`, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: `@${updatedUserName}`, exact: true })).toBeVisible();
  await testEnv.withSecurityRulesDisabled(async context => {
    expect((await context.firestore().doc(`users/${account.uid}`).get()).data()).toMatchObject({ name: updatedUserName, userName: updatedUserName, accountStatus: 'active' });
  });
});

test('anonymous forum participants keep thread handles and admins can inspect the real authors', async ({ page, browser, baseURL }, testInfo) => {
  const suffix = Date.now();
  const password = 'local-test-password';
  const accounts = [];
  for (const name of ['alpha', 'bravo', 'moderator']) {
    const userName = `${name}-${suffix}`;
    const email = `${userName}@example.test`;
    const account = await getAdminAuth(adminApp).createUser({ email, password, emailVerified: true });
    if (name === 'moderator') await getAdminAuth(adminApp).setCustomUserClaims(account.uid, { admin: true, desktop_admin_mfa: true });
    await testEnv.withSecurityRulesDisabled(ctx => ctx.firestore().doc(`users/${account.uid}`).set({ userName, name: userName, email, moderated: false }));
    accounts.push({ ...account, userName, email });
  }
  const login = async (p, member) => {
    await p.goto('/forum');
    await p.getByRole('button', { name: /sign in/i }).click();
    const dialog = p.getByRole('dialog', { name: 'Sign In' });
    await dialog.getByPlaceholder('Email').fill(member.email);
    await dialog.getByPlaceholder('Password').fill(password);
    await dialog.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(p.getByRole('button', { name: 'Account menu' })).toBeVisible();
  };
  const otherContext = await browser.newContext({ baseURL });
  const guestContext = await browser.newContext({ baseURL });
  const adminContext = await browser.newContext({ baseURL });
  try {
    await login(page, accounts[0]);
    await page.getByRole('button', { name: 'New Post', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'New Post' });
    await modal.getByLabel('Title').fill('Anonymous discussion');
    await modal.getByLabel('Post content').fill('A community question.');
    await modal.getByLabel('Post anonymously').check();
    await modal.getByRole('button', { name: 'Preview post' }).click();
    await expect(modal.getByRole('region', { name: 'Post preview' })).toContainText('Anonymous 1');
    await expect(modal.getByRole('region', { name: 'Post preview' })).not.toContainText(accounts[0].userName);
    await modal.getByRole('button', { name: 'Create Post', exact: true }).click();
    await expect(modal).toHaveCount(0);
    await page.getByRole('heading', { name: 'Anonymous discussion' }).click();

    const otherPage = await otherContext.newPage();
    await login(otherPage, accounts[1]);
    await otherPage.getByRole('heading', { name: 'Anonymous discussion' }).click();
    const send = async (p, text) => {
      await p.getByPlaceholder('Write a reply...').fill(text);
      await p.getByLabel('Reply anonymously').check();
      await p.getByRole('button', { name: 'Send reply' }).click();
      await expect(p.getByText(text, { exact: true })).toBeVisible();
    };
    await send(otherPage, 'First suggestion.');
    await otherPage.reload();
    await otherPage.getByRole('heading', { name: 'Anonymous discussion' }).click();
    await send(otherPage, 'Another suggestion.');
    await expect(otherPage.getByText('Anonymous 2', { exact: true })).toHaveCount(2);
    await send(page, 'Thanks from the original poster.');
    await expect(page.getByText('Anonymous 1', { exact: true })).toHaveCount(2);

    const guestPage = await guestContext.newPage();
    await guestPage.goto('/forum');
    await guestPage.getByRole('heading', { name: 'Anonymous discussion' }).click();
    await expect(guestPage.getByText('Anonymous 1', { exact: true })).toHaveCount(2);
    await expect(guestPage.getByText('Anonymous 2', { exact: true })).toHaveCount(2);
    for (const member of accounts) {
      await expect(guestPage.locator('body')).not.toContainText(member.userName);
      await expect(guestPage.locator('body')).not.toContainText(member.uid);
    }
    await guestPage.screenshot({ path: testInfo.outputPath('anonymous-thread-public.png'), fullPage: true });

    const adminPage = await adminContext.newPage();
    await login(adminPage, accounts[2]);
    await adminPage.goto('/admin/forum');
    await expect(adminPage.getByRole('button', { name: `Author ID: ${accounts[0].uid}`, exact: true })).toBeVisible();
    await expect(adminPage.getByText(`@${accounts[0].userName}`, { exact: true }).first()).toBeVisible();
    await adminPage.getByRole('button', { name: `Author ID: ${accounts[0].uid}`, exact: true }).click();
    await expect(adminPage.getByRole('heading', { name: `@${accounts[0].userName}`, exact: true })).toBeVisible();
    await adminPage.screenshot({ path: testInfo.outputPath('anonymous-author-admin.png'), fullPage: true });
  } finally {
    await Promise.all([otherContext.close(), guestContext.close(), adminContext.close()]);
  }
});

test('forum threads keep URL, history, notification links, and replies in sync', async ({ page }) => {
  const suffix = Date.now();
  const password = 'local-test-password';
  const userName = `threads-${suffix}`;
  const email = `${userName}@example.test`;
  const account = await getAdminAuth(adminApp).createUser({ email, password, emailVerified: true });
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await db.doc(`users/${account.uid}`).set({ userName, name: userName, email, moderated: false });
    for (const [id, title, minutes] of [['post-a', 'Thread A', 2], ['post-b', 'Thread B', 1]] as const) {
      await db.doc(`forumPosts/${id}`).set({
        title, content: `${title} body.`, author: 'sam', authorUserName: 'sam', authorId: 'someone-else', anonymous: false,
        date: 'today', createdAt: new Date(Date.now() - minutes * 60_000), status: 'approved',
        flagged: false, upvotes: 0, downvotes: 0, replies: [],
      });
    }
  });
  const threadHeading = (title: string) => page.getByRole('heading', { level: 2, name: title });

  // Legacy notification links land on the canonical thread URL, and refresh keeps it.
  await page.goto('/forum?post=post-b');
  await expect(threadHeading('Thread B')).toBeVisible();
  await expect(page).toHaveURL(/\/forum\/post-b$/);
  await page.reload();
  await expect(threadHeading('Thread B')).toBeVisible();

  // In-app navigation and browser history follow the thread shown.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/forum$/);
  await page.getByRole('link', { name: 'Thread A' }).click();
  await expect(page).toHaveURL(/\/forum\/post-a$/);
  await expect(threadHeading('Thread A')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/forum$/);
  await expect(page.getByRole('heading', { name: '0 Replies' })).toHaveCount(0);
  await page.goForward();
  await expect(threadHeading('Thread A')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  await nav.getByRole('link', { name: 'Events' }).click();
  await nav.getByRole('link', { name: 'Forum' }).click();
  await expect(page).toHaveURL(/\/forum$/);
  await expect(page.getByRole('heading', { name: '0 Replies' })).toHaveCount(0);

  await page.goto('/forum/missing-thread');
  await expect(page.getByRole('heading', { name: /this discussion isn.t available/i })).toBeVisible();
  await page.getByRole('link', { name: /back to forum/i }).click();
  await expect(page).toHaveURL(/\/forum$/);

  // A signed-in reply sent with an impatient double Enter posts once and the
  // thread stays on screen.
  await page.goto('/forum/post-a');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign In' });
  await dialog.getByPlaceholder('Email').fill(email);
  await dialog.getByPlaceholder('Password').fill(password);
  await dialog.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/forum\/post-a$/);
  const replyBox = page.getByPlaceholder('Write a reply...');
  await replyBox.fill('Count me in.');
  await replyBox.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Count me in.', { exact: true })).toHaveCount(1);
  await expect(threadHeading('Thread A')).toBeVisible();
  await expect(page.getByRole('heading', { name: '1 Replies' })).toBeVisible();
  await testEnv.withSecurityRulesDisabled(async ctx => {
    expect((await ctx.firestore().doc('forumPosts/post-a').get()).data()?.replies).toHaveLength(1);
  });
});

test('account auth enforces password limits and supports reset, change, and fresh sign-in', async ({ page }) => {
  test.slow();
  const suffix = Date.now();
  const email = `auth_${suffix}@example.test`;
  const originalPassword = 'secret123456789';
  const updatedPassword = 'updated12345678';

  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('dialog', { name: /sign in/i }).getByRole('button', { name: /sign up/i }).click();
  const signupDialog = page.getByRole('dialog', { name: /create account/i });
  const password = signupDialog.getByPlaceholder('Password', { exact: true });
  const confirmPassword = signupDialog.getByPlaceholder('Confirm Password');

  await expect(password).toHaveAttribute('minlength', '15');
  await expect(password).toHaveAttribute('maxlength', '25');
  await expect(confirmPassword).toHaveAttribute('minlength', '15');
  await expect(confirmPassword).toHaveAttribute('maxlength', '25');

  await expect(signupDialog.getByPlaceholder('Username')).toHaveCount(0);
  await signupDialog.getByPlaceholder('Email').fill(email);
  await password.pressSequentially('x'.repeat(26));
  await expect(password).toHaveValue('x'.repeat(25));
  await password.fill('x'.repeat(14));
  await confirmPassword.fill('x'.repeat(14));
  expect(await password.evaluate(input => (input as HTMLInputElement).validity.tooShort)).toBe(true);
  await signupDialog.getByRole('button', { name: /create account/i }).click();
  await expect(signupDialog).toBeVisible();
  await expect(page.getByRole('button', { name: /account menu/i })).toHaveCount(0);

  await password.fill(originalPassword);
  await confirmPassword.fill(originalPassword);
  await signupDialog.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('button', { name: /account menu/i })).toBeVisible();

  await page.getByRole('button', { name: /account menu/i }).click();
  await page.getByRole('button', { name: /my profile/i }).click();
  await expect(page.getByRole('heading', { name: /account settings/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /upload a document|my documents/i })).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /documents/i })).toHaveCount(0);

  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByText(/reset email sent\. check your inbox/i)).toBeVisible();

  await page.getByRole('button', { name: 'Change', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: /change password/i })).toBeVisible();
  await page.locator('input[name="currentPassword"]').fill(originalPassword);
  await page.locator('input[name="newPassword"]').fill(updatedPassword);
  await page.locator('input[name="confirmPassword"]').fill(updatedPassword);
  await page.getByRole('button', { name: /save password/i }).click();
  await expect(page.getByRole('heading', { name: /password updated/i })).toBeVisible();
  await page.getByRole('button', { name: /done/i }).click();

  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

  await page.getByRole('button', { name: /sign in/i }).click();
  const signInDialog = page.getByRole('dialog', { name: /sign in/i });
  await signInDialog.getByPlaceholder('Email').fill(email);
  await signInDialog.getByPlaceholder('Password').fill(originalPassword);
  await signInDialog.getByRole('button', { name: /^sign in$/i }).click();
  await expect(signInDialog.getByText(/invalid email or password/i)).toBeVisible();

  await signInDialog.getByPlaceholder('Password').fill(updatedPassword);
  await signInDialog.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page.getByRole('button', { name: /account menu/i })).toBeVisible();
  await expect(signInDialog).toHaveCount(0);
});

test('home shows current activity and supports voting and RSVP on desktop and mobile', async ({ page }, testInfo) => {
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await db.doc('events/upcoming').set({
      title: 'Neighborhood Creek Cleanup', date: '2099-09-20', time: '9:00 AM',
      location: 'Tillery Fields', description: 'Help restore the creek with your neighbors.',
    });
    const poll = {
      question: 'Where should we plant native trees?', status: 'published',
      description: [
        'We are planning several volunteer sessions at Tillery Fields and want to learn when neighbors can join us. Please share the times that work best for you so we can plan accessible, useful work days together.',
        'A typical session lasts about two hours. We will bring tools and supplies, and volunteers can help with cleanup, planting, or other projects at a pace that works for them. All experience levels are welcome.',
        'Once dates are selected, we will coordinate with local partners and post event details. Your answers will help us make sure there is enough equipment and support for everyone who wants to take part.',
        'If you have ideas for future work around the pond, trail, or native habitat, share them with the group. We hope to offer several chances to volunteer throughout the year.',
      ].join('\n\n'),
      options: [{ id: 'pond', label: 'By the pond', order: 0 }, { id: 'trail', label: 'Along the trail', order: 1 }],
      audience: 'anyone', resultVisibility: 'afterVote', resultAudience: 'public',
      privateVotes: true, allowVoteChange: false, showParticipation: true,
      opensAt: null, closesAt: null, tallies: { pond: 0, trail: 0 }, totalVotes: 0, createdAt: new Date(),
    };
    await db.doc('polls/home-poll').set(poll);
    await db.doc('polls/closed-poll').set({ ...poll, question: 'An old community question', status: 'closed' });
  });

  await page.setViewportSize({ width: 1871, height: 1000 });
  await page.goto('/');
  const events = page.getByRole('region', { name: 'Upcoming events' });
  const polls = page.getByRole('region', { name: 'Current polls' });
  const mission = page.getByRole('region', { name: 'Our Mission' });
  const join = page.getByRole('region', { name: 'Join the effort' });
  const goals = page.getByRole('region', { name: 'Our Goals' });
  const area = page.getByRole('region', { name: 'Service Area' });
  await expect(join.locator('form')).toHaveCount(2);
  await expect.poll(async () => {
    const [missionBox, eventsBox, pollsBox, goalsBox, areaBox, joinBox] = await Promise.all(
      [mission, events, polls, goals, area, join].map(locator => locator.boundingBox()),
    );
    if (!missionBox || !eventsBox || !pollsBox || !goalsBox || !areaBox || !joinBox) return false;
    return eventsBox.x > missionBox.x
      && pollsBox.x === eventsBox.x
      && pollsBox.y > eventsBox.y
      && areaBox.x === missionBox.x
      && goalsBox.x > areaBox.x
      && joinBox.y > goalsBox.y
      && areaBox.y - (missionBox.y + missionBox.height) < 80;
  }).toBe(true);
  await expect(events.getByRole('heading', { name: 'Neighborhood Creek Cleanup' })).toBeVisible();
  await expect(events.getByText('Trail Cleanup', { exact: true })).toHaveCount(0);
  await expect(polls.getByRole('radio', { name: 'By the pond' })).toBeVisible();
  await expect(polls.getByText('An old community question')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('home-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => {
    const [eventsBox, pollsBox, areaBox] = await Promise.all([events, polls, area].map(locator => locator.boundingBox()));
    return Boolean(eventsBox && pollsBox && areaBox && eventsBox.y < pollsBox.y && pollsBox.y < areaBox.y);
  }).toBe(true);
  await polls.getByRole('radio', { name: 'By the pond' }).check();
  await polls.getByRole('button', { name: 'Submit vote' }).click();
  await expect(polls.getByText('You voted', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('home-mobile.png'), fullPage: true });

  await events.getByRole('button', { name: 'RSVP', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Sign In', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('sign-in failures stay friendly and recoverable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).click();
  const signInDialog = page.getByRole('dialog', { name: /sign in/i });
  await signInDialog.getByPlaceholder('Email').fill('missing@example.test');
  await signInDialog.getByPlaceholder('Password').fill('wrong-password');
  await signInDialog.getByRole('button', { name: /^sign in$/i }).click();

  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
});

for (const votingMode of ['multiple', 'ranked']) {
  test(`visitor submits and updates a ${votingMode} ballot on mobile`, async ({ page }, testInfo) => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`polls/${votingMode}-availability`).set({
        question: 'Which dates work for you?', votingMode, maxRankedChoices: votingMode === 'ranked' ? 2 : null,
        options: [
          { id: 'sat', label: 'Saturday morning', order: 0 },
          { id: 'sun', label: 'Sunday afternoon', order: 1 },
          { id: 'mon', label: 'Monday evening', order: 2 },
        ],
        status: 'published', audience: 'anyone', resultVisibility: 'afterVote', resultAudience: 'public',
        privateVotes: false, allowVoteChange: true, showParticipation: true,
        tallies: { sat: 0, sun: 0, mon: 0 }, totalVotes: 0, createdAt: new Date(),
      });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/polls/${votingMode}-availability`);
    await page.getByRole('checkbox', { name: 'Saturday morning', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Sunday afternoon', exact: true }).check();
    if (votingMode === 'ranked') {
      await expect(page.getByRole('checkbox', { name: 'Monday evening' })).toBeDisabled();
      await page.getByRole('button', { name: 'Move Sunday afternoon up' }).click();
    }
    await page.getByRole('button', { name: 'Submit vote' }).click();
    await expect(page.getByText('You voted', { exact: true })).toBeVisible();
    await expect(page.getByText('1 response', { exact: true })).toBeVisible();
    const results = page.getByRole('region', { name: 'Poll results' });
    await expect(results).toBeVisible();
    if (votingMode === 'ranked') await expect(results.getByRole('meter', { name: 'Sunday afternoon: 2 points' })).toHaveAttribute('aria-valuenow', '2');
    else await expect(results.getByText('1 (100%)', { exact: true })).toHaveCount(2);
    await page.getByRole('button', { name: 'Show public responses' }).click();
    await expect(page.getByRole('list', { name: 'Public poll responses' })).toContainText(votingMode === 'ranked'
      ? '1. Sunday afternoon → 2. Saturday morning' : 'Saturday morning, Sunday afternoon');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`${votingMode}-mobile.png`), fullPage: true });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Sunday afternoon' })).toBeChecked();
    if (votingMode === 'ranked') await expect(page.getByRole('list', { name: 'Your ranked choices' }).getByRole('listitem').first()).toContainText('Sunday afternoon');
    await page.getByRole('checkbox', { name: 'Saturday morning' }).uncheck();
    await page.getByRole('button', { name: 'Update my vote' }).click();
    await expect(page.getByText('Your vote was updated.', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('1 response', { exact: true })).toBeVisible();
    await expect(results.getByRole('meter', { name: `Saturday morning: 0 ${votingMode === 'ranked' ? 'points' : 'responses'}` })).toHaveAttribute('aria-valuenow', '0');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`${votingMode}-desktop.png`), fullPage: true });
  });
}
