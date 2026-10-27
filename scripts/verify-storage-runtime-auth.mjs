import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

// Resolve from the deployable Functions tree, including Storage's own auth
// dependencies. Emulators bypass this credential path and cannot catch it.
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));
const storageRequire = createRequire(functionsRequire.resolve('@google-cloud/storage'));
const { Storage } = functionsRequire('@google-cloud/storage');
const { Compute } = storageRequire('google-auth-library');
let tokenRequests = 0;
let storageRequests = 0;
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url.startsWith('/computeMetadata/v1/instance/service-accounts/default/token')) {
    assert.equal(req.headers['metadata-flavor'], 'Google');
    tokenRequests++;
    res.setHeader('Metadata-Flavor', 'Google');
    res.end(JSON.stringify({ access_token: 'local-test-token', token_type: 'Bearer', expires_in: 3600 }));
    return;
  }
  assert.equal(req.headers.authorization, 'Bearer local-test-token');
  storageRequests++;
  res.end(JSON.stringify({ items: [{ name: 'documents/test/example.pdf' }] }));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const endpoint = `http://127.0.0.1:${server.address().port}`;
const previousHost = process.env.GCE_METADATA_HOST;
process.env.GCE_METADATA_HOST = endpoint;
try {
  const storage = new Storage({
    projectId: 'demo-storage-runtime-auth',
    apiEndpoint: endpoint,
    useAuthWithCustomEndpoint: true,
    authClient: new Compute(),
    retryOptions: { autoRetry: false },
  });
  const [files] = await storage.bucket('test-bucket').getFiles();
  assert.equal(files[0].name, 'documents/test/example.pdf');
  assert.equal(tokenRequests, 1);
  assert.equal(storageRequests, 1);
  console.log('Storage runtime auth passed: metadata token and authenticated inventory request.');
} finally {
  if (previousHost === undefined) delete process.env.GCE_METADATA_HOST;
  else process.env.GCE_METADATA_HOST = previousHost;
  await new Promise(resolve => server.close(resolve));
}
