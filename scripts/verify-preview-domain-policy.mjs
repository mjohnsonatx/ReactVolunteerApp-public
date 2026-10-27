import assert from 'node:assert/strict';
import {
  activePreviewDomainsFromChannels,
  isPreviewDomain,
  synchronizeAuthorizedDomains,
  synchronizeStorageCors,
} from './preview-domain-policy.mjs';

const project = 'tillerystreettrail';
const devDomain = 'tillerystreettrail--dev-n7e64nsi.web.app';
const reviewDomain = 'tillerystreettrail--review-abc123.web.app';
const expiredDomain = 'tillerystreettrail--expired-old.web.app';

assert.equal(isPreviewDomain(devDomain, project), true);
assert.equal(isPreviewDomain('tillerystreettrail.web.app', project), false);
assert.deepEqual(activePreviewDomainsFromChannels([
  { url: `https://${reviewDomain}` },
  { url: 'not a URL' },
  { url: `https://${devDomain}` },
  { url: `https://${devDomain}` },
  { url: 'https://tillerystreettrail.web.app' },
], project), [devDomain, reviewDomain]);

const auth = synchronizeAuthorizedDomains([
  'localhost',
  'tillerystreettrail.web.app',
  expiredDomain,
  devDomain,
], [devDomain, reviewDomain], project);
assert.deepEqual(auth, {
  domains: ['localhost', 'tillerystreettrail.web.app', devDomain, reviewDomain],
  obsolete: [expiredDomain],
});

const cors = synchronizeStorageCors([{
  origin: [
    'https://tillerystreettrail.web.app',
    `https://${expiredDomain}`,
    '*',
  ],
  method: ['GET'],
  responseHeader: ['Content-Type'],
  maxAgeSeconds: 3600,
}], [devDomain, reviewDomain], project);
assert.deepEqual(cors, [{
  origin: [
    'https://tillerystreettrail.web.app',
    '*',
    `https://${devDomain}`,
    `https://${reviewDomain}`,
  ],
  method: ['GET'],
  responseHeader: ['Content-Type'],
  maxAgeSeconds: 3600,
}]);

console.log('Preview-domain policy verification passed.');
