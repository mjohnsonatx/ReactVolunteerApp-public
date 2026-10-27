import { describe, it, beforeAll, afterAll } from 'vitest';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

let env;
const firestorePort = Number(process.env.FIRESTORE_EMULATOR_PORT || 8080);
const storagePort = Number(process.env.FIREBASE_STORAGE_EMULATOR_PORT || 9199);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-watershed',
    firestore: {
      host: '127.0.0.1',
      port: firestorePort,
      rules: readFileSync(new URL('../../../firebase_rules/firestore.rules', import.meta.url), 'utf8'),
    },
    storage: {
      host: '127.0.0.1',
      port: storagePort,
      rules: readFileSync(new URL('../../../firebase_rules/storage.rules', import.meta.url), 'utf8'),
    },
  });
});

afterAll(() => env.cleanup());

const adminClaims = {
  admin: true,
  email_verified: true,
  firebase: { sign_in_second_factor: 'totp' },
};
const adminStorage = () => env.authenticatedContext('admin1', adminClaims).storage();
const passwordOnlyAdminStorage = () => env.authenticatedContext('admin-password-only', {
  admin: true,
  email_verified: true,
}).storage();
const userStorage = () => env.authenticatedContext('user1', { email_verified: true }).storage();
const unverifiedStorage = () => env.authenticatedContext('user1', { email_verified: false }).storage();
const otherStorage = () => env.authenticatedContext('user2').storage();
const anonStorage = () => env.unauthenticatedContext().storage();

const pdf = new Uint8Array([37, 80, 68, 70]);
const jpeg = new Uint8Array([255, 216, 255, 224]);
const text = new Uint8Array([104, 101, 108, 108, 111]);

async function seedDocumentTicket(options: {
  ticketId: string;
  userId?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  wantsThumbnail?: boolean;
  thumbnailFileName?: string;
  expiresAt?: Date;
}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`documentUploadTickets/${options.ticketId}`).set({
      userId: options.userId || 'user1',
      fileName: options.fileName,
      contentType: options.contentType,
      sizeBytes: options.sizeBytes,
      wantsThumbnail: options.wantsThumbnail === true,
      thumbnailFileName: options.thumbnailFileName || '',
      status: 'issued',
      expiresAt: options.expiresAt || new Date(Date.now() + 60_000),
    });
  });
}

