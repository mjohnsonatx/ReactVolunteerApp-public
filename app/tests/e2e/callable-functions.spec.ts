import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { randomUUID } from 'node:crypto';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { forumAuthorKey } from '@watershed/shared';
import { fileURLToPath } from 'node:url';
import {
  deleteApp,
  initializeApp as initializeClientApp,
  type FirebaseApp,
} from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth as getClientAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  connectStorageEmulator,
  getStorage as getClientStorage,
  ref as storageRef,
  uploadBytes as uploadStorageBytes,
  type FirebaseStorage,
} from 'firebase/storage';

const projectId = 'demo-watershed';
const region = 'us-central1';
const emulatorHost = '127.0.0.1';

function emulatorPort(name: string, fallback: number): number {
  const port = Number(process.env[name]);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : fallback;
}

const appPort = emulatorPort('E2E_APP_PORT', 5173);
const authPort = emulatorPort('E2E_AUTH_PORT', 9099);
const firestorePort = emulatorPort('E2E_FIRESTORE_PORT', 8080);
const storagePort = emulatorPort('E2E_STORAGE_PORT', 9199);
const functionsPort = emulatorPort('E2E_FUNCTIONS_PORT', 5001);
const appOrigin = `http://${emulatorHost}:${appPort}`;
const authEmulatorUrl = `http://${emulatorHost}:${authPort}`;
const callableBaseUrl = `http://${emulatorHost}:${functionsPort}/${projectId}/${region}`;
const firestoreClearUrl = `http://${emulatorHost}:${firestorePort}/emulator/v1/projects/${projectId}/databases/(default)/documents`;
const authClearUrl = `${authEmulatorUrl}/emulator/v1/projects/${projectId}/accounts`;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

process.env.FIRESTORE_EMULATOR_HOST = `${emulatorHost}:${firestorePort}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `${emulatorHost}:${authPort}`;
process.env.FIREBASE_STORAGE_EMULATOR_HOST = `${emulatorHost}:${storagePort}`;
process.env.GCLOUD_PROJECT = projectId;
process.env.GOOGLE_CLOUD_PROJECT = projectId;

const clientConfig = {
  apiKey: 'demo-api-key',
  authDomain: `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: `${projectId}.appspot.com`,
  appId: '1:000000000000:web:0000000000000000000000',
};

type CallablePayload<T> = {
  result?: T;
  error?: {
    status?: string;
    message?: string;
  };
};

type TestUser = {
  uid: string;
  email: string;
  password: string;
  token: string;
  storage: FirebaseStorage;
};

let testEnv: any;
const clientApps: FirebaseApp[] = [];

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID()}@example.test`;
}

function createClientAuth() {
  const app = initializeClientApp(clientConfig, `callable-e2e-${randomUUID()}`);
  clientApps.push(app);
  const auth = getClientAuth(app);
  connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
  return auth;
}

async function parseCallableResponse<T>(response: APIResponse): Promise<CallablePayload<T>> {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function callFunction<T>(
  request: APIRequestContext,
  name: string,
  data: Record<string, unknown> = {},
  token?: string,
): Promise<T> {
  const response = await request.post(`${callableBaseUrl}/${name}`, {
    data: { data },
    headers: {
      Origin: appOrigin,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const payload = await parseCallableResponse<T>(response);
  if (!response.ok() || payload.error) {
    throw new Error(payload.error?.message || `${name} failed with ${response.status()}`);
  }
  return payload.result as T;
}

async function expectCallableError(
  request: APIRequestContext,
  name: string,
  data: Record<string, unknown>,
  token: string | undefined,
  message: RegExp,
): Promise<void> {
  const response = await request.post(`${callableBaseUrl}/${name}`, {
    data: { data },
    headers: {
      Origin: appOrigin,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const payload = await parseCallableResponse<unknown>(response);
  expect(payload.error?.message || '').toMatch(message);
}

async function withAdminDb<T>(fn: (firestore: any) => Promise<T>): Promise<T> {
  let result!: T;
  await testEnv.withSecurityRulesDisabled(async (context: any) => {
    result = await fn(context.firestore());
  });
  return result;
}

async function withAdminStorage<T>(fn: (bucket: any) => Promise<T>): Promise<T> {
  const app = initializeAdminApp({ projectId, storageBucket: clientConfig.storageBucket }, `storage-test-${randomUUID()}`);
  try { return await fn(getAdminStorage(app).bucket()); }
  finally { await deleteAdminApp(app); }
}

async function setDoc(docPath: string, data: Record<string, unknown>): Promise<void> {
  await withAdminDb(async (firestore) => {
    await firestore.doc(docPath).set(data);
  });
}

async function addDoc(collectionPath: string, data: Record<string, unknown>): Promise<string> {
  return withAdminDb(async (firestore) => {
    const ref = await firestore.collection(collectionPath).add(data);
    return ref.id;
  });
}

async function getDocData(docPath: string): Promise<Record<string, any> | undefined> {
  return withAdminDb(async (firestore) => {
    const snap = await firestore.doc(docPath).get();
    return snap.exists ? snap.data() : undefined;
  });
}

async function expectDocExists(docPath: string, exists: boolean): Promise<void> {
  await withAdminDb(async (firestore) => {
    const snap = await firestore.doc(docPath).get();
    expect(snap.exists).toBe(exists);
  });
}

async function collectionData(collectionPath: string): Promise<Array<Record<string, any>>> {
  return withAdminDb(async (firestore) => {
    const snap = await firestore.collection(collectionPath).get();
    return snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  });
}

async function setCustomClaims(uid: string, claims: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${authEmulatorUrl}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer owner',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      localId: uid,
      customAttributes: JSON.stringify(claims),
    }),
  });
  if (!response.ok) {
    throw new Error(`Could not set custom claims: ${await response.text()}`);
  }
}

async function setEmailVerified(uid: string): Promise<void> {
  const response = await fetch(`${authEmulatorUrl}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid, emailVerified: true }),
  });
  if (!response.ok) throw new Error(`Could not verify test email: ${await response.text()}`);
}

async function createSignedInUser(options: {
  email?: string;
  password?: string;
  name?: string;
  userName?: string;
  admin?: boolean;
  adminMfa?: boolean;
  unverified?: boolean;
} = {}): Promise<TestUser> {
  const password = options.password ?? 'secret123';
  const email = options.email ?? uniqueEmail(options.admin ? 'admin' : 'user');
  const auth = createClientAuth();
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;
  if (!options.unverified) await setEmailVerified(uid);
  const userName = options.userName ?? (options.admin ? 'admin-tester' : 'user-tester');

  await setDoc(`users/${uid}`, {
    name: options.name ?? (options.admin ? 'Admin Tester' : 'User Tester'),
    userName,
    email,
    role: options.admin ? 'admin' : 'user',
    votes: {},
    moderated: false,
    joinDate: new Date(),
  });
  await setDoc(`userNames/${userName}`, {
    uid,
    userName,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (options.admin) {
    await setCustomClaims(uid, {
      admin: true,
      ...(options.adminMfa === false ? {} : { desktop_admin_mfa: true }),
    });
    await signOut(auth);
    await signInWithEmailAndPassword(auth, email, password);
  }

  const token = await auth.currentUser!.getIdToken(true);
  const storage = getClientStorage(auth.app);
  connectStorageEmulator(storage, emulatorHost, storagePort);
  return { uid, email, password, token, storage };
}

async function uploadDocumentForUser(
  request: APIRequestContext,
  user: TestUser,
  options: {
    title: string;
    visibility?: 'public' | 'private';
    notes?: string;
    publish?: boolean;
    admin?: boolean;
  },
): Promise<{ id: string; ticketId: string }> {
  const bytes = new Uint8Array([37, 80, 68, 70]);
  const ticket = await callFunction<{ ticketId: string; storagePath: string }>(
    request,
    'createDocumentUploadTicket',
    { name: `${options.title}.pdf`, contentType: 'application/pdf', sizeBytes: bytes.length, wantsThumbnail: false },
    user.token,
  );
  await uploadStorageBytes(storageRef(user.storage, ticket.storagePath), bytes, {
    contentType: 'application/pdf',
    customMetadata: { published: 'false', ticketId: ticket.ticketId, role: 'document' },
  });
  const result = await callFunction<{ id: string }>(
    request,
    options.admin ? 'createAdminDocumentRecord' : 'createDocumentRecord',
    {
      ticketId: ticket.ticketId,
      title: options.title,
      notes: options.notes || '',
      visibility: options.visibility || 'private',
      publish: options.publish === true,
      // These forged legacy fields must be ignored by the server.
      storageUrl: 'https://attacker.example/forged',
      storagePath: 'documents/another-user/forged.pdf',
      contentType: 'text/html',
      size: '999 GB',
    },
    user.token,
  );
  return { id: result.id, ticketId: ticket.ticketId };
}

async function tokenFor(email: string, password: string): Promise<string> {
  const auth = createClientAuth();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user.getIdToken(true);
}

async function clearEmulators(request: APIRequestContext): Promise<void> {
  const firestoreResponse = await request.delete(firestoreClearUrl);
  expect(firestoreResponse.ok()).toBe(true);
  const authResponse = await request.delete(authClearUrl);
  expect(authResponse.ok()).toBe(true);
}

function sampleGeojson(): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-97.712, 30.244] },
      properties: { stroke: '#ff0000', text: 'Trail marker', unsafe: '<script>x</script>' },
    }],
  });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
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
});

test.beforeEach(async ({ request }) => {
  await clearEmulators(request);
});

test.afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app).catch(() => undefined)));
});

test('desktop browser handoff rejects members and signs only an authenticated administrator', async ({ request }) => {
  const user = await createSignedInUser();
  const denied = await request.post(`${callableBaseUrl}/issueDesktopSignInToken`, {
    headers: { Authorization: `Bearer ${user.token}` }, data: { data: null },
  });
  expect(denied.status()).toBe(403);
  const passwordOnlyAdmin = await createSignedInUser({ admin: true, adminMfa: false });
  const passwordOnlyDenied = await request.post(`${callableBaseUrl}/issueDesktopSignInToken`, {
    headers: { Authorization: `Bearer ${passwordOnlyAdmin.token}` }, data: { data: null },
  });
  expect(passwordOnlyDenied.status()).toBe(403);
  const adminCallableDenied = await request.post(`${callableBaseUrl}/deleteVolunteer`, {
    headers: { Authorization: `Bearer ${passwordOnlyAdmin.token}` }, data: { data: { id: 'not-used' } },
  });
  expect(adminCallableDenied.status()).toBe(403);
  const admin = await createSignedInUser({ admin: true });
  const { customToken } = await callFunction<{ customToken: string }>(request, 'issueDesktopSignInToken', null, admin.token);
  const signedIn = await request.post(`${authEmulatorUrl}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key`, {
    data: { token: customToken, returnSecureToken: true },
  });
  expect(signedIn.ok()).toBe(true);
  const result = await signedIn.json();
  const claims = JSON.parse(Buffer.from(result.idToken.split('.')[1], 'base64url').toString('utf8'));
  expect(claims.sub).toBe(admin.uid);
  expect(claims.admin).toBe(true);
  expect(claims.desktop_admin_mfa).toBe(true);
});

