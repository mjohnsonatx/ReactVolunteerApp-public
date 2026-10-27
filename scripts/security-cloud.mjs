import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { OAuth2Client, GoogleAuth } from 'google-auth-library';
import {
  activePreviewDomainsFromChannels,
  synchronizeAuthorizedDomains,
  synchronizeStorageCors,
} from './preview-domain-policy.mjs';

const require = createRequire(import.meta.url);
const cliAuth = require('firebase-tools/lib/auth.js');
const cliApi = require('firebase-tools/lib/api.js');
const project = process.env.FIREBASE_PROJECT_ID || 'tillerystreettrail';
assert.ok(['tillerystreettrail', 'tillerystreettrail-dev'].includes(project), 'Unreviewed Firebase project');
const region = 'us-central1';
const bucket = `${project}.firebasestorage.app`;
const ids = ['data', 'identity', 'media', 'polls', 'appcheck', 'notify'];
// Notification Functions run as tsv-notify; these are their Cloud Run services.
const notifyServices = ['notifyforumactivity', 'notifynewevent', 'senddailydigest'];
const email = id => `tsv-${id}@${project}.iam.gserviceaccount.com`;
const member = id => `serviceAccount:${email(id)}`;
const customRole = `projects/${project}/roles/tsvAuthUsers`;
const serviceAccount = id => `projects/${project}/serviceAccounts/${email(id)}`;
const command = process.argv[2] || 'inspect';
const apply = process.argv.includes('--apply');
const account = cliAuth.getGlobalDefaultAccount();
assert.ok(process.env.GOOGLE_APPLICATION_CREDENTIALS || account?.tokens?.refresh_token, 'Authenticate to Google Cloud or Firebase first');
const client = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient()
  : new OAuth2Client(cliApi.clientId(), cliApi.clientSecret());
// Refresh in memory instead of using the CLI's cached access token. The CLI's
// expires_at field is not the OAuth client's expiry_date field.
// Tokens are never logged, passed as shell arguments, or saved.
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) client.setCredentials({ refresh_token: account.tokens.refresh_token });