describe('document storage rules', () => {
  it('allows users to upload their own unpublished documents', async () => {
    const ticketId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    await seedDocumentTicket({ ticketId, fileName: `${ticketId}.pdf`, contentType: 'application/pdf', sizeBytes: pdf.length });
    const ref = userStorage().ref(`documents/user1/${ticketId}.pdf`);
    await assertSucceeds(ref.put(pdf, {
      contentType: 'application/pdf',
      customMetadata: { published: 'false', ticketId, role: 'document' },
    }));
  });

  it('rejects missing tickets, anonymous, cross-user, public, and unsupported document uploads', async () => {
    const ticketId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    await seedDocumentTicket({ ticketId, fileName: `${ticketId}.pdf`, contentType: 'application/pdf', sizeBytes: pdf.length });
    await assertFails(userStorage().ref('documents/user1/no-ticket.pdf').put(pdf, {
      contentType: 'application/pdf',
      customMetadata: { published: 'false' },
    }));
    await assertFails(anonStorage().ref(`documents/user1/${ticketId}.pdf`).put(pdf, {
      contentType: 'application/pdf',
      customMetadata: { published: 'false', ticketId, role: 'document' },
    }));
    await assertFails(unverifiedStorage().ref(`documents/user1/${ticketId}.pdf`).put(pdf, {
      contentType: 'application/pdf',
      customMetadata: { published: 'false', ticketId, role: 'document' },
    }));
    await assertFails(userStorage().ref(`documents/user2/${ticketId}.pdf`).put(pdf, {
      contentType: 'application/pdf',
      customMetadata: { published: 'false', ticketId, role: 'document' },
    }));
    await assertFails(userStorage().ref(`documents/user1/${ticketId}.pdf`).put(pdf, {
      contentType: 'application/pdf',
      customMetadata: { published: 'true', ticketId, role: 'document' },
    }));
    await assertFails(userStorage().ref(`documents/user1/${ticketId}.pdf`).put(text, {
      contentType: 'text/plain',
      customMetadata: { published: 'false', ticketId, role: 'document' },
    }));
  });

  it('binds uploads to the ticket size and expiration and separately caps thumbnails', async () => {
    const ticketId = 'cccccccccccccccccccccccc';
    await seedDocumentTicket({
      ticketId,
      fileName: `${ticketId}.pdf`,
      contentType: 'application/pdf',
      sizeBytes: pdf.length,
      wantsThumbnail: true,
      thumbnailFileName: `${ticketId}_thumb.jpg`,
    });
    const metadata = { published: 'false', ticketId, role: 'document' };
    await assertFails(userStorage().ref(`documents/user1/${ticketId}.pdf`).put(new Uint8Array([...pdf, 0]), {
      contentType: 'application/pdf', customMetadata: metadata,
    }));
    await assertSucceeds(userStorage().ref(`documents/user1/${ticketId}_thumb.jpg`).put(jpeg, {
      contentType: 'image/jpeg',
      customMetadata: { published: 'false', ticketId, role: 'thumbnail' },
    }));

    const expiredId = 'dddddddddddddddddddddddd';
    await seedDocumentTicket({
      ticketId: expiredId,
      fileName: `${expiredId}.pdf`,
      contentType: 'application/pdf',
      sizeBytes: pdf.length,
      expiresAt: new Date(Date.now() - 60_000),
    });
    await assertFails(userStorage().ref(`documents/user1/${expiredId}.pdf`).put(pdf, {
      contentType: 'application/pdf',
      customMetadata: { published: 'false', ticketId: expiredId, role: 'document' },
    }));
  });

  it('limits document reads to owners, admins, or published files', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref('documents/user1/private.pdf').put(pdf, {
        contentType: 'application/pdf',
        customMetadata: { published: 'false' },
      });
      await ctx.storage().ref('documents/user1/public.pdf').put(pdf, {
        contentType: 'application/pdf',
        customMetadata: { published: 'true' },
      });
    });

    await assertSucceeds(userStorage().ref('documents/user1/private.pdf').getMetadata());
    await assertSucceeds(adminStorage().ref('documents/user1/private.pdf').getMetadata());
    await assertFails(passwordOnlyAdminStorage().ref('documents/user1/private.pdf').getMetadata());
    await assertFails(otherStorage().ref('documents/user1/private.pdf').getMetadata());
    await assertSucceeds(anonStorage().ref('documents/user1/public.pdf').getMetadata());
  });

  it('does not expose malformed objects merely because their published metadata is true', async () => {
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref('documents/user1/not-a-document.txt').put(text, {
        contentType: 'text/plain',
        customMetadata: { published: 'true' },
      });
      await ctx.storage().ref('documents/user1/oversized.pdf').put(oversized, {
        contentType: 'application/pdf',
        customMetadata: { published: 'true' },
      });
    });

    await assertFails(anonStorage().ref('documents/user1/not-a-document.txt').getMetadata());
    await assertFails(anonStorage().ref('documents/user1/oversized.pdf').getMetadata());
    // Owners and admins retain access so malformed legacy objects can be
    // inspected and cleaned up safely.
    await assertSucceeds(userStorage().ref('documents/user1/not-a-document.txt').getMetadata());
    await assertSucceeds(adminStorage().ref('documents/user1/oversized.pdf').getMetadata());
  });

  it('allows admins to publish documents through metadata updates', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref('documents/user1/to-publish.pdf').put(pdf, {
        contentType: 'application/pdf',
        customMetadata: { published: 'false' },
      });
    });

    await assertFails(userStorage().ref('documents/user1/to-publish.pdf').updateMetadata({
      customMetadata: { published: 'true' },
    }));
    await assertSucceeds(adminStorage().ref('documents/user1/to-publish.pdf').updateMetadata({
      customMetadata: { published: 'true' },
    }));
  });

  it('prevents owners from deleting published documents while preserving private cleanup', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref('documents/user1/private-delete.pdf').put(pdf, {
        contentType: 'application/pdf',
        customMetadata: { published: 'false' },
      });
      await ctx.storage().ref('documents/user1/published-delete.pdf').put(pdf, {
        contentType: 'application/pdf',
        customMetadata: { published: 'true' },
      });
    });

    await assertSucceeds(userStorage().ref('documents/user1/private-delete.pdf').delete());
    await assertFails(userStorage().ref('documents/user1/published-delete.pdf').delete());
    await assertSucceeds(adminStorage().ref('documents/user1/published-delete.pdf').delete());
  });
});

describe('site content profile image storage rules', () => {
  it('allows admins to upload public profile images under the expected path', async () => {
    await assertSucceeds(adminStorage().ref('siteContent/profile_123_jane.jpg').put(jpeg, {
      contentType: 'image/jpeg',
    }));
    await assertSucceeds(anonStorage().ref('siteContent/profile_123_jane.jpg').getMetadata());
  });

  it('rejects non-admin, unexpected path, and unsupported profile image writes', async () => {
    await assertFails(userStorage().ref('siteContent/profile_123_jane.jpg').put(jpeg, {
      contentType: 'image/jpeg',
    }));
    await assertFails(adminStorage().ref('siteContent/banner_123_jane.jpg').put(jpeg, {
      contentType: 'image/jpeg',
    }));
    await assertFails(adminStorage().ref('siteContent/profile_123_jane.gif').put(text, {
      contentType: 'image/gif',
    }));
  });

  it('does not publicly expose oversized or malformed profile-image objects', async () => {
    const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref('siteContent/profile_oversized.jpg').put(oversized, { contentType: 'image/jpeg' });
      await ctx.storage().ref('siteContent/profile_wrong_type.jpg').put(text, { contentType: 'text/plain' });
      await ctx.storage().ref('siteContent/banner_valid.jpg').put(jpeg, { contentType: 'image/jpeg' });
    });

    await assertFails(anonStorage().ref('siteContent/profile_oversized.jpg').getMetadata());
    await assertFails(anonStorage().ref('siteContent/profile_wrong_type.jpg').getMetadata());
    await assertFails(anonStorage().ref('siteContent/banner_valid.jpg').getMetadata());
  });
});