test('public signup, mailing list, and client-error callables write server-owned records', async ({ request }) => {
  await callFunction(request, 'submitVolunteerSignup', {
    name: ' Public Volunteer ',
    email: 'PUBLIC@example.TEST',
    phone: '(555) 123-4567',
  });

  const volunteers = await collectionData('volunteers');
  expect(volunteers).toHaveLength(1);
  expect(volunteers[0]).toMatchObject({
    name: 'Public Volunteer',
    email: 'public@example.test',
    phone: '(555) 123-4567',
  });

  await callFunction(request, 'subscribeMailingList', { email: 'NEWS@example.TEST' });
  await callFunction(request, 'subscribeMailingList', { email: 'news@example.test' });
  expect(await collectionData('mailingList')).toMatchObject([{ email: 'news@example.test' }]);

  await callFunction(request, 'logClientError', {
    context: 'e2e-client-error<script>',
    message: 'Something broke at https://example.test/file?token=secret',
    stack: 'stack line access_token=secret',
    url: `${appOrigin}/documents?token=secret#preview`,
    userAgent: 'Playwright',
    extra: { feature: 'crash', email: 'private@example.test', docId: 'secret-doc' },
  });
  const logs = await collectionData('errorLogs');
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({
    type: 'error',
    context: 'e2e-client-error',
    message: 'Something broke at https://example.test/file',
    stack: 'stack line access_token=[redacted]',
    url: `${appOrigin}/documents`,
    uid: null,
    actorUid: null,
    surface: 'web',
    tags: ['error', 'e2e-client-error', 'web'],
    extra: { feature: 'crash' },
  });
});

test('email usernames are assigned server-side and stay unique across domains and concurrent signups', async ({ request }) => {
  const base = `river.${Date.now()}`;
  const credentials = await Promise.all(['one', 'two', 'three', 'four'].map(domain =>
    createUserWithEmailAndPassword(createClientAuth(), `${base}@${domain}.test`, 'secret123456789')));
  const tokens = await Promise.all(credentials.map(credential => credential.user.getIdToken()));
  const first = await callFunction<{ uid: string; userName: string }>(request, 'initializeAccountProfile', {
    email: 'spoofed@evil.test', name: 'Spoofed', role: 'admin',
  }, tokens[0]);
  expect(first).toMatchObject({ uid: credentials[0].user.uid, userName: base });
  expect(await getDocData(`users/${first.uid}`)).toMatchObject({ name: base, userName: base, email: `${base}@one.test`, role: 'user' });
  await credentials[0].user.reload();
  expect(credentials[0].user.displayName).toBe(base);
  const second = await callFunction<{ userName: string }>(request, 'initializeAccountProfile', {}, tokens[1]);
  expect(second.userName).toBe(`${base}-2`);
  const concurrent = await Promise.all(tokens.slice(2).map(token =>
    callFunction<{ uid: string; userName: string }>(request, 'initializeAccountProfile', {}, token)));
  expect(concurrent.map(profile => profile.userName).sort()).toEqual([`${base}-3`, `${base}-4`]);
  for (const profile of [first, ...concurrent]) {
    expect(await getDocData(`userNames/${profile.userName}`)).toMatchObject({ uid: profile.uid });
  }
  const retry = await callFunction<{ userName: string }>(request, 'initializeAccountProfile', {}, tokens[1]);
  expect(retry.userName).toBe(second.userName);
  expect(await collectionData('userNames')).toHaveLength(4);
  await callFunction(request, 'updateAccountProfile', { userName: 'chosen-later' }, tokens[0]);
  expect(await callFunction(request, 'initializeAccountProfile', {}, tokens[0])).toMatchObject({ userName: 'chosen-later' });
  expect(await getDocData(`users/${first.uid}`)).toMatchObject({ userName: 'chosen-later' });
});

test('automatic profile recovery preserves metadata, avoids legacy names, and handles crowded names', async ({ request }) => {
  const base = `legacy-${Date.now()}`;
  const credential = await createUserWithEmailAndPassword(createClientAuth(), `${base}@example.test`, 'secret123456789');
  const token = await credential.user.getIdToken();
  await setDoc('users/legacy-owner', { userName: base }); // No reservation: old profile.
  await setDoc(`users/${credential.user.uid}`, { name: 'Old', moderated: true, role: 'user', votes: { kept: 'up' }, accountStatus: 'active' });
  expect(await callFunction(request, 'initializeAccountProfile', {}, token)).toMatchObject({ userName: `${base}-2` });
  expect(await getDocData(`users/${credential.user.uid}`)).toMatchObject({
    name: `${base}-2`, userName: `${base}-2`, moderated: true, role: 'user', votes: { kept: 'up' }, accountStatus: 'active',
  });
  await setDoc(`users/${credential.user.uid}`, { accountStatus: 'deleting', moderated: true });
  await expectCallableError(request, 'initializeAccountProfile', {}, token, /being deleted/i);

  const crowded = 'x'.repeat(30);
  for (let index = 0; index < 10; index++) {
    const suffix = index === 0 ? '' : `-${index + 1}`;
    await setDoc(`userNames/${crowded.slice(0, 30 - suffix.length)}${suffix}`, { uid: `owner-${index}` });
  }
  const next = await createUserWithEmailAndPassword(createClientAuth(), `${crowded}@example.test`, 'secret123456789');
  const result = await callFunction<{ userName: string }>(request, 'initializeAccountProfile', {}, await next.user.getIdToken());
  expect(result.userName).toMatch(/^x{21}-[a-z0-9]{8}$/);
  expect(await getDocData(`userNames/${result.userName}`)).toMatchObject({ uid: next.user.uid });
});

test('account callables create, update, sync, and remove owned user data', async ({ request }) => {
  const email = uniqueEmail('created-account');
  const password = 'secret1234567';
  const clientAuth = createClientAuth();
  const credential = await createUserWithEmailAndPassword(clientAuth, email, password);
  const created = await callFunction<{ uid: string }>(request, 'initializeAccountProfile', {
    userName: 'Callable Account',
  }, await credential.user.getIdToken());
  await setEmailVerified(created.uid);

  await tokenFor(email, password);
  await expectDocExists(`users/${created.uid}`, true);
  await expectDocExists('userNames/callable-account', true);
  expect(await getDocData(`users/${created.uid}`)).toMatchObject({ name: 'callable-account', userName: 'callable-account' });
  await credential.user.reload();
  expect(credential.user.displayName).toBe('callable-account');

  const token = await tokenFor(email, password);
  const duplicateAuth = createClientAuth();
  const duplicateCredential = await createUserWithEmailAndPassword(duplicateAuth, uniqueEmail('duplicate-user-name'), password);
  await expectCallableError(request, 'initializeAccountProfile', {
    name: 'Duplicate Username',
    userName: 'Callable Account',
  }, await duplicateCredential.user.getIdToken(), /user name is already taken/i);
  await expectCallableError(request, 'createAccount', {
    name: 'Old Client', email: uniqueEmail('old-client'), password,
  }, undefined, /update the app/i);

  await createSignedInUser({ name: 'Taken Account', userName: 'taken-account' });
  await expectCallableError(request, 'updateAccountProfile', {
    name: 'Updated Account',
    userName: 'taken-account',
  }, token, /user name is already taken/i);

  await callFunction(request, 'updateAccountProfile', {
    userName: 'updated-account',
  }, token);
  await callFunction(request, 'syncUserEmail', { email }, token);
  await expectDocExists('userNames/callable-account', false);
  await expectDocExists('userNames/updated-account', true);
  expect(await getDocData(`users/${created.uid}`)).toMatchObject({ name: 'updated-account', userName: 'updated-account' });
  // Cached clients may still send a separate name. It cannot change the single
  // public identity or bypass the username reservation.
  await callFunction(request, 'updateAccountProfile', { name: 'Ignored Legacy Name', userName: 'updated-account' }, token);
  expect(await getDocData(`users/${created.uid}`)).toMatchObject({ name: 'updated-account', userName: 'updated-account' });

  await setDoc('forumPosts/owned-post', {
    author: 'Updated Account',
    authorId: created.uid,
    authorUserName: 'updated-account',
    title: 'Personal title',
    content: 'Personal post body',
    replies: [{
      id: 'reply-1',
      author: 'Updated Account',
      authorId: created.uid,
      authorUserName: 'updated-account',
      text: 'Please remove me.',
    }],
  });
  await setDoc('forumPendingReplies/owned-pending', {
    authorId: created.uid,
    reply: { author: 'Updated Account', authorId: created.uid, text: 'Personal pending reply' },
  });
  await setDoc('rsvps/owned-rsvp', { userId: created.uid, eventId: 'event-1' });
  await setDoc('documents/owned-doc', { userId: created.uid, storagePath: `documents/${created.uid}/file.pdf` });
  const storageAuth = createClientAuth();
  await signInWithEmailAndPassword(storageAuth, email, password);
  const ownedStorage = getClientStorage(storageAuth.app);
  connectStorageEmulator(ownedStorage, emulatorHost, storagePort);
  const orphanTicket = await callFunction<{ storagePath: string; ticketId: string }>(request, 'createDocumentUploadTicket', {
    name: 'orphan.pdf', contentType: 'application/pdf', sizeBytes: 4, wantsThumbnail: false,
  }, token);
  const orphanPath = orphanTicket.storagePath;
  await uploadStorageBytes(storageRef(ownedStorage, orphanPath), new Uint8Array([37, 80, 68, 70]), {
    contentType: 'application/pdf',
    customMetadata: { published: 'false', ticketId: orphanTicket.ticketId, role: 'document' },
  });
  await setDoc('mailingList/owned-mail', { email });
  await setDoc('volunteers/owned-volunteer', { email, name: 'Updated Account' });
  await setDoc('profileMessages/owned-message', { userId: created.uid, userEmail: email, message: 'Personal support text' });
  await setDoc('pollVotes/owned-vote', { userId: created.uid, voterKey: `u:${created.uid}`, optionId: 'choice' });
  await setDoc('errorLogs/owned-error', { uid: created.uid, message: 'Personal error context' });
  await setDoc(`rateLimits/forumPost:${created.uid}`, { count: 1 });
  await setDoc('eventComments/owned-comment', { authorId: created.uid, authorName: 'Updated Account', body: 'Personal comment' });
  await setDoc('eventCommentReports/owned-report', { reporterId: created.uid, targetAuthorId: 'other-user', reporterEmail: email });
  await setDoc('eventCommentReports/target-report', { reporterId: 'other-user', targetAuthorId: created.uid, excerpt: 'Personal comment' });
  await setDoc('overlayUploads/owned-upload', { uploadedBy: created.uid, uploadedByEmail: email });
  await setDoc('forumReports/reporter-owned', {
    reporterId: created.uid,
    targetAuthorId: 'other-user',
    reporterName: 'Updated Account',
  });
  await setDoc('forumReports/target-owned', {
    reporterId: 'other-user',
    targetAuthorId: created.uid,
    targetAuthorName: 'Updated Account',
    targetAuthorUserName: 'updated-account',
  });

  await callFunction(request, 'deleteOwnAccountData', {}, token);

  await expect(tokenFor(email, password)).rejects.toThrow();
  await expectDocExists(`users/${created.uid}`, false);
  await expectDocExists('userNames/updated-account', false);
  await expectDocExists('rsvps/owned-rsvp', false);
  await expectDocExists('documents/owned-doc', false);
  await withAdminStorage(async bucket => {
    const [exists] = await bucket.file(orphanPath).exists();
    expect(exists).toBe(false);
  });
  await expectDocExists('mailingList/owned-mail', false);
  await expectDocExists('volunteers/owned-volunteer', false);
  await expectDocExists('profileMessages/owned-message', false);
  await expectDocExists('pollVotes/owned-vote', false);
  await expectDocExists('errorLogs/owned-error', false);
  await expectDocExists(`rateLimits/forumPost:${created.uid}`, false);
  await expectDocExists('eventComments/owned-comment', false);
  await expectDocExists('eventCommentReports/owned-report', false);
  await expectDocExists('eventCommentReports/target-report', false);
  await expectDocExists('overlayUploads/owned-upload', false);
  await expectDocExists('forumReports/reporter-owned', false);

  const post = await getDocData('forumPosts/owned-post');
  expect(post?.authorId).toBe('deleted');
  expect(post?.content).toBe('[Removed after account deletion]');
  expect(post?.replies[0].text).toBe('[Removed after account deletion]');
  expect(post?.replies[0].authorId).toBe('deleted');
  expect(await getDocData('forumPendingReplies/owned-pending')).toMatchObject({
    authorId: 'deleted', reply: { text: '[Removed after account deletion]' },
  });
  expect(await getDocData('forumReports/target-owned')).toMatchObject({
    targetAuthorId: 'deleted',
    targetAuthorName: '[Deleted User]',
    targetAuthorUserName: 'deleted-user',
  });
});

