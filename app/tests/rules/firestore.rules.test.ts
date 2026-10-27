import { describe, it, beforeAll, afterAll } from 'vitest';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

let env;
const firestorePort = Number(process.env.FIRESTORE_EMULATOR_PORT || 8080);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-watershed',
    firestore: {
      host: '127.0.0.1',
      port: firestorePort,
      rules: readFileSync(new URL('../../../firebase_rules/firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

afterAll(() => env.cleanup());

const adminClaims = {
  admin: true,
  email_verified: true,
  firebase: { sign_in_second_factor: 'totp' },
};
const admin = () => env.authenticatedContext('admin1', adminClaims).firestore();
const desktopAdmin = () => env.authenticatedContext('desktop-admin', {
  admin: true,
  email_verified: true,
  desktop_admin_mfa: true,
}).firestore();
const passwordOnlyAdmin = () => env.authenticatedContext('admin-password-only', {
  admin: true,
  email_verified: true,
}).firestore();
const user = () => env.authenticatedContext('user1').firestore();
const other = () => env.authenticatedContext('user2').firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('anonymous forum identity boundaries', () => {
  it('permits only MFA admins to read or list author identities and thread mappings', async () => {
    for (const collection of ['forumAuthors', 'forumAnonymousThreads']) {
      await env.withSecurityRulesDisabled(ctx => ctx.firestore().doc(`${collection}/private`).set({ authorId: 'user1', aliases: { user1: 1 } }));
      for (const client of [anon(), user(), other(), passwordOnlyAdmin()]) {
        await assertFails(client.doc(`${collection}/private`).get());
        await assertFails(client.collection(collection).get());
      }
      for (const client of [admin(), desktopAdmin()]) {
        await assertSucceeds(client.doc(`${collection}/private`).get());
        await assertSucceeds(client.collection(collection).get());
      }
    }
  });

  it('denies all client mutations, identity forgery, schema bypasses and nested access', async () => {
    for (const collection of ['forumAuthors', 'forumAnonymousThreads']) {
      for (const client of [anon(), user(), other(), passwordOnlyAdmin(), admin(), desktopAdmin()]) {
        const ref = client.doc(`${collection}/private`);
        await assertFails(client.doc(`${collection}/new`).set({ authorId: 'user2', admin: true }));
        await assertFails(ref.update({ authorId: 'user2', aliases: 'invalid', createdAt: 'forged' }));
        await assertFails(ref.update({ arbitrary: 'x'.repeat(10000) }));
        await assertFails(ref.delete());
        await assertFails(ref.collection('nested').doc('leak').get());
      }
    }
  });
});

describe('callable-owned write surface', () => {
  it('denies direct public writes now handled by callable Functions', async () => {
    await assertFails(anon().doc('volunteers/v1').set({
      name: 'Jane Walker',
      email: 'jane@example.com',
      phone: '555-0100',
      joinDate: new Date(),
    }));
    await assertFails(anon().doc('mailingList/m1').set({
      email: 'trail@example.com',
      addedAt: new Date(),
    }));
    await assertFails(anon().doc('profileMessages/msg1').set({
      userId: 'user1',
      topic: 'general',
      message: 'Hello',
      status: 'new',
      createdAt: new Date(),
    }));
    await assertFails(anon().doc('forumReports/r1').set({
      postId: 'p1',
      reporterId: 'user1',
      reason: 'spam',
      details: 'Looks suspicious.',
      createdAt: new Date(),
    }));
    await assertFails(anon().doc('userNames/jane-walker').set({
      uid: 'user1',
      userName: 'jane-walker',
      createdAt: new Date(),
    }));
    await assertFails(anon().doc('errorLogs/e1').set({
      context: 'DocumentViewer-load',
      message: 'Could not load this document.',
      stack: '',
      url: 'https://example.com/documents',
      userAgent: 'Vitest',
      uid: null,
      extra: { docId: 'doc-1' },
      createdAt: new Date(),
    }));
  });

  it('denies direct authenticated writes now handled by callable Functions', async () => {
    await assertFails(user().doc('users/user1').set({
      name: 'Jane Walker',
      userName: 'jane-walker',
      email: 'jane@example.com',
      joinDate: new Date(),
      role: 'user',
      votes: {},
      moderated: false,
    }));
    await assertFails(user().doc('rsvps/r1').set({
      userId: 'user1',
      eventId: 'e1',
      name: 'Jane Walker',
      email: 'jane@example.com',
    }));
    await assertFails(user().doc('forumPosts/p1').set({
      authorId: 'user1',
      title: 'Trail cleanup',
      content: 'I can help.',
      status: 'approved',
    }));
    await assertFails(user().doc('forumReports/r1').set({
      postId: 'p1',
      reporterId: 'user1',
      reason: 'spam',
      details: 'Looks suspicious.',
      createdAt: new Date(),
    }));
    await assertFails(user().doc('documents/d1').set({
      userId: 'user1',
      published: false,
      status: 'pending',
    }));
    await assertFails(user().doc('forumPendingReplies/reply1').set({
      postId: 'p1', authorId: 'user1', status: 'pending', reply: { id: 'reply1', text: 'hidden' },
    }));
    await assertFails(user().doc('documentUploadTickets/ticket1').set({
      userId: 'user1', status: 'issued', sizeBytes: 4,
    }));
    await assertFails(user().doc('documentUploadQuotas/user1').set({
      storedCount: 0, activeTicketCount: 1,
    }));
    await assertFails(user().doc('profileMessages/msg1').set({
      userId: 'user1',
      topic: 'account',
      message: 'Please help with my profile.',
      status: 'new',
    }));
    await assertFails(user().doc('userNames/jane-walker').set({
      uid: 'user1',
      userName: 'jane-walker',
    }));
  });

  it('denies direct admin writes because Functions own mutations', async () => {
    await assertFails(admin().doc('siteContent/main').set({ mission: 'ok' }));
    await assertFails(admin().doc('events/e1').set({ title: 'Cleanup' }));
    await assertFails(admin().doc('overlays/o1').set({ name: 'Trail' }));
    await assertFails(admin().doc('overlayUploads/u1').set({ name: 'Upload' }));
    await assertFails(admin().doc('userNames/jane-walker').set({ uid: 'user1' }));
    await assertFails(admin().doc('forumReports/r1').set({ postId: 'p1', reporterId: 'user1' }));
    await assertFails(admin().doc('adminAuditLogs/a1').set({ action: 'event.delete' }));
  });
});

describe('administrator audit logs', () => {
  beforeAll(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('adminAuditLogs/a1').set({
        type: 'admin-action',
        action: 'event.delete',
        actorUid: 'admin1',
        actorEmail: 'admin@example.com',
        tags: ['admin-action', 'event', 'action:event.delete'],
        createdAt: new Date(),
      });
    });
  });

  it('allows TOTP and desktop-MFA admins to read audit logs', async () => {
    await assertSucceeds(admin().doc('adminAuditLogs/a1').get());
    await assertSucceeds(desktopAdmin().doc('adminAuditLogs/a1').get());
    await assertSucceeds(admin().collection('adminAuditLogs').get());
  });

  it('denies audit-log reads without an MFA admin session', async () => {
    await assertFails(passwordOnlyAdmin().doc('adminAuditLogs/a1').get());
    await assertFails(user().doc('adminAuditLogs/a1').get());
    await assertFails(anon().doc('adminAuditLogs/a1').get());
  });
});

