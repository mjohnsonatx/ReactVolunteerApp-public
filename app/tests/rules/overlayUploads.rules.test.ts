import { describe, it, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROJECT_ID = 'demo-watershed';
const firestorePort = Number(process.env.FIRESTORE_EMULATOR_PORT || 8080);
const rules = readFileSync(resolve(__dirname, '../../../firebase_rules/firestore.rules'), 'utf8');

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: firestorePort },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

function adminDb() {
  return testEnv.authenticatedContext('admin1', {
    admin: true,
    email_verified: true,
    firebase: { sign_in_second_factor: 'totp' },
  }).firestore();
}
function userDb() {
  return testEnv.authenticatedContext('user1', {}).firestore();
}
function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

describe('overlayUploads rules', () => {
  it('allows admins to read uploads seeded by trusted server code', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('overlayUploads/readtest').set({
        name: 'R',
        status: 'pending',
        geojson: '{}',
        featureCount: 0,
        uploadedBy: 'admin1',
        uploadedByEmail: '',
        uploadedAt: new Date(),
        color: '#000',
        description: '',
      });
    });

    await assertSucceeds(adminDb().doc('overlayUploads/readtest').get());
    await assertFails(userDb().doc('overlayUploads/readtest').get());
    await assertFails(anonDb().doc('overlayUploads/readtest').get());
  });

  it('denies direct overlay upload mutations for all clients', async () => {
    const payload = {
      name: 'Test',
      status: 'pending',
      geojson: '{}',
      featureCount: 1,
      uploadedBy: 'admin1',
      uploadedByEmail: 'a@b.com',
      uploadedAt: new Date(),
      color: '#fff',
      description: '',
    };

    await assertFails(adminDb().collection('overlayUploads').add(payload));
    await assertFails(userDb().collection('overlayUploads').add(payload));
    await assertFails(anonDb().collection('overlayUploads').add(payload));
    await assertFails(adminDb().doc('overlayUploads/readtest').update({ status: 'approved' }));
    await assertFails(adminDb().doc('overlayUploads/readtest').delete());
  });
});