test('unverified members cannot publish, vote, RSVP, report, or upload', async ({ request }) => {
  const user = await createSignedInUser({ unverified: true, name: 'Unverified User', userName: 'unverified-user' });
  await setDoc('polls/verification-poll', {
    question: 'Which day?', status: 'published', audience: 'members',
    options: [{ id: 'saturday', label: 'Saturday' }], tallies: { saturday: 0 }, totalVotes: 0,
  });

  const gated: Array<[string, Record<string, unknown>]> = [
    ['submitForumPost', { title: 'Unverified', content: 'Should be blocked.' }],
    ['submitReply', { postId: 'any', text: 'Should be blocked.' }],
    ['castVote', { postId: 'any', type: 'up' }],
    ['flagContent', { postId: 'any', reason: 'spam', details: 'Should be blocked.' }],
    ['submitEventComment', { eventId: 'any', body: 'Should be blocked.' }],
    ['editEventComment', { commentId: 'any', body: 'Should be blocked.' }],
    ['reportEventComment', { commentId: 'any', reason: 'spam', details: 'Should be blocked.' }],
    ['castPollVote', { pollId: 'verification-poll', optionId: 'saturday' }],
    ['submitRsvp', { eventId: 'any', name: 'Unverified', email: user.email }],
    ['createDocumentUploadTicket', { name: 'blocked.pdf', contentType: 'application/pdf', sizeBytes: 4 }],
    ['createDocumentRecord', { ticketId: 'none', title: 'Blocked' }],
  ];
  for (const [name, data] of gated) {
    await expectCallableError(request, name, data, user.token, /verify your email address/i);
  }
  expect(await collectionData('pollVotes')).toHaveLength(0);
  expect(await collectionData('forumPosts')).toHaveLength(0);
  expect(await collectionData('eventComments')).toHaveLength(0);
});

test('profile message callable requires auth and stores contact submissions', async ({ request }) => {
  await expectCallableError(request, 'submitProfileMessage', {
    topic: 'general',
    message: 'Hello',
  }, undefined, /signed in/i);

  const user = await createSignedInUser({ name: 'Message User', userName: 'message-user' });
  await callFunction(request, 'submitProfileMessage', {
    topic: 'technical',
    message: ' The map button is stuck. ',
  }, user.token);

  const messages = await collectionData('profileMessages');
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    userId: user.uid,
    userName: 'message-user',
    userEmail: user.email,
    topic: 'technical',
    topicLabel: 'Technical issue',
    message: 'The map button is stuck.',
    status: 'new',
  });
});

test('RSVP and forum callables enforce auth and mutate event/forum state', async ({ request }) => {
  await expectCallableError(request, 'submitRsvp', {
    eventId: 'event-1',
    name: 'No Auth',
    email: 'no-auth@example.test',
  }, undefined, /signed in/i);

  const user = await createSignedInUser({ name: 'Forum User', userName: 'forum-user' });
  await setDoc('events/event-1', {
    title: 'Trail Cleanup',
    date: '2026-07-01',
    time: '9:00 AM',
    location: 'Creek Park',
    description: 'Bring water.',
  });

  const rsvp = await callFunction<{ id: string }>(request, 'submitRsvp', {
    eventId: 'event-1',
    name: 'Forum User',
    email: user.email,
    comments: 'See you there.',
  }, user.token);
  await expectDocExists(`rsvps/${rsvp.id}`, true);
  await expectCallableError(request, 'submitRsvp', {
    eventId: 'event-1',
    name: 'Forum User',
    email: user.email,
  }, user.token, /already RSVPed/i);
  await callFunction(request, 'cancelRsvp', { rsvpId: rsvp.id }, user.token);
  await expectDocExists(`rsvps/${rsvp.id}`, false);

  const post = await callFunction<{ id: string; status: string }>(request, 'submitForumPost', {
    title: 'Cleanup plan',
    content: 'Meet near the bridge.',
  }, user.token);
  expect(post.status).toBe('approved');
  expect(await getDocData(`forumPosts/${post.id}`)).toMatchObject({ author: 'forum-user', authorUserName: 'forum-user' });

  const replyResult = await callFunction<{ reply: { id: string } }>(request, 'submitReply', {
    postId: post.id,
    text: 'I can bring bags.',
  }, user.token);
  await callFunction(request, 'castVote', { postId: post.id, type: 'up' }, user.token);
  await callFunction(request, 'castVote', { postId: post.id, replyId: replyResult.reply.id, type: 'down' }, user.token);
  await expectCallableError(request, 'flagContent', {
    postId: post.id,
    reason: 'spam',
    details: 'Trying to report my own post.',
  }, user.token, /own post/i);

  const reporter = await createSignedInUser({ name: 'Forum Reporter', userName: 'forum-reporter' });
  await callFunction(request, 'flagContent', {
    postId: post.id,
    reason: 'privacy',
    details: 'This includes private information.',
  }, reporter.token);
  await expectCallableError(request, 'flagContent', {
    postId: post.id,
    reason: 'privacy',
    details: 'Trying to report the same post twice.',
  }, reporter.token, /already reported/i);
  await callFunction(request, 'flagContent', {
    postId: post.id,
    replyId: replyResult.reply.id,
    reason: 'harassment',
    details: 'This reply is abusive.',
  }, reporter.token);

  const savedPost = await getDocData(`forumPosts/${post.id}`);
  expect(savedPost).toMatchObject({ flagged: true, upvotes: 1, downvotes: 0 });
  expect(savedPost?.replies[0]).toMatchObject({ flagged: true, downvotes: 1 });
  const reports = await collectionData('forumReports');
  expect(reports).toHaveLength(2);
  expect(reports).toEqual(expect.arrayContaining([
    expect.objectContaining({
      postId: post.id,
      replyId: '',
      targetType: 'post',
      reporterId: reporter.uid,
      reason: 'privacy',
      details: 'This includes private information.',
    }),
    expect.objectContaining({
      postId: post.id,
      replyId: replyResult.reply.id,
      targetType: 'reply',
      reporterId: reporter.uid,
      reason: 'harassment',
      details: 'This reply is abusive.',
    }),
  ]));
  expect(await getDocData(`users/${reporter.uid}`)).toMatchObject({
    reportedContent: {
      [`${post.id}_post`]: true,
      [`${post.id}_${replyResult.reply.id}`]: true,
    },
  });
});

test('moderation is opt-in and consistently holds posts, replies, and event comments for approval', async ({ request }) => {
  const admin = await createSignedInUser({ admin: true, name: 'Moderation Admin', userName: 'moderation-admin' });
  const user = await createSignedInUser({ name: 'Moderated User', userName: 'moderated-user' });
  await setDoc('forumPosts/reply-target', {
    author: 'Another User',
    authorId: 'another-user',
    title: 'Approved thread',
    content: 'Discussion',
    status: 'approved',
    replies: [],
  });
  await setDoc('events/moderation-event', { title: 'Moderation Event' });

  const ordinaryPost = await callFunction<{ id: string; status: string }>(request, 'submitForumPost', {
    title: 'Before moderation', content: 'This should appear normally.',
  }, user.token);
  expect(ordinaryPost.status).toBe('approved');

  await callFunction(request, 'toggleUserModeration', { uid: user.uid, moderated: true }, admin.token);
  const heldPost = await callFunction<{ id: string; status: string }>(request, 'submitForumPost', {
    title: 'Held post', content: 'Please review this post.',
  }, user.token);
  expect(heldPost.status).toBe('pending');

  const heldReply = await callFunction<{ reply: { id: string }; status: string }>(request, 'submitReply', {
    postId: 'reply-target', text: 'Please review this reply.',
  }, user.token);
  expect(heldReply.status).toBe('pending');
  expect((await getDocData('forumPosts/reply-target'))?.replies).toEqual([]);
  expect(await getDocData(`forumPendingReplies/${heldReply.reply.id}`)).toMatchObject({
    postId: 'reply-target', authorId: user.uid, status: 'pending',
  });

  const heldComment = await callFunction<{ status: string }>(request, 'submitEventComment', {
    eventId: 'moderation-event', body: 'Please review this comment.',
  }, user.token);
  expect(heldComment.status).toBe('pending');

  await callFunction(request, 'approvePendingForumReply', { replyId: heldReply.reply.id }, admin.token);
  expect((await getDocData('forumPosts/reply-target'))?.replies).toEqual([
    expect.objectContaining({ id: heldReply.reply.id, text: 'Please review this reply.', status: 'approved' }),
  ]);
  await expectDocExists(`forumPendingReplies/${heldReply.reply.id}`, false);

  await callFunction(request, 'toggleUserModeration', { uid: user.uid, moderated: false }, admin.token);
  expect(await getDocData(`users/${user.uid}`)).toMatchObject({ moderated: false });
});