describe('read access', () => {
  it('keeps public content readable', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('siteContent/main').set({ mission: 'ok' });
      await ctx.firestore().doc('events/e1').set({ title: 'Cleanup' });
      await ctx.firestore().doc('forumPosts/p1').set({ title: 'Hello', status: 'approved' });
      await ctx.firestore().doc('overlays/o1').set({ name: 'Trail', published: true });
      await ctx.firestore().doc('documents/public1').set({
        userId: 'user1', userEmail: 'jane@example.com', published: true,
      });
    });

    await assertSucceeds(anon().doc('siteContent/main').get());
    await assertSucceeds(anon().doc('events/e1').get());
    await assertSucceeds(anon().doc('forumPosts/p1').get());
    await assertSucceeds(anon().doc('overlays/o1').get());
    // Published document records still contain uploader PII and therefore use
    // the listPublicDocuments callable instead of direct Firestore reads.
    await assertFails(anon().doc('documents/public1').get());
    await assertFails(other().doc('documents/public1').get());
    await assertSucceeds(user().doc('documents/public1').get());
    await assertSucceeds(admin().doc('documents/public1').get());
  });

  it('limits private user data reads to owners or admins', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user1').set({ email: 'jane@example.com' });
      await ctx.firestore().doc('rsvps/r1').set({ userId: 'user1', eventId: 'e1' });
      await ctx.firestore().doc('documents/private1').set({ userId: 'user1', published: false });
      await ctx.firestore().doc('volunteers/v1').set({ email: 'jane@example.com' });
      await ctx.firestore().doc('mailingList/m1').set({ email: 'trail@example.com' });
      await ctx.firestore().doc('profileMessages/msg1').set({ userId: 'user1', topic: 'general', message: 'Hello' });
      await ctx.firestore().doc('userNames/jane-walker').set({ uid: 'user1' });
      await ctx.firestore().doc('forumReports/r1').set({ postId: 'p1', reporterId: 'user1', details: 'Spam' });
      await ctx.firestore().doc('errorLogs/e1').set({ message: 'Nope' });
      await ctx.firestore().doc('overlayUploads/u1').set({ name: 'Upload' });
      await ctx.firestore().doc('forumPendingReplies/reply1').set({
        postId: 'p1', authorId: 'user1', status: 'pending', createdAt: new Date(),
      });
      await ctx.firestore().doc('documentUploadTickets/ticket1').set({ userId: 'user1', status: 'issued' });
      await ctx.firestore().doc('documentUploadQuotas/user1').set({ storedCount: 0, activeTicketCount: 1 });
    });

    await assertSucceeds(user().doc('users/user1').get());
    await assertSucceeds(admin().doc('users/user1').get());
    await assertFails(passwordOnlyAdmin().doc('users/user1').get());
    await assertFails(other().doc('users/user1').get());

    await assertSucceeds(user().doc('rsvps/r1').get());
    await assertSucceeds(admin().doc('rsvps/r1').get());
    await assertFails(other().doc('rsvps/r1').get());

    await assertSucceeds(user().doc('documents/private1').get());
    await assertSucceeds(admin().doc('documents/private1').get());
    await assertFails(other().doc('documents/private1').get());

    await assertSucceeds(admin().doc('volunteers/v1').get());
    await assertSucceeds(admin().doc('mailingList/m1').get());
    await assertSucceeds(admin().doc('profileMessages/msg1').get());
    await assertSucceeds(admin().doc('forumReports/r1').get());
    await assertSucceeds(admin().doc('errorLogs/e1').get());
    await assertSucceeds(admin().doc('overlayUploads/u1').get());
    await assertSucceeds(admin().doc('forumPendingReplies/reply1').get());
    await assertFails(user().doc('volunteers/v1').get());
    await assertFails(user().doc('mailingList/m1').get());
    // The sender can read their own contact thread; unrelated users cannot.
    await assertSucceeds(user().doc('profileMessages/msg1').get());
    await assertFails(other().doc('profileMessages/msg1').get());
    await assertFails(anon().doc('profileMessages/msg1').get());
    await assertFails(user().doc('forumReports/r1').get());
    await assertFails(other().doc('forumReports/r1').get());
    await assertFails(anon().doc('forumReports/r1').get());
    await assertFails(user().doc('userNames/jane-walker').get());
    await assertFails(admin().doc('userNames/jane-walker').get());
    await assertFails(user().doc('errorLogs/e1').get());
    await assertFails(user().doc('overlayUploads/u1').get());
    await assertFails(user().doc('forumPendingReplies/reply1').get());
    await assertFails(anon().doc('forumPendingReplies/reply1').get());
    await assertFails(admin().doc('documentUploadTickets/ticket1').get());
    await assertFails(user().doc('documentUploadQuotas/user1').get());
  });
});