describe('event image storage rules', () => {
  const png = new Uint8Array([137, 80, 78, 71]);
  const webp = new Uint8Array([82, 73, 70, 70]);
  const exactLimit = new Uint8Array(5 * 1024 * 1024);
  const big = new Uint8Array(5 * 1024 * 1024 + 1);

  it('lets admins upload jpeg, png, and webp event images under the scoped path', async () => {
    await assertSucceeds(adminStorage().ref('events/event1/abcdef123456.jpg').put(jpeg, {
      contentType: 'image/jpeg',
    }));
    await assertSucceeds(adminStorage().ref('events/event1/abcdef123457.png').put(png, {
      contentType: 'image/png',
    }));
    await assertSucceeds(adminStorage().ref('events/event1/abcdef123458.webp').put(webp, {
      contentType: 'image/webp',
    }));
    await assertSucceeds(adminStorage().ref('events/event1/abcdef123456_thumb.jpg').put(jpeg, {
      contentType: 'image/jpeg',
    }));
    await assertSucceeds(adminStorage().ref('events/event1/exactly5mb12.jpg').put(exactLimit, {
      contentType: 'image/jpeg',
    }));
  });

  it('lets anyone read valid event images', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref('events/event1/readable12345.jpg').put(jpeg, { contentType: 'image/jpeg' });
    });
    await assertSucceeds(anonStorage().ref('events/event1/readable12345.jpg').getMetadata());
    await assertSucceeds(userStorage().ref('events/event1/readable12345.jpg').getMetadata());
  });

  it('does not publicly expose malformed objects placed under the event prefix', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref('events/event1/not-image12345.gif').put(text, { contentType: 'image/gif' });
      await ctx.storage().ref('events/bad event/readable12345.jpg').put(jpeg, { contentType: 'image/jpeg' });
      await ctx.storage().ref('events/event1/bad name.jpg').put(jpeg, { contentType: 'image/jpeg' });
      await ctx.storage().ref('events/event1/oversized123.jpg').put(big, { contentType: 'image/jpeg' });
    });

    await assertFails(anonStorage().ref('events/event1/not-image12345.gif').getMetadata());
    await assertFails(anonStorage().ref('events/bad event/readable12345.jpg').getMetadata());
    await assertFails(anonStorage().ref('events/event1/bad name.jpg').getMetadata());
    await assertFails(anonStorage().ref('events/event1/oversized123.jpg').getMetadata());
  });

  it('rejects non-admin uploads, wrong types, oversized files, and bad names', async () => {
    await assertFails(userStorage().ref('events/event1/aaaaaa111111.jpg').put(jpeg, {
      contentType: 'image/jpeg',
    }));
    await assertFails(anonStorage().ref('events/event1/aaaaaa111112.jpg').put(jpeg, {
      contentType: 'image/jpeg',
    }));
    await assertFails(adminStorage().ref('events/event1/aaaaaa111113.gif').put(text, {
      contentType: 'image/gif',
    }));
    await assertFails(adminStorage().ref('events/event1/aaaaaa111114.pdf').put(pdf, {
      contentType: 'application/pdf',
    }));
    await assertFails(adminStorage().ref('events/event1/Bad Name.jpg').put(jpeg, {
      contentType: 'image/jpeg',
    }));
    await assertFails(adminStorage().ref('events/event1/toobig123456.jpg').put(big, {
      contentType: 'image/jpeg',
    }));
  });

  it('keeps deletes admin-only', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref('events/event1/deleteme12345.jpg').put(jpeg, { contentType: 'image/jpeg' });
    });
    await assertFails(userStorage().ref('events/event1/deleteme12345.jpg').delete());
    await assertSucceeds(adminStorage().ref('events/event1/deleteme12345.jpg').delete());
  });
});

describe('background storage rules', () => {
  it('keeps valid backgrounds public and mutations admin-only', async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const path = 'backgrounds/trail-map.png';

    await assertSucceeds(adminStorage().ref(path).put(png, { contentType: 'image/png' }));
    await assertSucceeds(anonStorage().ref(path).getMetadata());
    await assertFails(userStorage().ref('backgrounds/user-map.png').put(png, { contentType: 'image/png' }));
    await assertFails(adminStorage().ref('backgrounds/readme.txt').put(text, { contentType: 'text/plain' }));
    // Regression: delete requests have no request.resource and must not be
    // evaluated by the create/update size and MIME checks.
    await assertFails(userStorage().ref(path).delete());
    await assertSucceeds(adminStorage().ref(path).delete());
  });

  it('does not publicly expose malformed background objects', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref('backgrounds/readme.txt').put(text, { contentType: 'text/plain' });
    });
    await assertFails(anonStorage().ref('backgrounds/readme.txt').getMetadata());
  });
});