test('content callables fail closed when an authenticated account profile is missing', async ({ request }) => {
  const user = await createSignedInUser({ name: 'Orphan Auth', userName: 'orphan-auth' });
  await setDoc('forumPosts/orphan-target', { title: 'Target', content: 'Body', status: 'approved', replies: [] });
  await setDoc('events/orphan-event', { title: 'Orphan Event' });
  await withAdminDb(async firestore => firestore.doc(`users/${user.uid}`).delete());

  await expectCallableError(request, 'submitForumPost', {
    title: 'Should fail', content: 'No active profile.',
  }, user.token, /profile is unavailable/i);
  await expectCallableError(request, 'submitReply', {
    postId: 'orphan-target', text: 'Should fail.',
  }, user.token, /profile is unavailable/i);
  await expectCallableError(request, 'submitEventComment', {
    eventId: 'orphan-event', body: 'Should fail.',
  }, user.token, /profile is unavailable/i);
  expect(await collectionData('forumPendingReplies')).toEqual([]);
});

test('anonymous forum handles are stable per thread, distinct, private, and server assigned', async ({ request }) => {
  const a = await createSignedInUser({ userName: 'private-alpha' });
  const b = await createSignedInUser({ userName: 'private-bravo' });
  const c = await createSignedInUser({ userName: 'private-charlie' });
  const post = await callFunction<any>(request, 'submitForumPost', {
    title: 'Anonymous thread', content: 'A question', anonymous: true,
    authorId: b.uid, authorUserName: 'forged', anonymousLabel: 'Anonymous 99',
  }, a.token);
  expect(await getDocData(`forumPosts/${post.id}`)).toMatchObject({ anonymousLabel: 'Anonymous 1' });
  expect(await getDocData(`forumAuthors/${forumAuthorKey(post.id)}`)).toMatchObject({ authorId: a.uid, authorUserName: 'private-alpha' });
  const reply = (user: TestUser, text: string, postId = post.id) => callFunction<any>(request, 'submitReply', {
    postId, text, anonymous: true, authorId: 'forged', anonymousLabel: 'Anonymous 99',
  }, user.token);
  expect((await reply(a, 'Following up')).reply.anonymousLabel).toBe('Anonymous 1');
  const [b1, b2, c1] = await Promise.all([reply(b, 'First thought'), reply(b, 'Second thought'), reply(c, 'Another view')]);
  expect(b1.reply.anonymousLabel).toBe(b2.reply.anonymousLabel);
  expect(new Set(['Anonymous 1', b1.reply.anonymousLabel, c1.reply.anonymousLabel]).size).toBe(3);
  await callFunction(request, 'updateAccountProfile', { userName: 'renamed-bravo' }, b.token);
  expect((await reply(b, 'Still me')).reply.anonymousLabel).toBe(b1.reply.anonymousLabel);

  const second = await callFunction<any>(request, 'submitForumPost', { title: 'Another thread', content: 'New topic', anonymous: true }, b.token);
  expect((await reply(b, 'Same new thread', second.id)).reply.anonymousLabel).toBe('Anonymous 1');
  expect((await reply(a, 'Joining here', second.id)).reply.anonymousLabel).toBe('Anonymous 2');

  const guest = testEnv.unauthenticatedContext().firestore();
  const publicData = (await guest.doc(`forumPosts/${post.id}`).get()).data();
  for (const content of [publicData, ...publicData.replies]) {
    expect(content).not.toHaveProperty('authorId');
    expect(content).not.toHaveProperty('authorUserName');
  }
  for (const privateValue of [a.uid, b.uid, c.uid, a.email, 'private-alpha', 'private-bravo', 'renamed-bravo']) {
    expect(JSON.stringify(publicData)).not.toContain(privateValue);
  }
  await expect(guest.doc(`forumAnonymousThreads/${post.id}`).get()).rejects.toThrow();
  await expect(testEnv.authenticatedContext(a.uid).firestore().collection('forumAuthors').get()).rejects.toThrow();
  const report = { postId: post.id, reason: 'other', details: 'Please review this content.' };
  await expectCallableError(request, 'flagContent', report, a.token, /own post/i);
  await expectCallableError(request, 'flagContent', { ...report, replyId: b1.reply.id }, b.token, /own reply/i);
  await callFunction(request, 'flagContent', report, c.token);
  await callFunction(request, 'flagContent', { ...report, replyId: b1.reply.id }, a.token);
  expect((await collectionData('forumReports')).map(r => r.targetAuthorId).sort()).toEqual([a.uid, b.uid].sort());
  await callFunction(request, 'castVote', { postId: post.id, replyId: b1.reply.id, type: 'up' }, a.token);
  expect((await guest.doc(`forumPosts/${post.id}`).get()).data().replies.find((r: any) => r.id === b1.reply.id)).not.toHaveProperty('authorId');
  await expectCallableError(request, 'submitForumPost', { title: 'Invalid', content: 'Choice', anonymous: 'yes' }, a.token, /true or false/i);
  await expectCallableError(request, 'submitReply', { postId: post.id, text: 'Choice', anonymous: 1 }, a.token, /true or false/i);
});

test('anonymous moderation, deletion and account cleanup retain privacy and never recycle handles', async ({ request }) => {
  const admin = await createSignedInUser({ admin: true });
  const user = await createSignedInUser({ userName: 'held-anon' });
  const other = await createSignedInUser({ userName: 'next-anon' });
  await callFunction(request, 'toggleUserModeration', { uid: user.uid, moderated: true }, admin.token);
  const post = await callFunction<any>(request, 'submitForumPost', { title: 'Held thread', content: 'Review this', anonymous: true }, user.token);
  expect(post.status).toBe('pending');
  await callFunction(request, 'approveForumPost', { id: post.id }, admin.token);
  const held = await callFunction<any>(request, 'submitReply', { postId: post.id, text: 'Held answer', anonymous: true }, user.token);
  expect(held.reply).toMatchObject({ anonymousLabel: 'Anonymous 1', status: 'pending' });
  expect(held.reply).not.toHaveProperty('authorId');
  const adminDb = testEnv.authenticatedContext(admin.uid, { admin: true, email_verified: true, desktop_admin_mfa: true }).firestore();
  expect((await adminDb.doc(`forumAuthors/${forumAuthorKey(post.id, held.reply.id)}`).get()).data().authorId).toBe(user.uid);
  await callFunction(request, 'approvePendingForumReply', { replyId: held.reply.id }, admin.token);
  const publicPost = (await testEnv.unauthenticatedContext().firestore().doc(`forumPosts/${post.id}`).get()).data();
  expect(publicPost.replies[0]).toMatchObject({ anonymousLabel: 'Anonymous 1' });
  expect(publicPost.replies[0]).not.toHaveProperty('authorId');
  await callFunction(request, 'deleteForumReply', { postId: post.id, replyId: held.reply.id }, admin.token);
  await expectDocExists(`forumAuthors/${forumAuthorKey(post.id, held.reply.id)}`, false);
  const rejected = await callFunction<any>(request, 'submitReply', { postId: post.id, text: 'Rejected answer', anonymous: true }, user.token);
  expect(rejected.reply.anonymousLabel).toBe('Anonymous 1');
  await callFunction(request, 'deletePendingForumReply', { replyId: rejected.reply.id }, admin.token);
  await expectDocExists(`forumAuthors/${forumAuthorKey(post.id, rejected.reply.id)}`, false);
  await callFunction(request, 'submitReply', { postId: post.id, text: 'Pending at deletion', anonymous: true }, user.token);
  await callFunction(request, 'deleteOwnAccountData', {}, user.token);
  expect((await getDocData(`forumPosts/${post.id}`))?.content).toBe('[Removed after account deletion]');
  expect(await collectionData('forumAuthors')).toEqual([]);
  const mapping = await getDocData(`forumAnonymousThreads/${post.id}`);
  expect(mapping?.aliases).toEqual({});
  expect(mapping?.authorIds).toEqual([]);
  expect(mapping?.nextAlias).toBe(2);
  const next = await callFunction<any>(request, 'submitReply', { postId: post.id, text: 'New participant', anonymous: true }, other.token);
  expect(next.reply.anonymousLabel).toBe('Anonymous 2');
  await callFunction(request, 'deleteForumPost', { id: post.id }, admin.token);
  expect(await collectionData('forumAuthors')).toEqual([]);
  expect(await collectionData('forumAnonymousThreads')).toEqual([]);
  expect(await collectionData('forumPendingReplies')).toEqual([]);
});