describe('forum and overlay moderation reads', () => {
  beforeAll(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('forumPosts/approved-1').set({ title: 'Approved', status: 'approved', createdAt: new Date('2026-08-01') });
      await ctx.firestore().doc('forumPosts/pending-1').set({ title: 'Pending', status: 'pending', createdAt: new Date('2026-08-02') });
      await ctx.firestore().doc('overlays/published-1').set({ name: 'Published', published: true, createdAt: new Date('2026-08-01') });
      await ctx.firestore().doc('overlays/draft-1').set({ name: 'Draft', published: false, createdAt: new Date('2026-08-02') });
    });
  });

  it('exposes approved posts to everyone but hides pending posts from non-admins', async () => {
    await assertSucceeds(anon().doc('forumPosts/approved-1').get());
    await assertSucceeds(user().doc('forumPosts/approved-1').get());
    await assertSucceeds(admin().doc('forumPosts/approved-1').get());

    await assertFails(anon().doc('forumPosts/pending-1').get());
    await assertFails(user().doc('forumPosts/pending-1').get());
    await assertSucceeds(admin().doc('forumPosts/pending-1').get());
  });

  it('requires non-admins to constrain forum queries to approved posts', async () => {
    await assertSucceeds(user().collection('forumPosts').where('status', '==', 'approved').get());
    await assertSucceeds(anon().collection('forumPosts').where('status', '==', 'approved').get());
    // Unconstrained (or pending) queries could surface hidden posts, so they fail.
    await assertFails(user().collection('forumPosts').get());
    await assertFails(anon().collection('forumPosts').get());
    await assertFails(user().collection('forumPosts').where('status', '==', 'pending').get());
    // Admins may read the whole collection for moderation.
    await assertSucceeds(admin().collection('forumPosts').get());
  });

  it('exposes published overlays to everyone but hides drafts from non-admins', async () => {
    await assertSucceeds(anon().doc('overlays/published-1').get());
    await assertSucceeds(user().doc('overlays/published-1').get());
    await assertSucceeds(admin().doc('overlays/published-1').get());

    await assertFails(anon().doc('overlays/draft-1').get());
    await assertFails(user().doc('overlays/draft-1').get());
    await assertSucceeds(admin().doc('overlays/draft-1').get());
  });

  it('requires non-admins to constrain overlay queries to published overlays', async () => {
    await assertSucceeds(user().collection('overlays').where('published', '==', true).get());
    await assertSucceeds(anon().collection('overlays').where('published', '==', true).get());
    await assertFails(user().collection('overlays').get());
    await assertFails(anon().collection('overlays').get());
    await assertFails(user().collection('overlays').where('published', '==', false).get());
    await assertSucceeds(admin().collection('overlays').get());
  });
});

