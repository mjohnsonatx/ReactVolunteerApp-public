import assert from 'node:assert/strict';
import https from 'node:https';
import { spawnSync } from 'node:child_process';

// Operator-run bootstrap, never a CI step. Every grant is confined to this project.
const project = 'tillerystreettrail-dev';
const number = '274454283920';
const deployer = `tillery-volunteer-group@${project}.iam.gserviceaccount.com`;
const member = `serviceAccount:${deployer}`;
const legacy = `${project}@appspot.gserviceaccount.com`;
const customRole = `projects/${project}/roles/firebaseDevCiMetadata`;
const provider = `projects/${number}/locations/global/workloadIdentityPools/github/providers/my-repo`;
const condition = "assertion.repository == 'mjohnsonatx/ReactVolunteerApp' && assertion.ref == 'refs/heads/dev' && assertion.sub == 'repo:mjohnsonatx/ReactVolunteerApp:environment:development'";
const accounts = [
  ...['data', 'identity', 'media', 'polls', 'appcheck', 'notify'].map(name => `tsv-${name}@${project}.iam.gserviceaccount.com`),
  `${number}-compute@developer.gserviceaccount.com`,
  // firebase-tools 15.32.1 checks actAs on this account even for gen-2 Functions.
  // Its unused legacy Editor binding must be removed BEFORE granting actAs.
  legacy,
];
const metadataPermissions = [
  'firebase.billingPlans.get', 'firebase.clients.get', 'firebase.clients.list',
  'firebase.links.list', 'firebase.projects.get', 'firebaseextensions.configs.list',
  'firebasestorage.defaultBucket.get',
  'datastore.databases.get', 'datastore.databases.getMetadata', 'datastore.databases.list',
  'serviceusage.services.get', 'serviceusage.services.list', 'serviceusage.services.use',
  'serviceusage.operations.get', 'serviceusage.quotas.get',
  // The current dev project has no legacy config. Do not grant variable-value reads.
  'runtimeconfig.configs.list',
].sort();
const roles = [
  'roles/firebasehosting.admin',
  'roles/firebaserules.admin',
  'roles/datastore.indexAdmin',
  'roles/cloudfunctions.admin',
  'roles/cloudscheduler.admin',
  customRole,
];
const createRole = ['iam', 'roles', 'create', 'firebaseDevCiMetadata', `--project=${project}`,
  '--title=Firebase Dev CI Metadata', '--description=Deployment metadata and API usage; no application-data or secret-value reads.',
  `--permissions=${metadataPermissions.join(',')}`, '--stage=GA', '--quiet'];
const retireEditor = ['projects', 'remove-iam-policy-binding', project,
  `--member=serviceAccount:${legacy}`, '--role=roles/editor', '--condition=None', '--quiet'];
const grants = [
  ...roles.map(role => ['projects', 'add-iam-policy-binding', project, `--member=${member}`, `--role=${role}`, '--condition=None', '--quiet']),
  ...accounts.map(account => ['iam', 'service-accounts', 'add-iam-policy-binding', account,
    `--project=${project}`, `--member=${member}`, '--role=roles/iam.serviceAccountUser', '--condition=None', '--quiet']),
  ['secrets', 'add-iam-policy-binding', 'POLL_VOTE_SALT', `--project=${project}`,
    `--member=${member}`, '--role=roles/secretmanager.viewer', '--condition=None', '--quiet'],
];
const brevoViewerGrant = ['secrets', 'add-iam-policy-binding', 'BREVO_SMTP_KEY', `--project=${project}`,
  `--member=${member}`, '--role=roles/secretmanager.viewer', '--condition=None', '--quiet'];
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const display = args => console.log(['gcloud', ...args.map(quote)].join(' '));