test('explicit profile recovery preserves deletion and username safeguards', async ({ request }) => {
  const user = await createSignedInUser({ name: 'Recover Member', userName: 'recover-member' });
  await withAdminDb(async firestore => firestore.doc(`users/${user.uid}`).delete());
  await callFunction(request, 'initializeAccountProfile', { name: 'Recover Member', userName: 'recover-member' }, user.token);
  expect(await getDocData(`users/${user.uid}`)).toMatchObject({ name: 'recover-member', userName: 'recover-member', accountStatus: 'active', moderated: false });
  await setDoc(`users/${user.uid}`, { name: 'Recover Member', userName: 'recover-member', accountStatus: 'deleting', moderated: true });
  await expectCallableError(request, 'initializeAccountProfile', { name: 'Recover Member', userName: 'recover-member' }, user.token, /being deleted/i);
  await expectCallableError(request, 'updateAccountProfile', { name: 'Renamed', userName: 'renamed' }, user.token, /profile is unavailable/i);
  expect((await getDocData(`users/${user.uid}`))?.accountStatus).toBe('deleting');

  const app = initializeAdminApp({ projectId }, `deleted-profile-test-${randomUUID()}`);
  try {
    await withAdminDb(async firestore => firestore.doc(`users/${user.uid}`).delete());
    await getAdminAuth(app).updateUser(user.uid, { disabled: true });
    await expectCallableError(request, 'initializeAccountProfile', { name: 'Recover Member', userName: 'recover-member' }, user.token, /sign in again|unauthenticated/i);
    await expectDocExists(`users/${user.uid}`, false);
    await getAdminAuth(app).deleteUser(user.uid);
    await expectCallableError(request, 'initializeAccountProfile', { name: 'Recover Member', userName: 'recover-member' }, user.token, /no longer available|unauthenticated/i);
    await expectDocExists(`users/${user.uid}`, false);
  } finally { await deleteAdminApp(app); }
});

test('profile and forum client errors are stored with searchable categories', async ({ request }) => {
  const user = await createSignedInUser();
  for (const context of ['handleNewPost', 'AccountSettings-saveProfile']) {
    await callFunction(request, 'logClientError', { context, message: 'Your account profile is unavailable.' }, user.token);
  }
  const logs = await collectionData('errorLogs');
  expect(logs.find(log => log.context === 'handleNewPost')).toMatchObject({ actorEmail: user.email, tags: ['error', 'handlenewpost', 'forum-post', 'web'] });
  expect(logs.find(log => log.context === 'AccountSettings-saveProfile')).toMatchObject({ actorEmail: user.email, tags: ['error', 'accountsettings-saveprofile', 'account-profile', 'web'] });
});

test('document tickets verify stored metadata, derive records, and enforce admin lifecycle actions', async ({ request }) => {
  const user = await createSignedInUser({ name: 'Doc User', userName: 'doc-user' });
  const admin = await createSignedInUser({ admin: true, name: 'Doc Admin', userName: 'doc-admin' });

  await expectCallableError(request, 'setDocumentStatus', {
    id: 'missing',
    status: 'approved',
  }, user.token, /Admin access/i);

  await expectCallableError(request, 'createDocumentRecord', {
    title: 'Wrong path',
    ticketId: 'not-a-ticket',
    storagePath: 'documents/not-owner/file.pdf',
  }, user.token, /invalid upload ticket/i);

  const userDoc = await uploadDocumentForUser(request, user, {
    title: 'User Packet',
    notes: 'Needs review.',
    visibility: 'public',
  });
  await expectDocExists(`documents/${userDoc.id}`, true);

  const adminDoc = await uploadDocumentForUser(request, admin, {
    title: 'Admin Packet',
    notes: 'Published admin packet.',
    admin: true,
    publish: true,
  });

  await callFunction(request, 'setDocumentStatus', { id: userDoc.id, status: 'approved' }, admin.token);
  const published = await callFunction<{ published: boolean }>(request, 'toggleDocumentPublished', { id: userDoc.id }, admin.token);
  expect(published.published).toBe(true);

  const updatedUserDoc = await getDocData(`documents/${userDoc.id}`);
  expect(updatedUserDoc).toMatchObject({
    status: 'approved',
    published: true,
    contentType: 'application/pdf',
    sizeBytes: 4,
    storagePath: `documents/${user.uid}/${userDoc.ticketId}.pdf`,
  });
  expect(updatedUserDoc).not.toHaveProperty('storageUrl');
  expect(updatedUserDoc).not.toHaveProperty('thumbnailUrl');

  const publicList = await callFunction<{ documents: Array<Record<string, any>> }>(
    request,
    'listPublicDocuments',
  );
  expect(publicList.documents).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: userDoc.id, title: 'User Packet' }),
    expect.objectContaining({ id: adminDoc.id, title: 'Admin Packet' }),
  ]));
  for (const publicDoc of publicList.documents) {
    expect(publicDoc).not.toHaveProperty('userId');
    expect(publicDoc).not.toHaveProperty('userEmail');
    expect(publicDoc).not.toHaveProperty('userName');
    expect(publicDoc).not.toHaveProperty('storageUrl');
    expect(publicDoc).not.toHaveProperty('thumbnailUrl');
  }

  await callFunction(request, 'deleteDocumentRecord', { id: adminDoc.id }, admin.token);
  await expectDocExists(`documents/${adminDoc.id}`, false);
});

test('admin Storage inventory includes orphaned objects and can quarantine preserved originals', async ({ request }) => {
  const admin = await createSignedInUser({ admin: true, name: 'Storage Admin', userName: 'storage-admin' });
  const member = await createSignedInUser({ name: 'Storage Member', userName: 'storage-member' });
  const suffix = randomUUID();
  const currentPath = `documents/${admin.uid}/${suffix}-redacted.pdf`;
  const originalPath = `documents/${admin.uid}/${suffix}-original-signed.pdf`;

  await withAdminStorage(async bucket => {
    await Promise.all([
      bucket.file(currentPath).save(Buffer.from('%PDF-current'), {
        resumable: false,
        metadata: { contentType: 'application/pdf', metadata: { published: 'true', role: 'document' } },
      }),
      bucket.file(originalPath).save(Buffer.from('%PDF-original'), {
        resumable: false,
        metadata: {
          contentType: 'application/pdf',
          metadata: { published: 'true', firebaseStorageDownloadTokens: 'legacy-token' },
        },
      }),
    ]);
  });
  await setDoc('documents/storage-inventory-doc', {
    userId: admin.uid,
    title: 'Sanitized plan',
    name: 'redacted.pdf',
    status: 'approved',
    visibility: 'public',
    published: true,
    storagePath: currentPath,
    thumbnailPath: '',
    originalStoragePath: originalPath,
    originalThumbnailPath: '',
    uploadDate: new Date(),
  });

  await expectCallableError(request, 'listAdminStorageObjects', {}, member.token, /Admin access/i);
  await expectCallableError(request, 'setAdminStorageObjectPublished', {
    path: originalPath,
    published: false,
  }, member.token, /Admin access/i);

  const inventory = await callFunction<{
    objects: Array<Record<string, any>>;
    nextPageToken: string;
  }>(request, 'listAdminStorageObjects', {}, admin.token);
  expect(inventory.objects).toEqual(expect.arrayContaining([
    expect.objectContaining({
      name: currentPath,
      published: true,
      linkRole: 'current-document',
      documentId: 'storage-inventory-doc',
    }),
    expect.objectContaining({
      name: originalPath,
      published: true,
      hasDownloadToken: true,
      linkRole: 'preserved-original',
      documentId: 'storage-inventory-doc',
    }),
  ]));

  await expectCallableError(request, 'setAdminStorageObjectPublished', {
    path: currentPath,
    published: false,
  }, admin.token, /document publish control/i);
  await expectCallableError(request, 'setAdminStorageObjectPublished', {
    path: `events/${suffix}/photo.jpg`,
    published: false,
  }, admin.token, /document Storage object path/i);

  const updated = await callFunction<{
    published: boolean;
    hasDownloadToken: boolean;
    downloadTokensRevoked: boolean;
    downloadTokenRotatedAt: string;
  }>(
    request,
    'setAdminStorageObjectPublished',
    { path: originalPath, published: false },
    admin.token,
  );
  expect(updated).toMatchObject({
    published: false,
    hasDownloadToken: true,
    downloadTokensRevoked: true,
    downloadTokenRotatedAt: expect.any(String),
  });
  await withAdminStorage(async bucket => {
    const [metadata] = await bucket.file(originalPath).getMetadata();
    expect(metadata.metadata).toMatchObject({
      published: 'false',
      downloadTokenRotatedAt: updated.downloadTokenRotatedAt,
    });
    expect(String(metadata.metadata?.firebaseStorageDownloadTokens || '').split(','))
      .not.toContain('legacy-token');
  });
  const oldDownloadUrl = `http://${emulatorHost}:${storagePort}/v0/b/${encodeURIComponent(clientConfig.storageBucket)}/o/${encodeURIComponent(originalPath)}?alt=media&token=legacy-token`;
  expect((await request.get(oldDownloadUrl)).status()).toBe(403);

  const auditLogs = await collectionData('adminAuditLogs');
  expect(auditLogs).toEqual(expect.arrayContaining([
    expect.objectContaining({
      action: 'storage-object.unpublish',
      actorUid: admin.uid,
      resourceId: originalPath,
      tags: expect.arrayContaining(['admin-action', 'storage', 'document']),
    }),
  ]));
});

test('document upload tickets cap concurrent uploads and reject forged Storage metadata', async ({ request }) => {
  const user = await createSignedInUser({ name: 'Quota User', userName: 'quota-user' });
  const issued: Array<{ ticketId: string; storagePath: string }> = [];
  for (let i = 0; i < 3; i += 1) {
    issued.push(await callFunction(request, 'createDocumentUploadTicket', {
      name: `packet-${i}.pdf`, contentType: 'application/pdf', sizeBytes: 4, wantsThumbnail: false,
    }, user.token));
  }
  await expectCallableError(request, 'createDocumentUploadTicket', {
    name: 'packet-4.pdf', contentType: 'application/pdf', sizeBytes: 4, wantsThumbnail: false,
  }, user.token, /already in progress/i);

  await expect(uploadStorageBytes(storageRef(user.storage, issued[0].storagePath), new Uint8Array([1, 2, 3, 4, 5]), {
    contentType: 'application/pdf',
    customMetadata: { published: 'false', ticketId: issued[0].ticketId, role: 'document' },
  })).rejects.toThrow();
  await expect(uploadStorageBytes(storageRef(user.storage, issued[1].storagePath), new Uint8Array([37, 80, 68, 70]), {
    contentType: 'application/pdf',
    customMetadata: { published: 'false', ticketId: issued[1].ticketId, role: 'document', extra: 'not allowed' },
  })).rejects.toThrow();
});