describe('event comment, poll, and vote collections', () => {
  it('keeps comments, polls, and votes server-owned', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('eventComments/c1').set({
        eventId: 'e1', body: 'Where do we park?', authorId: 'user1', anonymous: true, status: 'approved',
        createdAt: new Date(),
      });
      await ctx.firestore().doc('eventCommentReports/c1_user2').set({
        commentId: 'c1', reporterId: 'user2', reason: 'spam', createdAt: new Date(),
      });
      await ctx.firestore().doc('polls/p1').set({
        question: 'Pick a workday', status: 'published', options: [{ id: 'sat', label: 'Saturday', order: 0 }],
        tallies: { sat: 3 }, totalVotes: 3, createdAt: new Date(),
      });
      await ctx.firestore().doc('pollVotes/p1__u:user1').set({
        pollId: 'p1', userId: 'user1', optionId: 'sat', createdAt: new Date(), updatedAt: new Date(),
      });
    });

    // Reads: admins only. Members and visitors go through callables so
    // anonymity and result-visibility rules cannot be bypassed.
    await assertSucceeds(admin().doc('eventComments/c1').get());
    await assertFails(user().doc('eventComments/c1').get());
    await assertFails(anon().doc('eventComments/c1').get());
    await assertSucceeds(admin().collection('eventCommentReports').orderBy('createdAt', 'desc').get());
    await assertFails(other().doc('eventCommentReports/c1_user2').get());
    await assertSucceeds(admin().doc('polls/p1').get());
    await assertSucceeds(admin().collection('polls').orderBy('createdAt', 'desc').get());
    await assertFails(anon().doc('polls/p1').get());
    await assertFails(user().doc('polls/p1').get());
    await assertFails(user().doc('pollVotes/p1__u:user1').get());

    // Writes: denied for everyone, including admins.
    await assertFails(user().doc('eventComments/c2').set({ eventId: 'e1', body: 'hi' }));
    await assertFails(admin().doc('eventComments/c1').update({ body: 'edited' }));
    await assertFails(user().doc('polls/p1').update({ tallies: { sat: 999 } }));
    await assertFails(admin().doc('polls/p2').set({ question: 'Direct write' }));
    await assertFails(user().doc('pollVotes/p1__u:user1').set({ pollId: 'p1', optionId: 'sat' }));
  });
});

describe('notification collections', () => {
  const docs = {
    notificationSettings: 'user1',
    notificationTokens: 'tokenhash',
    notificationDigestItems: 'item1',
    notificationDispatches: 'reply_p1_r1',
    notificationConfig: 'email',
  };

  it('keeps preferences, push tokens, digest queue, and email settings away from every client', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('notificationSettings/user1').set({ uid: 'user1', events: { push: true, digest: false } });
      await db.doc('notificationTokens/tokenhash').set({ uid: 'user1', token: 'secret-device-token' });
      await db.doc('notificationDigestItems/item1').set({ uid: 'user1', topic: 'events', title: 'New event' });
      await db.doc('notificationDispatches/reply_p1_r1').set({ createdAt: new Date() });
      await db.doc('notificationConfig/email').set({ senderAddress: 'sender@example.com', digestEnabled: true });
    });

    for (const client of [anon(), user(), other(), passwordOnlyAdmin(), admin(), desktopAdmin()]) {
      for (const [collection, id] of Object.entries(docs)) {
        await assertFails(client.doc(`${collection}/${id}`).get());
        await assertFails(client.collection(collection).get());
        await assertFails(client.doc(`${collection}/${id}`).set({ uid: 'user2', forged: true }));
        await assertFails(client.doc(`${collection}/new`).set({ uid: 'user1' }));
        await assertFails(client.doc(`${collection}/${id}`).delete());
      }
    }
    // Even the owner cannot read their own token registrations or queued digest lines.
    await assertFails(user().collection('notificationTokens').where('uid', '==', 'user1').get());
    await assertFails(user().collection('notificationDigestItems').where('uid', '==', 'user1').get());
  });
});
