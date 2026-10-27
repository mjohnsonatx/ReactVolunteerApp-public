import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const functions = require('../functions/lib/functions/src/index.js');
const { runtimeIdentity } = require('../functions/lib/functions/src/lib/runtimeIdentity.js');
const { NOTIFICATION_LEASE_MS } = require('../functions/lib/functions/src/lib/notificationLease.js');
const identityFunctions = new Set([
  'createAccount', 'initializeAccountProfile', 'updateAccountProfile',
  'syncUserEmail', 'deleteOwnAccountData', 'adminDeleteUserData',
]);
const mediaFunctions = new Set([
  'listPublicDocuments', 'listAdminStorageObjects', 'createDocumentUploadTicket', 'createDocumentRecord',
  'createAdminDocumentRecord', 'setDocumentStatus', 'toggleDocumentPublished',
  'setAdminStorageObjectPublished', 'deleteDocumentRecord', 'deleteOwnDocument', 'createEventImageUploadTicket',
  'attachEventImage', 'updateEventImage', 'deleteEventImage',
  'approveOverlayUpload', 'rejectOverlayUpload', 'deleteOverlayUpload',
  'cleanupEventImages', 'cleanupDocumentUploadOrphans',
]);
const secretFunctions = new Set([
  'listPolls', 'getPoll', 'getPollResults', 'listPublicPollVotes', 'castPollVote',
]);
// Notification delivery sends push messages and email; only these Functions
// run as the notify identity, and only the email ones bind the Brevo key.
const notifyFunctions = new Set([
  'notifyForumActivity', 'notifyNewEvent', 'sendDailyDigest',
  'getEmailDeliverySettings', 'saveEmailDeliverySettings', 'sendTestEmail',
]);
const emailSecretFunctions = new Set(['sendDailyDigest', 'getEmailDeliverySettings', 'sendTestEmail']);
for (const [name, fn] of Object.entries(functions)) {
  const endpoint = fn.__endpoint;
  assert.ok(endpoint, `${name} is missing its deployment metadata`);
  const expected = ['issueDesktopAppCheckToken', 'issueDesktopSignInToken'].includes(name) ? runtimeIdentity.appCheck
    : identityFunctions.has(name) ? runtimeIdentity.identity
      : mediaFunctions.has(name) ? runtimeIdentity.media
        : secretFunctions.has(name) ? runtimeIdentity.polls
          : notifyFunctions.has(name) ? runtimeIdentity.notify : runtimeIdentity.data;
  assert.equal(endpoint.serviceAccountEmail, expected, `${name} runtime identity`);
  const secrets = endpoint.secretEnvironmentVariables || [];
  const expectedSecret = secretFunctions.has(name) ? 'POLL_VOTE_SALT'
    : emailSecretFunctions.has(name) && process.env.WATERSHED_EMAIL_ENABLED === 'true' ? 'BREVO_SMTP_KEY' : null;
  assert.equal(secrets.length, expectedSecret ? 1 : 0, `${name} secret isolation`);
  if (expectedSecret) assert.equal(secrets[0].key, expectedSecret);
}
assert.equal(Object.keys(functions).length, 84, 'Review the inventory when adding a function');
for (const name of ['notifyForumActivity', 'notifyNewEvent', 'sendDailyDigest']) {
  const endpoint = functions[name].__endpoint;
  assert.ok(endpoint.timeoutSeconds > 0 && endpoint.timeoutSeconds * 1000 < NOTIFICATION_LEASE_MS,
    `${name} must time out before another worker can reclaim its notification lease`);
  if (endpoint.eventTrigger) assert.equal(endpoint.eventTrigger.retry, true, `${name} must retry failed dispatches`);
}
console.log('Verified explicit runtime identities and secret isolation for all 84 Functions.');