test('admin CRUD, content, and user-management callables are admin-only and update records', async ({ request }) => {
  const admin = await createSignedInUser({ admin: true });
  const user = await createSignedInUser({ name: 'Managed User', userName: 'managed-user' });

  await expectCallableError(request, 'deleteVolunteer', { id: 'missing' }, user.token, /Admin access/i);

  const volunteerId = await addDoc('volunteers', { name: 'Old Volunteer', email: 'old@example.test', phone: '' });
  await callFunction(request, 'updateVolunteer', {
    id: volunteerId,
    name: 'New Volunteer',
    email: 'new@example.test',
    phone: '555-1000',
  }, admin.token);
  await expectDocExists(`volunteers/${volunteerId}`, true);
  expect(await getDocData(`volunteers/${volunteerId}`)).toMatchObject({ name: 'New Volunteer', email: 'new@example.test' });
  await callFunction(request, 'deleteVolunteer', { id: volunteerId }, admin.token);
  await expectDocExists(`volunteers/${volunteerId}`, false);

  const mailingId = await addDoc('mailingList', { email: 'subscriber@example.test' });
  await callFunction(request, 'removeMailingListEntry', { id: mailingId }, admin.token);
  await expectDocExists(`mailingList/${mailingId}`, false);

  const savedEvent = await callFunction<{ id: string }>(request, 'saveEvent', {
    title: 'Admin Cleanup',
    date: '2026-08-01',
    time: '8:30 AM',
    location: 'Trailhead',
    description: 'Admin-created event.',
    lat: 30.24,
    lng: -97.71,
  }, admin.token);
  await callFunction(request, 'saveEvent', {
    id: savedEvent.id,
    title: 'Updated Admin Cleanup',
    date: '2026-08-01',
    time: '9:00 AM',
    location: 'Trailhead',
    description: 'Updated event.',
  }, admin.token);
  expect(await getDocData(`events/${savedEvent.id}`)).toMatchObject({ title: 'Updated Admin Cleanup' });
  await setDoc('rsvps/event-rsvp', { eventId: savedEvent.id, userId: 'event-user' });
  await setDoc('eventComments/event-comment', { eventId: savedEvent.id, authorId: 'event-user', body: 'Comment' });
  await setDoc('eventCommentReports/event-report', { eventId: savedEvent.id, commentId: 'event-comment', status: 'new' });
  await setDoc('polls/event-poll', { eventId: savedEvent.id, question: 'Linked poll' });
  const deletedEvent = await callFunction<{
    removedRsvps: number; removedComments: number; removedReports: number; unlinkedPolls: number;
  }>(request, 'deleteEvent', { id: savedEvent.id }, admin.token);
  expect(deletedEvent).toMatchObject({ removedRsvps: 1, removedComments: 1, removedReports: 1, unlinkedPolls: 1 });
  await expectDocExists(`events/${savedEvent.id}`, false);
  await expectDocExists('rsvps/event-rsvp', false);
  await expectDocExists('eventComments/event-comment', false);
  await expectDocExists('eventCommentReports/event-report', false);
  expect(await getDocData('polls/event-poll')).toMatchObject({ eventId: '' });

  await callFunction(request, 'saveSiteContent', {
    mission: '**Mission** text',
    goals: 'Goal text',
    about: {
      name: 'Admin Lead',
      bio: 'Lead bio',
      imageUrl: 'https://example.test/profile.png',
      imagePath: 'siteContent/profile_test.png',
    },
  }, admin.token);
  expect(await getDocData('siteContent/main')).toMatchObject({
    mission: '**Mission** text',
    updatedBy: admin.uid,
  });

  const linkedVolunteerId = await addDoc('volunteers', { name: 'Linked Old', email: 'old-linked@example.test', phone: '' });
  await callFunction(request, 'toggleUserModeration', { uid: user.uid }, admin.token);
  await callFunction(request, 'saveAdminUserProfile', {
    uid: user.uid,
    volunteerId: linkedVolunteerId,
    name: 'Managed Renamed',
    userName: 'managed-renamed',
    email: 'managed-renamed@example.test',
    phone: '555-2222',
  }, admin.token);
  expect(await getDocData(`users/${user.uid}`)).toMatchObject({
    moderated: true,
    name: 'Managed User',
    userName: 'managed-user',
    email: user.email,
  });
  expect(await getDocData(`volunteers/${linkedVolunteerId}`)).toMatchObject({ name: 'Managed Renamed', email: 'managed-renamed@example.test' });

  await setDoc('forumPosts/managed-post', {
    author: 'Managed User',
    authorId: user.uid,
    authorUserName: 'managed-user',
    replies: [{ id: 'managed-reply', author: 'Managed User', authorId: user.uid, authorUserName: 'managed-user' }],
  });
  const anonymized = await callFunction<{ changed: number }>(request, 'adminAnonymizeForumPosts', { uid: user.uid }, admin.token);
  expect(anonymized.changed).toBe(1);

  await setDoc('rsvps/managed-rsvp', { userId: user.uid });
  await setDoc('documents/managed-doc', { userId: user.uid });
  await setDoc('mailingList/managed-mail', { email: user.email });
  await setDoc('profileMessages/managed-message', { userId: user.uid, userEmail: user.email });
  await setDoc('eventComments/managed-comment', { authorId: user.uid, body: 'Personal comment' });
  await setDoc('pollVotes/managed-vote', { userId: user.uid, voterKey: `u:${user.uid}` });
  await callFunction(request, 'adminDeleteUserData', { uid: user.uid, email: user.email }, admin.token);
  await expect(tokenFor(user.email, user.password)).rejects.toThrow();
  await expectDocExists(`users/${user.uid}`, false);
  await expectDocExists('userNames/managed-user', false);
  await expectDocExists('rsvps/managed-rsvp', false);
  await expectDocExists('documents/managed-doc', false);
  await expectDocExists('mailingList/managed-mail', false);
  await expectDocExists('profileMessages/managed-message', false);
  await expectDocExists('eventComments/managed-comment', false);
  await expectDocExists('pollVotes/managed-vote', false);

  const auditLogs = await collectionData('adminAuditLogs');
  const eventDeletion = auditLogs.find(log => log.action === 'event.delete');
  expect(eventDeletion).toMatchObject({
    type: 'admin-action',
    actorUid: admin.uid,
    actorEmail: admin.email,
    resourceType: 'event',
    resourceId: savedEvent.id,
    surface: 'desktop',
    status: 'succeeded',
    details: { removedRsvps: 1, removedComments: 1, removedReports: 1, unlinkedPolls: 1 },
  });
  expect(eventDeletion.tags).toEqual(expect.arrayContaining(['admin-action', 'action:event.delete', 'event', 'delete', 'desktop']));

  await callFunction(request, 'recordAdminLogsExport', {}, admin.token);
  expect((await collectionData('adminAuditLogs')).some(log => (
    log.action === 'admin-log.export' && log.actorUid === admin.uid
  ))).toBe(true);
});

test('administrator audit logs distinguish the verified account that performed each action', async ({ request }) => {
  const first = await createSignedInUser({ admin: true, name: 'First Admin', userName: 'first-admin' });
  const second = await createSignedInUser({ admin: true, name: 'Second Admin', userName: 'second-admin' });

  await callFunction(request, 'saveEvent', {
    title: 'First event', date: '2026-09-01', time: '8:00 AM', location: 'North gate', description: '',
  }, first.token);
  await callFunction(request, 'saveEvent', {
    title: 'Second event', date: '2026-09-02', time: '9:00 AM', location: 'South gate', description: '',
  }, second.token);

  const creates = (await collectionData('adminAuditLogs')).filter(log => log.action === 'event.create');
  expect(creates).toHaveLength(2);
  expect(creates.map(log => ({ uid: log.actorUid, email: log.actorEmail }))).toEqual(expect.arrayContaining([
    { uid: first.uid, email: first.email },
    { uid: second.uid, email: second.email },
  ]));
});

test('admin forum and overlay moderation callables publish, reject, and delete records', async ({ request }) => {
  const admin = await createSignedInUser({ admin: true });

  const forumId = await addDoc('forumPosts', {
    status: 'pending',
    flagged: true,
    replies: [
      { id: 'reply-1', text: 'Flagged reply', flagged: true },
      { id: 'reply-2', text: 'Second reply', flagged: false },
    ],
  });
  await callFunction(request, 'approveForumPost', { id: forumId }, admin.token);
  await callFunction(request, 'unflagForumReply', { postId: forumId, replyId: 'reply-1' }, admin.token);
  await callFunction(request, 'deleteForumReply', { postId: forumId, replyId: 'reply-2' }, admin.token);
  const forum = await getDocData(`forumPosts/${forumId}`);
  expect(forum).toMatchObject({ status: 'approved', flagged: false });
  expect(forum?.replies).toEqual([{ id: 'reply-1', text: 'Flagged reply', flagged: false }]);
  await callFunction(request, 'deleteForumPost', { id: forumId }, admin.token);
  await expectDocExists(`forumPosts/${forumId}`, false);

  const imported = await callFunction<{ id: string }>(request, 'importOverlay', {
    name: 'Imported Overlay',
    description: 'Imported from E2E.',
    color: '#00ff00',
    geojson: sampleGeojson(),
  }, admin.token);
  expect(await getDocData(`overlays/${imported.id}`)).toMatchObject({
    name: 'Imported Overlay',
    featureCount: 1,
    published: true,
  });
  const toggled = await callFunction<{ published: boolean }>(request, 'toggleOverlayPublished', { id: imported.id }, admin.token);
  expect(toggled.published).toBe(false);
  await callFunction(request, 'deleteOverlay', { id: imported.id }, admin.token);
  await expectDocExists(`overlays/${imported.id}`, false);

  const uploadId = await addDoc('overlayUploads', {
    name: 'Uploaded Overlay',
    description: 'Review me.',
    color: '#3366ff',
    geojson: sampleGeojson(),
    status: 'pending',
  });
  const approved = await callFunction<{ id: string }>(request, 'approveOverlayUpload', { uploadId }, admin.token);
  expect(await getDocData(`overlays/${approved.id}`)).toMatchObject({ sourceUploadId: uploadId });
  expect(await getDocData(`overlayUploads/${uploadId}`)).toMatchObject({ status: 'approved', deployedOverlayId: approved.id, reviewedBy: admin.uid });

  const rejectId = await addDoc('overlayUploads', {
    name: 'Rejected Overlay',
    description: 'Reject me.',
    color: '#3366ff',
    geojson: sampleGeojson(),
    status: 'pending',
  });
  await callFunction(request, 'rejectOverlayUpload', { uploadId: rejectId, note: 'Needs cleanup.' }, admin.token);
  expect(await getDocData(`overlayUploads/${rejectId}`)).toMatchObject({ status: 'rejected', reviewNote: 'Needs cleanup.', reviewedBy: admin.uid });

  const deleteId = await addDoc('overlayUploads', {
    name: 'Delete Overlay',
    description: 'Delete me.',
    color: '#3366ff',
    geojson: sampleGeojson(),
    status: 'pending',
  });
  await callFunction(request, 'deleteOverlayUpload', { uploadId: deleteId }, admin.token);
  await expectDocExists(`overlayUploads/${deleteId}`, false);
});