async function request(url, method = 'GET', data) {
  try {
    return (await client.request({ url, method, data })).data;
  } catch (error) {
    const safe = new Error(`${method} ${new URL(url).pathname}: ${error.response?.status || error.code || 'failed'} ${error.response?.data?.error?.message || ''}`);
    safe.status = error.response?.status;
    throw safe;
  }
}
const iam = 'https://iam.googleapis.com/v1/';
const resource = `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`;
const projectNumber = (await request(resource)).projectNumber;
assert.match(projectNumber, /^\d+$/);
const compute = `${projectNumber}-compute@developer.gserviceaccount.com`;
const authUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
const appcheck = `https://firebaseappcheck.googleapis.com/v1/projects/${projectNumber}/services`;
async function getProjectPolicy() {
  return request(`${resource}:getIamPolicy`, 'POST', { options: { requestedPolicyVersion: 3 } });
}
function bind(policy, role, members, condition) {
  if (condition) policy.version = 3;
  policy.bindings ||= [];
  let binding = policy.bindings.find(b => b.role === role && JSON.stringify(b.condition) === JSON.stringify(condition));
  if (!binding) {
    binding = { role, members: [], ...(condition ? { condition } : {}) };
    policy.bindings.push(binding);
  }
  for (const m of members) if (!binding.members.includes(m)) binding.members.push(m);
}
async function provision() {
  for (const id of ids) {
    try { await request(`${iam}${serviceAccount(id)}`); }
    catch (error) {
      if (error.status !== 404) throw error;
      await request(`${iam}projects/${project}/serviceAccounts`, 'POST', {
        accountId: `tsv-${id}`, serviceAccount: { displayName: `Tillery ${id} Functions runtime` },
      });
    }
  }
  const role = {
    title: 'Tillery account lifecycle', description: 'Read, update, and delete Auth users; no project configuration or user creation.',
    stage: 'GA', includedPermissions: ['firebaseauth.users.get', 'firebaseauth.users.update', 'firebaseauth.users.delete'],
  };
  try {
    const existing = await request(`${iam}${customRole}`);
    assert.deepEqual([...existing.includedPermissions].sort(), [...role.includedPermissions].sort(), 'Existing custom role needs manual review');
  } catch (error) {
    if (error.status !== 404) throw error;
    await request(`${iam}projects/${project}/roles`, 'POST', { roleId: 'tsvAuthUsers', role });
  }
  const policy = await getProjectPolicy();
  bind(policy, 'roles/datastore.user', ['data', 'identity', 'media', 'polls', 'notify'].map(member));
  bind(policy, customRole, [member('identity')]);
  bind(policy, 'roles/firebaseauth.viewer', [member('appcheck'), member('notify')]);
  // The notify identity sends web push messages through FCM.
  bind(policy, 'roles/firebasecloudmessaging.admin', [member('notify')]);
  // Eventarc delivers the Firestore cleanup event as its explicit media identity.
  bind(policy, 'roles/eventarc.eventReceiver', [member('media'), member('notify')]);
  // Keep the CLI's default build identity, with narrowly scoped build access.
  bind(policy, 'roles/logging.logWriter', [`serviceAccount:${compute}`]);
  bind(policy, 'roles/storage.objectViewer', [`serviceAccount:${compute}`], {
    title: 'functions-build-sources',
    expression: `resource.type == 'storage.googleapis.com/Object' && (resource.name.startsWith('projects/_/buckets/gcf-v2-sources-${projectNumber}-') || resource.name.startsWith('projects/_/buckets/gcf-v2-uploads-${projectNumber}-') || resource.name.startsWith('projects/_/buckets/run-sources-${project}-'))`,
  });
  await request(`${resource}:setIamPolicy`, 'POST', { policy });
  const repository = `https://artifactregistry.googleapis.com/v1/projects/${project}/locations/${region}/repositories/gcf-artifacts`;
  const repoPolicy = await request(`${repository}:getIamPolicy`);
  bind(repoPolicy, 'roles/artifactregistry.writer', [`serviceAccount:${compute}`]);
  await request(`${repository}:setIamPolicy`, 'POST', { policy: repoPolicy });
  for (const name of ['cleanupEventImages', 'cleanupDocumentUploadOrphans']) {
    const runService = `https://run.googleapis.com/v2/projects/${project}/locations/${region}/services/${name.toLowerCase()}`;
    try {
      const runPolicy = await request(`${runService}:getIamPolicy`);
      bind(runPolicy, 'roles/run.invoker', [member('media')]);
      await request(`${runService}:setIamPolicy`, 'POST', { policy: runPolicy });
    } catch (error) {
      if (error.status !== 404) throw error;
      console.log(`${name} is not deployed yet; rerun provision after deploying Functions.`);
    }
  }
  // Notification services exist only after their first deploy; rerun provision then.
  for (const name of notifyServices) {
    const runService = `https://run.googleapis.com/v2/projects/${project}/locations/${region}/services/${name}`;
    try {
      const runPolicy = await request(`${runService}:getIamPolicy`);
      bind(runPolicy, 'roles/run.invoker', [member('notify')]);
      await request(`${runService}:setIamPolicy`, 'POST', { policy: runPolicy });
    } catch (error) {
      if (error.status !== 404) throw error;
      console.log(`${name} is not deployed yet; rerun provision after deploying the notification Functions.`);
    }
  }
  const bucketUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/iam`;
  const bucketPolicy = await request(bucketUrl);
  bind(bucketPolicy, 'roles/storage.objectAdmin', [member('identity'), member('media')]);
  await request(bucketUrl, 'PUT', bucketPolicy);
  const secretUrl = `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/POLL_VOTE_SALT`;
  const secretPolicy = await request(`${secretUrl}:getIamPolicy`);
  bind(secretPolicy, 'roles/secretmanager.secretAccessor', [member('polls')]);
  await request(`${secretUrl}:setIamPolicy`, 'POST', { policy: secretPolicy });
  const brevoSecretUrl = `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/BREVO_SMTP_KEY`;
  try {
    const brevoPolicy = await request(`${brevoSecretUrl}:getIamPolicy`);
    bind(brevoPolicy, 'roles/secretmanager.secretAccessor', [member('notify')]);
    await request(`${brevoSecretUrl}:setIamPolicy`, 'POST', { policy: brevoPolicy });
  } catch (error) {
    if (error.status !== 404) throw error;
    console.log('BREVO_SMTP_KEY does not exist yet; set it (docs/NOTIFICATIONS.md), then rerun provision.');
  }
  const signerUrl = `${iam}${serviceAccount('appcheck')}`;
  const signerPolicy = await request(`${signerUrl}:getIamPolicy`, 'POST', {});
  bind(signerPolicy, 'roles/iam.serviceAccountTokenCreator', [member('appcheck')]);
  await request(`${signerUrl}:setIamPolicy`, 'POST', { policy: signerPolicy });
  console.log('Provisioned six runtime accounts, scoped runtime permissions, and default-account build permissions. Editor has not been removed yet.');
}
async function functionsInventory() {
  const result = await request(`https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/${region}/functions?pageSize=1000`);
  assert.ok(!result.nextPageToken, 'Implement pagination before changing this larger project');
  return result.functions || [];
}
async function verifyFunctions() {
  const expected = require('../functions/lib/functions/src/index.js');
  const live = await functionsInventory();
  assert.equal(live.length, Object.keys(expected).length, 'Live/source function count differs');
  for (const [name, fn] of Object.entries(expected)) {
    const deployed = live.find(f => f.name.endsWith(`/${name}`));
    assert.ok(deployed, `${name} is not deployed`);
    assert.equal(deployed.state, 'ACTIVE', `${name} is not active`);
    const accountName = fn.__endpoint.serviceAccountEmail.replace(/@$/, `@${project}.iam.gserviceaccount.com`);
    assert.equal(deployed.serviceConfig.serviceAccountEmail, accountName, `${name} runtime identity differs`);
  }
  console.log(`Verified ${live.length} active Functions and their explicit runtime identities.`);
}
async function retireEditor() {
  await verifyFunctions();
  const live = await functionsInventory();
  for (const fn of live.filter(f => f.eventTrigger)) {
    const expected = notifyServices.includes(fn.name.split('/').pop().toLowerCase()) ? email('notify') : email('media');
    assert.equal(fn.eventTrigger.serviceAccountEmail, expected, 'Review trigger delivery before retiring the default identity');
  }
  const jobs = await request(`https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${region}/jobs`);
  assert.ok(!jobs.nextPageToken, 'Review paginated scheduler inventory');
  const expectedJobAccounts = { cleanupdocumentuploadorphans: email('media'), senddailydigest: email('notify') };
  for (const job of jobs.jobs || []) {
    const fn = Object.keys(expectedJobAccounts).find(name => job.httpTarget?.uri?.toLowerCase().includes(name));
    assert.ok(fn, `Review unexpected scheduler job ${job.name}`);
    assert.equal(job.httpTarget.oidcToken.serviceAccountEmail, expectedJobAccounts[fn], 'Scheduler identity has not migrated');
  }
  for (const name of ['cleanupeventimages', 'cleanupdocumentuploadorphans']) {
    const runPolicy = await request(`https://run.googleapis.com/v2/projects/${project}/locations/${region}/services/${name}:getIamPolicy`);
    assert.ok(runPolicy.bindings?.some(b => b.role === 'roles/run.invoker' && b.members.includes(member('media'))), `${name} must accept the media identity`);
  }
  for (const name of notifyServices) {
    const runPolicy = await request(`https://run.googleapis.com/v2/projects/${project}/locations/${region}/services/${name}:getIamPolicy`);
    assert.ok(runPolicy.bindings?.some(b => b.role === 'roles/run.invoker' && b.members.includes(member('notify'))), `${name} must accept the notify identity`);
  }
  // Confirm the prerequisite build grants before removing this exact role/member.
  const policy = await getProjectPolicy();
  assert.ok(policy.bindings.some(b => b.role === 'roles/logging.logWriter' && b.members.includes(`serviceAccount:${compute}`)));
  assert.ok(policy.bindings.some(b => b.role === 'roles/storage.objectViewer' && b.condition?.title === 'functions-build-sources' && b.members.includes(`serviceAccount:${compute}`)));
  const repoPolicy = await request(`https://artifactregistry.googleapis.com/v1/projects/${project}/locations/${region}/repositories/gcf-artifacts:getIamPolicy`);
  assert.ok(repoPolicy.bindings?.some(b => b.role === 'roles/artifactregistry.writer' && b.members.includes(`serviceAccount:${compute}`)));
  const retiredRoles = ['roles/editor', 'roles/eventarc.eventReceiver', 'roles/run.invoker'];
  for (const binding of policy.bindings) {
    if (retiredRoles.includes(binding.role)) binding.members = binding.members.filter(m => m !== `serviceAccount:${compute}`);
  }
  policy.bindings = policy.bindings.filter(b => b.members.length);
  await request(`${resource}:setIamPolicy`, 'POST', { policy });
  const verified = await getProjectPolicy();
  assert.ok(!verified.bindings.some(b => retiredRoles.includes(b.role) && b.members.includes(`serviceAccount:${compute}`)));
  const secretUrl = `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/POLL_VOTE_SALT`;
  const secretPolicy = await request(`${secretUrl}:getIamPolicy`);
  assert.ok(secretPolicy.bindings?.some(b => b.role === 'roles/secretmanager.secretAccessor' && b.members.includes(member('polls'))));
  for (const binding of secretPolicy.bindings) {
    if (binding.role === 'roles/secretmanager.secretAccessor') binding.members = binding.members.filter(m => m !== `serviceAccount:${compute}`);
  }
  secretPolicy.bindings = secretPolicy.bindings.filter(b => b.members.length);
  await request(`${secretUrl}:setIamPolicy`, 'POST', { policy: secretPolicy });
  const verifiedSecret = await request(`${secretUrl}:getIamPolicy`);
  assert.ok(!verifiedSecret.bindings?.some(b => b.members.includes(`serviceAccount:${compute}`)));
  console.log('Removed Editor, obsolete event/invocation roles, and poll-secret access from the default Compute build account; verified dedicated cleanup delivery and poll access.');
}
async function password() {
  const minPasswordLength = 15;
  const maxPasswordLength = 25;
  const config = await request(authUrl);
  const existing = config.passwordPolicyConfig || {};
  const strength = existing.passwordPolicyVersions?.[0]?.customStrengthOptions || {};
  const passwordPolicyConfig = {
    passwordPolicyEnforcementState: 'ENFORCE',
    // Preserve existing sign-in behavior; enforce the new policy for new/changed passwords.
    forceUpgradeOnSignin: existing.forceUpgradeOnSignin || false,
    passwordPolicyVersions: [{ customStrengthOptions: { ...strength, minPasswordLength, maxPasswordLength } }],
  };
  const result = await request(`${authUrl}?updateMask=passwordPolicyConfig`, 'PATCH', { passwordPolicyConfig });
  assert.equal(result.passwordPolicyConfig.passwordPolicyEnforcementState, 'ENFORCE');
  const updatedStrength = result.passwordPolicyConfig.passwordPolicyVersions[0].customStrengthOptions;
  assert.equal(updatedStrength.minPasswordLength, minPasswordLength);
  assert.equal(updatedStrength.maxPasswordLength, maxPasswordLength);
  console.log(`Verified enforced server password length of ${minPasswordLength}-${maxPasswordLength} characters.`);
}
async function domainState() {
  const channels = await request(`https://firebasehosting.googleapis.com/v1beta1/projects/${project}/sites/${project}/channels`);
  assert.ok(!channels.nextPageToken, 'Review paginated channel inventory');
  const activePreviewDomains = activePreviewDomainsFromChannels(channels.channels, project);
  const config = await request(authUrl);
  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}`;
  const storageConfig = await request(`${url}?fields=cors`);
  return { activePreviewDomains, config, storageConfig, url };
}
async function inspectDomains() {
  const { activePreviewDomains, config, storageConfig } = await domainState();
  console.log(JSON.stringify({
    activePreviewDomains,
    authorizedPreviewDomains: (config.authorizedDomains || [])
      .filter(domain => domain.startsWith(`${project}--`) && domain.endsWith('.web.app'))
      .sort(),
    storageCors: storageConfig.cors || [],
  }, null, 2));
}
async function documentFiles() {
  const files = [];
  const seenPageTokens = new Set();
  let pageToken = '';
  do {
    assert.ok(!seenPageTokens.has(pageToken), 'Storage returned a repeated page token');
    seenPageTokens.add(pageToken);
    const params = new URLSearchParams({
      prefix: 'documents/',
      maxResults: '1000',
      fields: 'items(name,size,contentType,metadata),nextPageToken',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await request(`https://storage.googleapis.com/storage/v1/b/${bucket}/o?${params}`);
    for (const item of result.items || []) {
      files.push({
        name: item.name,
        sizeBytes: Number(item.size || 0),
        contentType: item.contentType || '',
        role: item.metadata?.role || '',
        published: item.metadata?.published || '',
      });
    }
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  return files;
}
async function inspectDocumentFiles() {
  console.log(JSON.stringify({ files: await documentFiles() }, null, 2));
}
function firestoreValue(value = {}) {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('stringValue' in value) return value.stringValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(firestoreValue);
  if ('mapValue' in value) return Object.fromEntries(
    Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, firestoreValue(item)]),
  );
  return undefined;
}
async function documentRecords() {
  const fields = [
    'title', 'name', 'type', 'size', 'sizeBytes', 'visibility', 'status', 'published',
    'storagePath', 'thumbnailPath', 'userId',
  ];
  const rows = await request(
    `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`,
    'POST',
    {
      structuredQuery: {
        select: { fields: fields.map(fieldPath => ({ fieldPath })) },
        from: [{ collectionId: 'documents' }],
        limit: 100,
      },
    },
  );
  return rows.flatMap(row => row.document ? [{
    id: row.document.name.split('/').pop(),
    updateTime: row.document.updateTime,
    ...Object.fromEntries(fields.map(field => [field, firestoreValue(row.document.fields?.[field])])),
  }] : []);
}
async function inspectDocumentRecords() {
  console.log(JSON.stringify({ documents: await documentRecords() }, null, 2));
}
async function inspectDocumentSanitizationLogs() {
  const fields = [
    'type', 'action', 'summary', 'resourceType', 'resourceId', 'actorUid', 'actorEmail',
    'actorName', 'surface', 'tags', 'status', 'createdAt', 'details',
  ];
  const rows = await request(
    `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`,
    'POST',
    {
      structuredQuery: {
        select: { fields: fields.map(fieldPath => ({ fieldPath })) },
        from: [{ collectionId: 'adminAuditLogs' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'action' },
            op: 'EQUAL',
            value: { stringValue: 'document.sanitize' },
          },
        },
        limit: 10,
      },
    },
  );
  const logs = rows.flatMap(row => row.document ? [{
    id: row.document.name.split('/').pop(),
    ...Object.fromEntries(fields.map(field => [field, firestoreValue(row.document.fields?.[field])])),
  }] : []);
  console.log(JSON.stringify({ logs }, null, 2));
}
async function inspectCliOperator() {
  const operatorEmail = account.user?.email || account.email;
  assert.ok(operatorEmail, 'Firebase CLI account email is unavailable');
  const result = await request(
    `https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`,
    'POST',
    { email: [operatorEmail] },
  );
  const users = (result.users || []).map(user => ({
    localId: user.localId,
    email: user.email,
    emailVerified: user.emailVerified === true,
    displayName: user.displayName || '',
    customClaims: user.customAttributes ? JSON.parse(user.customAttributes) : {},
  }));
  console.log(JSON.stringify({ operatorEmail, users }, null, 2));
}
function responseHeader(headers, name) {
  if (typeof headers?.get === 'function') return headers.get(name) || '';
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return Array.isArray(entry?.[1]) ? entry[1].join(', ') : String(entry?.[1] || '');
}
async function inspectDocumentCors() {
  const { activePreviewDomains } = await domainState();
  assert.ok(activePreviewDomains.length > 0, 'No active preview domains to verify');
  const files = (await documentFiles()).filter(file => file.contentType === 'application/pdf');
  assert.ok(files.length > 0, 'No PDF document objects to verify');
  const checks = [];
  for (const domain of activePreviewDomains) {
    const origin = `https://${domain}`;
    for (const file of files) {
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(file.name)}?alt=media`;
      const response = await client.request({
        url,
        method: 'GET',
        headers: { Origin: origin, Range: 'bytes=0-0' },
        responseType: 'arraybuffer',
      });
      checks.push({
        name: file.name,
        origin,
        status: response.status,
        allowOrigin: responseHeader(response.headers, 'access-control-allow-origin'),
        contentRange: responseHeader(response.headers, 'content-range'),
      });
    }
  }
  console.log(JSON.stringify({ checks }, null, 2));
}
async function domains() {
  const { activePreviewDomains, config, storageConfig, url } = await domainState();
  const { domains: authorizedDomains, obsolete } = synchronizeAuthorizedDomains(
    config.authorizedDomains,
    activePreviewDomains,
    project,
  );
  if (JSON.stringify(authorizedDomains) !== JSON.stringify(config.authorizedDomains || [])) {
    await request(`${authUrl}?updateMask=authorizedDomains`, 'PATCH', { authorizedDomains });
  }
  const cors = synchronizeStorageCors(storageConfig.cors, activePreviewDomains, project);
  assert.ok(cors.length > 0, 'Storage CORS has no policy to synchronize; review it before adding one');
  await request(`${url}?fields=cors`, 'PATCH', { cors });
  console.log(`Synchronized ${activePreviewDomains.length} active preview domain(s); removed ${obsolete.length} expired preview domain(s).`);
}
async function enforceAppCheck() {
  assert.ok(process.argv.includes('--verified-browser'), 'First verify real browser attestation, desktop sign-in, and App Check metrics; then pass --verified-browser');
  for (const service of ['identitytoolkit.googleapis.com', 'firestore.googleapis.com', 'firebasestorage.googleapis.com']) {
    const name = `projects/${projectNumber}/services/${service}`;
    const result = await request(`${appcheck}/${service}?updateMask=enforcementMode`, 'PATCH', { name, enforcementMode: 'ENFORCED' });
    assert.equal(result.enforcementMode, 'ENFORCED');
    console.log(`${service}: ENFORCED`);
  }
}
async function inspectDelivery() {
  const live = await functionsInventory();
  const jobs = await request(`https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${region}/jobs`);
  assert.ok(!jobs.nextPageToken, 'Review paginated scheduler inventory');
  console.log(JSON.stringify({
    triggers: live.filter(f => f.eventTrigger).map(f => ({ function: f.name.split('/').pop(), account: f.eventTrigger.serviceAccountEmail, trigger: f.eventTrigger.trigger })),
    jobs: (jobs.jobs || []).map(j => ({ name: j.name.split('/').pop(), uri: j.httpTarget?.uri, account: j.httpTarget?.oidcToken?.serviceAccountEmail })),
    cleanupServicePolicies: await Promise.all(['cleanupeventimages', 'cleanupdocumentuploadorphans', ...notifyServices].map(async name => ({
      name, policy: await request(`https://run.googleapis.com/v2/projects/${project}/locations/${region}/services/${name}:getIamPolicy`),
    }))),
    secretPolicy: await request(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets/POLL_VOTE_SALT:getIamPolicy`),
  }, null, 2));
}
async function inspectAppCheck() {
  const apps = await request(`https://firebase.googleapis.com/v1beta1/projects/${project}/webApps`);
  assert.ok(!apps.nextPageToken, 'Review paginated web app inventory');
  const configurations = [];
  for (const app of apps.apps || []) {
    for (const provider of ['recaptchaV3Config', 'recaptchaEnterpriseConfig']) {
      try {
        const config = await request(`https://firebaseappcheck.googleapis.com/v1/projects/${projectNumber}/apps/${app.appId}/${provider}`);
        configurations.push({ appId: app.appId, provider, tokenTtl: config.tokenTtl || 'default', minValidScore: config.minValidScore, riskThreshold: config.riskThreshold });
      } catch (error) {
        if (error.status !== 404) throw error;
      }
    }
  }
  console.log(JSON.stringify(configurations, null, 2));
}
async function inspectDatabase() {
  const result = await request(`https://firebasedatabase.googleapis.com/v1beta/projects/${projectNumber}/locations/-/instances`);
  assert.ok(!result.nextPageToken, 'Review paginated Realtime Database inventory');
  const instances = [];
  for (const instance of result.instances || []) {
    const rules = await request(`${instance.databaseUrl}/.settings/rules.json`);
    instances.push({ name: instance.name, state: instance.state, rules });
  }
  console.log(JSON.stringify({ instances }, null, 2));
}
async function inspectResourcePolicies() {
  const services = {};
  for (const service of ['identitytoolkit.googleapis.com', 'firestore.googleapis.com', 'firebasestorage.googleapis.com']) {
    try {
      const result = await request(`${appcheck}/${service}/resourcePolicies?pageSize=100`);
      assert.ok(!result.nextPageToken, 'Review paginated resource-policy inventory');
      services[service] = result.resourcePolicies || [];
    } catch (error) {
      if (error.status !== 400) throw error;
      services[service] = error.message;
    }
  }
  console.log(JSON.stringify(services, null, 2));
}
async function inspectMetrics() {
  const monitoring = `https://monitoring.googleapis.com/v3/projects/${project}`;
  const descriptors = await request(`${monitoring}/metricDescriptors?${new URLSearchParams({ filter: 'metric.type = starts_with("firebaseappcheck.googleapis.com/")', pageSize: '1000' })}`);
  assert.ok(!descriptors.nextPageToken, 'Review paginated metric descriptor inventory');
  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const summaries = [];
  for (const descriptor of descriptors.metricDescriptors || []) {
    const series = await request(`${monitoring}/timeSeries?${new URLSearchParams({
      filter: `metric.type = "${descriptor.type}"`, 'interval.startTime': startTime, 'interval.endTime': endTime, pageSize: '1000',
    })}`);
    assert.ok(!series.nextPageToken, 'Review paginated App Check traffic before enforcement');
    summaries.push({ metric: descriptor.type, traffic: (series.timeSeries || []).map(s => ({
      resource: s.resource, labels: s.metric.labels,
      count: (s.points || []).reduce((sum, point) => sum + Number(point.value.int64Value || point.value.doubleValue || 0), 0),
      latest: s.points?.[0]?.interval?.endTime,
    })) });
  }
  console.log(JSON.stringify({ startTime, endTime, summaries }, null, 2));
}
async function inspect() {
  const [live, config, services, policy] = await Promise.all([
    functionsInventory(), request(authUrl), request(appcheck), getProjectPolicy(),
  ]);
  console.log(JSON.stringify({
    project, functions: live.length,
    profileInitializer: live.some(f => f.name.endsWith('/initializeAccountProfile')),
    runtimeAccounts: [...new Set(live.map(f => f.serviceConfig.serviceAccountEmail))],
    computeRoles: policy.bindings.filter(b => b.members.includes(`serviceAccount:${compute}`)).map(b => ({ role: b.role, condition: b.condition?.title })),
    passwordPolicy: config.passwordPolicyConfig || 'default', authorizedDomains: config.authorizedDomains,
    appCheck: services.services?.map(s => ({ service: s.name.split('/').pop(), enforcement: s.enforcementMode })),
  }, null, 2));
}
const actions = { provision, password, domains, 'inspect-domains': inspectDomains, 'inspect-document-files': inspectDocumentFiles, 'inspect-document-records': inspectDocumentRecords, 'inspect-document-sanitization-logs': inspectDocumentSanitizationLogs, 'inspect-cli-operator': inspectCliOperator, 'inspect-document-cors': inspectDocumentCors, 'verify-functions': verifyFunctions, 'retire-editor': retireEditor, 'enforce-appcheck': enforceAppCheck, 'inspect-delivery': inspectDelivery, 'inspect-appcheck': inspectAppCheck, 'inspect-metrics': inspectMetrics, 'inspect-database': inspectDatabase, 'inspect-resource-policies': inspectResourcePolicies, inspect };
assert.ok(actions[command], `Unknown command: ${command}`);
if (!['inspect', 'inspect-domains', 'inspect-document-files', 'inspect-document-records', 'inspect-document-sanitization-logs', 'inspect-cli-operator', 'inspect-document-cors', 'inspect-delivery', 'inspect-appcheck', 'inspect-metrics', 'inspect-database', 'inspect-resource-policies', 'verify-functions'].includes(command) && !apply) {
  console.log(`Plan: ${command} for ${project}. Pass --apply to perform the reviewed change.`);
} else {
  try { await actions[command](); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