function gcloud(args, capture = false) {
  if (!capture) display(args);
  const result = spawnSync('gcloud', capture ? args : [...args, '--format=none'], { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', timeout: 120_000 });
  if (result.error || result.status !== 0) {
    // Captured stdout can contain the operator's OAuth token; never log it.
    throw new Error(`gcloud ${args.slice(0, 3).join(' ')} failed. Check your gcloud login and operator permissions.`);
  }
  return capture ? result.stdout.trim() : undefined;
}

async function inspect() {
  const token = gcloud(['auth', 'print-access-token'], true);
  async function read(url, body) {
    assert.ok(new URL(url).hostname.endsWith('.googleapis.com'));
    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        family: 4, method: body ? 'POST' : 'GET', timeout: 30_000,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      }, response => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { raw += chunk; });
        response.on('end', () => {
          if (response.statusCode === 404) return resolve(null);
          if (response.statusCode !== 200) return reject(new Error(`Read failed: ${new URL(url).pathname} (HTTP ${response.statusCode}).`));
          try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid Google API response.')); }
        });
      });
      req.on('timeout', () => req.destroy(new Error('Google API read timed out; retry --check.')));
      req.on('error', error => reject(new Error(error.code || error.message)));
      req.end(body ? JSON.stringify(body) : undefined);
    });
  }
  async function collection(url, field) {
    const items = [];
    let next = url;
    do {
      const page = await read(next);
      assert.ok(page, `Missing inventory: ${url}`);
      items.push(...(page[field] || []));
      next = page.nextPageToken ? `${url}?pageToken=${encodeURIComponent(page.nextPageToken)}` : undefined;
    } while (next);
    return items;
  }
  const queries = [
    read(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`),
    read(`https://iam.googleapis.com/v1/${provider}`),
    read(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:getIamPolicy`, { options: { requestedPolicyVersion: 3 } }),
    collection(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`, 'accounts'),
    collection(`https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions`, 'functions'),
    collection(`https://run.googleapis.com/v2/projects/${project}/locations/us-central1/services`, 'services'),
    collection(`https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/us-central1/jobs`, 'jobs'),
    read(`https://appengine.googleapis.com/v1/apps/${project}`),
    read(`https://iam.googleapis.com/v1/${customRole}`),
    collection(`https://runtimeconfig.googleapis.com/v1beta1/projects/${project}/configs`, 'configs'),
    read(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets/POLL_VOTE_SALT`),
    read(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets/BREVO_SMTP_KEY`),
  ];
  const results = await Promise.allSettled(queries);
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) throw new Error(failures.map(result => result.reason.message).join('\n'));
  const [projectInfo, trust, policy, identities, functions, services, jobs, app, existingRole, configs, salt, brevo] = results.map(result => result.value);
  assert.equal(String(projectInfo?.projectNumber), number, 'Unexpected dev project number.');
  assert.equal(trust?.state, 'ACTIVE', 'Provider is not active.');
  assert.ok(!trust.disabled, 'Provider is disabled.');
  assert.equal(trust.oidc?.issuerUri, 'https://token.actions.githubusercontent.com');
  assert.equal(trust.attributeCondition?.replaceAll(/\s+/g, ''), condition.replaceAll(/\s+/g, ''), 'Provider must restrict repository, dev branch, and development environment.');
  assert.equal(trust.attributeMapping?.['attribute.repository'], 'assertion.repository');
  assert.equal(trust.attributeMapping?.['google.subject'], 'assertion.sub');
  for (const email of [deployer, ...accounts]) {
    assert.ok(identities.some(account => account.email === email && !account.disabled), `Missing or disabled account: ${email}`);
  }
  assert.ok(functions.length > 0 && services.length > 0, 'Expected existing dev Functions and Cloud Run services.');
  assert.ok(functions.every(fn => accounts.slice(0, 6).includes(fn.serviceConfig?.serviceAccountEmail)), 'Unexpected function runtime identity; review before granting permissions.');
  assert.ok(functions.every(fn => fn.buildConfig?.serviceAccount === `projects/${project}/serviceAccounts/${accounts[6]}`), 'Unexpected function build identity.');
  assert.ok(services.every(service => accounts.slice(0, 6).includes(service.template?.serviceAccount)), 'Unexpected Cloud Run identity.');
  assert.ok(jobs.every(job => accounts.slice(0, 6).includes(job.httpTarget?.oidcToken?.serviceAccountEmail)), 'Unexpected scheduler identity.');
  assert.equal(app, null, 'An App Engine app now exists; review its account use before retiring Editor.');
  assert.equal(configs.length, 0, 'Legacy Runtime Config now exists; review it instead of granting broad reads.');
  assert.ok(salt, 'POLL_VOTE_SALT must already be provisioned.');
  const legacyBindings = (policy?.bindings || []).filter(binding => binding.members?.includes(`serviceAccount:${legacy}`));
  assert.ok(legacyBindings.every(binding => binding.role === 'roles/editor' && !binding.condition), 'Unexpected legacy account grants; review before granting actAs.');
  if (existingRole) {
    assert.ok(!existingRole.deleted && existingRole.stage !== 'DISABLED', 'Metadata role is not active.');
    assert.deepEqual([...existingRole.includedPermissions].sort(), metadataPermissions, 'Existing metadata role differs; refusing to overwrite it.');
  }
  console.log(`Preflight passed: restricted provider, ${functions.length} Functions, ${services.length} services, ${jobs.length} jobs; legacy account unused by these resources.`);
  return { create: !existingRole, retire: legacyBindings.length > 0, brevoExists: !!brevo };
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.length <= 1 && (!args.length || ['--check', '--apply'].includes(args[0])), 'Usage: node scripts/configure-dev-ci-permissions.mjs [--check|--apply]');
  console.log(`Dev CI permissions for ${deployer}`);
  if (!args.length) {
    console.log('PLAN ONLY. --check reads cloud state; --apply checks it, then runs these grants.');
    console.log('Create metadata role if absent; remove the unused legacy Editor grant if present:');
    display(createRole);
    display(retireEditor);
    for (const command of grants) display(command);
    console.log('Only after BREVO_SMTP_KEY exists:');
    display(brevoViewerGrant);
    return;
  }
  const state = await inspect();
  if (args[0] === '--check') return;
  if (state.retire) gcloud(retireEditor);
  if (state.create) gcloud(createRole);
  for (const command of grants) gcloud(command);
  if (state.brevoExists) gcloud(brevoViewerGrant);
  else console.log('BREVO_SMTP_KEY is absent; the optional dev CI metadata grant was not applied.');
  console.log('Dev CI grants applied. The first GitHub-authenticated deployment still needs validation.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