test('document moderation keeps rejected documents unpublished and blocks invalid publishes', async ({ request }) => {
  const user = await createSignedInUser({ name: 'Mod User', userName: 'mod-user' });
  const admin = await createSignedInUser({ admin: true, name: 'Mod Admin', userName: 'mod-admin' });

  const doc = await uploadDocumentForUser(request, user, {
    title: 'Field Report',
    visibility: 'public',
  });

  // A pending document cannot be published.
  await expectCallableError(request, 'toggleDocumentPublished', { id: doc.id }, admin.token, /approved/i);

  // Once approved and public it can be published.
  await callFunction(request, 'setDocumentStatus', { id: doc.id, status: 'approved' }, admin.token);
  const published = await callFunction<{ published: boolean }>(request, 'toggleDocumentPublished', { id: doc.id }, admin.token);
  expect(published.published).toBe(true);
  expect(await getDocData(`documents/${doc.id}`)).toMatchObject({ status: 'approved', published: true });

  // Rejecting must always unpublish (status:rejected + published:true can never persist).
  await callFunction(request, 'setDocumentStatus', { id: doc.id, status: 'rejected' }, admin.token);
  expect(await getDocData(`documents/${doc.id}`)).toMatchObject({ status: 'rejected', published: false });

  // A rejected document can never be re-published.
  await expectCallableError(request, 'toggleDocumentPublished', { id: doc.id }, admin.token, /approved/i);

  // An approved but private document cannot be published either.
  const privateDoc = await uploadDocumentForUser(request, user, {
    title: 'Private Report',
    visibility: 'private',
  });
  await callFunction(request, 'setDocumentStatus', { id: privateDoc.id, status: 'approved' }, admin.token);
  await expectCallableError(request, 'toggleDocumentPublished', { id: privateDoc.id }, admin.token, /public/i);
});

test('members can delete their own documents but not documents owned by others', async ({ request }) => {
  const owner = await createSignedInUser({ name: 'Owner User', userName: 'owner-user' });
  const stranger = await createSignedInUser({ name: 'Stranger User', userName: 'stranger-user' });
  const admin = await createSignedInUser({ admin: true, name: 'Delete Admin', userName: 'delete-admin' });

  const doc = await uploadDocumentForUser(request, owner, {
    title: 'Owned Packet',
    visibility: 'public',
  });

  // Deletion works even after approval/publishing, not just while pending.
  await callFunction(request, 'setDocumentStatus', { id: doc.id, status: 'approved' }, admin.token);
  await callFunction(request, 'toggleDocumentPublished', { id: doc.id }, admin.token);

  await expectCallableError(request, 'deleteOwnDocument', { id: doc.id }, undefined, /signed in/i);
  await expectCallableError(request, 'deleteOwnDocument', { id: doc.id }, stranger.token, /your own/i);
  await expectDocExists(`documents/${doc.id}`, true);

  await callFunction(request, 'deleteOwnDocument', { id: doc.id }, owner.token);
  await expectDocExists(`documents/${doc.id}`, false);

  // Deleting an already-missing document is a graceful no-op.
  await callFunction(request, 'deleteOwnDocument', { id: 'missing-doc' }, owner.token);
});

test('event comment callables preserve anonymity, ownership, reporting, and moderation', async ({ request }) => {
  const author = await createSignedInUser({ name: 'Anonymous Author', userName: 'anonymous-author' });
  const reporter = await createSignedInUser({ name: 'Comment Reporter', userName: 'comment-reporter' });
  const admin = await createSignedInUser({ admin: true, name: 'Comment Admin', userName: 'comment-admin' });
  await setDoc('events/comment-event', {
    title: 'Comment Event',
    date: '2026-09-20',
    time: '9:00 AM',
    location: 'Trailhead',
    description: 'Discuss this event.',
  });

  await expectCallableError(request, 'submitEventComment', {
    eventId: 'comment-event',
    body: 'No authentication.',
  }, undefined, /signed in/i);

  const submitted = await callFunction<{ comment: Record<string, any> }>(request, 'submitEventComment', {
    eventId: 'comment-event',
    body: ' Where should we park? ',
    anonymous: true,
  }, author.token);
  const commentId = String(submitted.comment.id);
  expect(submitted.comment).toMatchObject({
    body: 'Where should we park?',
    authorLabel: 'Anonymous member',
    anonymous: true,
    isOwn: true,
  });

  const publicPage = await callFunction<{ comments: Array<Record<string, any>> }>(request, 'listEventComments', {
    eventId: 'comment-event',
    limit: 10,
  });
  expect(publicPage.comments).toHaveLength(1);
  expect(publicPage.comments[0]).not.toHaveProperty('authorId');
  expect(publicPage.comments[0]).not.toHaveProperty('authorName');

  await expectCallableError(request, 'editEventComment', {
    commentId,
    body: 'Someone else changed this.',
  }, reporter.token, /only edit your own/i);
  await callFunction(request, 'toggleUserModeration', { uid: author.uid, moderated: true }, admin.token);
  const edited = await callFunction<{ comment: Record<string, any> }>(request, 'editEventComment', {
    commentId,
    body: 'Parking is by the east gate.',
  }, author.token);
  expect(edited.comment).toMatchObject({ edited: true, anonymous: true, status: 'pending' });

  await callFunction(request, 'reportEventComment', {
    commentId,
    reason: 'privacy',
    details: 'This may disclose a private location.',
  }, reporter.token);
  await expectCallableError(request, 'reportEventComment', {
    commentId,
    reason: 'privacy',
    details: 'Duplicate report.',
  }, reporter.token, /already reported/i);

  const adminPage = await callFunction<{ comments: Array<Record<string, any>> }>(request, 'listEventComments', {
    eventId: 'comment-event',
  }, admin.token);
  expect(adminPage.comments[0]).toMatchObject({
    id: commentId,
    authorId: author.uid,
    authorName: 'anonymous-author',
    flagged: true,
  });

  await callFunction(request, 'moderateEventComment', { commentId, action: 'remove' }, admin.token);
  expect(await getDocData(`eventComments/${commentId}`)).toMatchObject({
    status: 'removed',
    flagged: false,
    moderatedBy: admin.uid,
  });
  expect(await collectionData('eventCommentReports')).toEqual([
    expect.objectContaining({ status: 'resolved', resolution: 'remove', resolvedBy: admin.uid }),
  ]);

  const afterRemoval = await callFunction<{ comments: Array<Record<string, any>> }>(request, 'listEventComments', {
    eventId: 'comment-event',
  }, reporter.token);
  expect(afterRemoval.comments).toHaveLength(0);
});

test('poll, event-image ticket, and mailing export callables enforce server-owned controls', async ({ request }) => {
  const admin = await createSignedInUser({ admin: true, name: 'Feature Admin', userName: 'feature-admin' });
  const voter = await createSignedInUser({ name: 'Neighborhood Voter', userName: 'neighborhood-voter' });
  const secondVoter = await createSignedInUser({ name: 'Second Voter', userName: 'second-voter' });
  await setDoc('events/feature-event', {
    title: 'Feature Event',
    date: '2026-10-01',
    time: '10:00 AM',
    location: 'Creek Park',
    description: 'Linked feature event.',
  });

  await expectCallableError(request, 'createEventImageUploadTicket', {
    eventId: 'feature-event',
    contentType: 'image/jpeg',
    size: 1024,
  }, voter.token, /Admin access/i);
  await expectCallableError(request, 'createEventImageUploadTicket', {
    eventId: 'feature-event',
    contentType: 'image/gif',
    size: 1024,
  }, admin.token, /JPEG, PNG, or WebP/i);
  const ticket = await callFunction<{ imageId: string; storagePath: string; maxBytes: number }>(
    request,
    'createEventImageUploadTicket',
    { eventId: 'feature-event', contentType: 'image/jpeg', size: 5 * 1024 * 1024 },
    admin.token,
  );
  expect(ticket.storagePath).toBe(`events/feature-event/${ticket.imageId}.jpg`);
  expect(ticket.maxBytes).toBe(5 * 1024 * 1024);

  await expectCallableError(request, 'savePoll', {
    question: 'Unauthorized poll',
    options: ['One', 'Two'],
  }, voter.token, /Admin access/i);
  const created = await callFunction<{ id: string }>(request, 'savePoll', {
    question: 'Which cleanup day works?',
    description: 'Choose one day.',
    notes: 'Organizer-only scheduling note.',
    options: ['Saturday', 'Sunday'],
    audience: 'members',
    resultVisibility: 'afterVote',
    resultAudience: 'members',
    allowVoteChange: false,
    showParticipation: true,
    privateVotes: false,
    eventId: 'feature-event',
  }, admin.token);
  await callFunction(request, 'setPollStatus', { pollId: created.id, status: 'published' }, admin.token);

  const publicPoll = await callFunction<{ poll: Record<string, any> }>(request, 'getPoll', { pollId: created.id });
  expect(publicPoll.poll).toMatchObject({
    status: 'published',
    state: 'open',
    notes: '',
    results: null,
    canSeeResults: false,
  });
  await expectCallableError(request, 'castPollVote', {
    pollId: created.id,
    optionId: 'saturday',
    participantId: 'guest-participant-12345',
  }, undefined, /sign in/i);

  const voted = await callFunction<{ poll: Record<string, any> }>(request, 'castPollVote', {
    pollId: created.id,
    optionId: 'saturday',
  }, voter.token);
  expect(voted.poll).toMatchObject({ hasVoted: true, myVote: 'saturday', totalVotes: 1 });
  expect(voted.poll.results).toMatchObject({ saturday: 1, sunday: 0 });
  await expectCallableError(request, 'castPollVote', {
    pollId: created.id,
    optionId: 'sunday',
  }, voter.token, /already voted/i);

  const publicVotes = await callFunction<{ votes: Array<Record<string, any>> }>(request, 'listPublicPollVotes', {
    pollId: created.id,
  }, voter.token);
  expect(publicVotes.votes).toHaveLength(1);
  expect(publicVotes.votes[0]).toMatchObject({ voterLabel: '@neighborhood-voter', optionId: 'saturday' });
  expect(publicVotes.votes[0]).not.toHaveProperty('userId');
  expect(publicVotes.votes[0]).not.toHaveProperty('voterKey');
  expect(String(publicVotes.votes[0].id)).not.toContain(voter.uid);

  const adminVotes = await callFunction<{ votes: Array<Record<string, any>> }>(request, 'listPollVotes', {
    pollId: created.id,
  }, admin.token);
  expect(adminVotes.votes).toEqual([
    expect.objectContaining({ userId: voter.uid, optionId: 'saturday', voterType: 'member' }),
  ]);

  await callFunction(request, 'setPollStatus', { pollId: created.id, status: 'closed' }, admin.token);
  await expectCallableError(request, 'castPollVote', {
    pollId: created.id,
    optionId: 'sunday',
  }, secondVoter.token, /closed/i);

  await setDoc('mailingList/formula-entry', {
    email: '=HYPERLINK("https://malicious.invalid","click")',
    status: '@unsubscribed',
    addedAt: new Date('2026-09-01T12:00:00.000Z'),
  });
  await expectCallableError(request, 'exportMailingListCsv', {}, voter.token, /Admin access/i);
  const exported = await callFunction<{ csv: string; filename: string; count: number }>(
    request,
    'exportMailingListCsv',
    {},
    admin.token,
  );
  expect(exported.count).toBe(1);
  expect(exported.filename).toMatch(/^watershedcrew-mailing-list-\d{4}-\d{2}-\d{2}[.]csv$/);
  expect(exported.csv).toContain(`"'=HYPERLINK(""https://malicious.invalid"",""click"")"`);
  expect(exported.csv).toContain(`"'@unsubscribed"`);
});

test('admins can reply to member contact messages and the reply is stored on the thread', async ({ request }) => {
  const member = await createSignedInUser({ name: 'Msg Member', userName: 'msg-member' });
  const admin = await createSignedInUser({ admin: true, name: 'Reply Admin', userName: 'reply-admin' });

  await callFunction(request, 'submitProfileMessage', { topic: 'general', message: 'Any updates on the cleanup?' }, member.token);
  const messages = await collectionData('profileMessages');
  expect(messages).toHaveLength(1);
  const messageId = messages[0].id;

  await expectCallableError(request, 'replyToProfileMessage', { id: messageId, reply: 'Hi there' }, member.token, /Admin access/i);
  await expectCallableError(request, 'replyToProfileMessage', { id: messageId, reply: '   ' }, admin.token, /reply message/i);
  await expectCallableError(request, 'replyToProfileMessage', { id: 'missing-message', reply: 'Hello' }, admin.token, /not found/i);

  await callFunction(request, 'replyToProfileMessage', { id: messageId, reply: 'Thanks for reaching out!' }, admin.token);
  expect(await getDocData(`profileMessages/${messageId}`)).toMatchObject({
    adminReply: 'Thanks for reaching out!',
    adminReplyBy: admin.uid,
    adminReplyByName: 'reply-admin',
    status: 'replied',
  });
});

test('multi-select polls atomically replace entire ballots and count respondents once', async ({ request }) => {
  const admin = await createSignedInUser({ admin: true });
  const first = await createSignedInUser({ userName: 'availability-one' });
  const second = await createSignedInUser({ userName: 'availability-two' });
  const config = {
    question: 'Which dates work?', options: ['Saturday', 'Sunday', 'Monday'],
    votingMode: 'multiple', audience: 'members', allowVoteChange: true,
    resultVisibility: 'afterVote', privateVotes: false, status: 'published',
  };
  const { id } = await callFunction<{ id: string }>(request, 'savePoll', config, admin.token);
  for (const optionIds of [[], ['saturday', 'saturday'], ['unknown'], 'saturday']) {
    await expectCallableError(request, 'castPollVote', { pollId: id, optionIds }, first.token, /choose|option|ballot/i);
  }
  await Promise.all([
    callFunction(request, 'castPollVote', { pollId: id, optionIds: ['saturday', 'sunday'], tallies: { monday: 999 }, totalVotes: 999 }, first.token),
    callFunction(request, 'castPollVote', { pollId: id, optionIds: ['sunday', 'monday'] }, second.token),
    callFunction(request, 'savePoll', { ...config, id, description: 'Updated while voting.' }, admin.token),
  ]);
  expect(await getDocData(`polls/${id}`)).toMatchObject({ totalVotes: 2, tallies: { saturday: 1, sunday: 2, monday: 1 }, description: 'Updated while voting.' });
  const result = await callFunction<{ poll: Record<string, any> }>(request, 'castPollVote', { pollId: id, optionIds: ['monday'] }, first.token);
  expect(result.poll).toMatchObject({ myVotes: ['monday'], totalVotes: 2, results: { saturday: 0, sunday: 1, monday: 2 } });
  await callFunction(request, 'castPollVote', { pollId: id, optionIds: ['monday'] }, first.token);
  expect(await getDocData(`pollVotes/${id}__u:${first.uid}`)).toMatchObject({ optionIds: ['monday'], changeCount: 1 });
  await expectCallableError(request, 'savePoll', { ...config, id, votingMode: 'ranked', maxRankedChoices: 2 }, admin.token, /already has votes/i);
  await expectCallableError(request, 'savePoll', { ...config, id, options: ['Saturday', 'Sunday'] }, admin.token, /already has votes/i);
  const roster = await callFunction<{ votes: Array<Record<string, any>> }>(request, 'listPublicPollVotes', { pollId: id }, first.token);
  expect(roster.votes.find(vote => vote.voterLabel === '@availability-two')?.optionIds).toEqual(['sunday', 'monday']);
});

test('ranked polls preserve preference order, fixed-K scores, privacy, and replacement totals', async ({ request }) => {
  const admin = await createSignedInUser({ admin: true });
  const first = await createSignedInUser({ userName: 'rank-one' });
  const second = await createSignedInUser({ userName: 'rank-two' });
  const config = {
    question: 'Rank the dates', options: ['Saturday', 'Sunday', 'Monday'], votingMode: 'ranked', maxRankedChoices: 2,
    audience: 'members', allowVoteChange: true, resultVisibility: 'afterClose', privateVotes: true, status: 'published',
  };
  const { id } = await callFunction<{ id: string }>(request, 'savePoll', config, admin.token);
  await expectCallableError(request, 'castPollVote', { pollId: id, optionIds: ['saturday', 'sunday', 'monday'] }, first.token, /at most 2/i);
  await expectCallableError(request, 'castPollVote', { pollId: id, optionIds: ['sunday', 'sunday'] }, first.token, /only once/i);
  await Promise.all([
    callFunction(request, 'castPollVote', { pollId: id, optionIds: ['sunday', 'saturday'] }, first.token),
    callFunction(request, 'castPollVote', { pollId: id, optionIds: ['saturday', 'sunday'] }, second.token),
  ]);
  expect(await getDocData(`polls/${id}`)).toMatchObject({ totalVotes: 2, tallies: { saturday: 3, sunday: 3, monday: 0 } });
  const hidden = await callFunction<{ poll: Record<string, any> }>(request, 'getPoll', { pollId: id }, first.token);
  expect(hidden.poll).toMatchObject({ myVotes: ['sunday', 'saturday'], results: null, canSeeResults: false, votingMode: 'ranked', maxRankedChoices: 2 });
  await expectCallableError(request, 'getPollResults', { pollId: id }, first.token, /not available/i);
  await expectCallableError(request, 'listPublicPollVotes', { pollId: id }, first.token, /private/i);
  await callFunction(request, 'castPollVote', { pollId: id, optionIds: ['monday'] }, first.token);
  expect(await getDocData(`polls/${id}`)).toMatchObject({ totalVotes: 2, tallies: { saturday: 2, sunday: 1, monday: 2 } });
  await expectCallableError(request, 'savePoll', { ...config, id, maxRankedChoices: 3 }, admin.token, /already has votes/i);
  await callFunction(request, 'setPollStatus', { pollId: id, status: 'closed' }, admin.token);
  const results = await callFunction<Record<string, any>>(request, 'getPollResults', { pollId: id }, first.token);
  expect(results).toMatchObject({ results: { saturday: 2, sunday: 1, monday: 2 }, myVotes: ['monday'], totalVotes: 2, votingMode: 'ranked', maxRankedChoices: 2 });
  await expectCallableError(request, 'castPollVote', { pollId: id, optionIds: ['saturday'] }, first.token, /closed/i);
});

test('legacy single-choice votes can be changed without corrupting totals', async ({ request }) => {
  const voter = await createSignedInUser();
  await setDoc('polls/legacy', {
    question: 'Old poll', status: 'published', audience: 'members', resultVisibility: 'afterVote', allowVoteChange: true,
    options: [{ id: 'old', label: 'Old', order: 0 }, { id: 'new', label: 'New', order: 1 }], tallies: { old: 1, new: 0 }, totalVotes: 1,
  });
  await setDoc(`pollVotes/legacy__u:${voter.uid}`, { pollId: 'legacy', userId: voter.uid, optionId: 'old', changeCount: 0 });
  const before = await callFunction<{ poll: Record<string, any> }>(request, 'getPoll', { pollId: 'legacy' }, voter.token);
  expect(before.poll).toMatchObject({ votingMode: 'single', myVote: 'old', myVotes: ['old'] });
  await expectCallableError(request, 'castPollVote', { pollId: 'legacy', optionIds: ['old', 'new'] }, voter.token, /exactly one/i);
  const changed = await callFunction<{ poll: Record<string, any> }>(request, 'castPollVote', { pollId: 'legacy', optionId: 'new' }, voter.token);
  expect(changed.poll).toMatchObject({ myVote: 'new', myVotes: ['new'], totalVotes: 1, results: { old: 0, new: 1 } });
});

test('simultaneous ranked edits from one voter leave one complete ballot', async ({ request }) => {
  const admin = await createSignedInUser({ admin: true });
  const voter = await createSignedInUser();
  const { id } = await callFunction<{ id: string }>(request, 'savePoll', {
    question: 'Rank dates concurrently', options: ['Saturday', 'Sunday', 'Monday'], votingMode: 'ranked', maxRankedChoices: 2,
    audience: 'members', allowVoteChange: true, status: 'published',
  }, admin.token);
  await Promise.all([
    callFunction(request, 'castPollVote', { pollId: id, optionIds: ['saturday', 'sunday'] }, voter.token),
    callFunction(request, 'castPollVote', { pollId: id, optionIds: ['monday', 'saturday'] }, voter.token),
  ]);
  const ballot = await getDocData(`pollVotes/${id}__u:${voter.uid}`);
  const expected = ballot?.optionIds[0] === 'saturday' ? { saturday: 2, sunday: 1, monday: 0 } : { saturday: 1, sunday: 0, monday: 2 };
  expect(await getDocData(`polls/${id}`)).toMatchObject({ totalVotes: 1, tallies: expected });
  expect((await collectionData('pollVotes')).filter(vote => vote.pollId === id)).toHaveLength(1);
});
