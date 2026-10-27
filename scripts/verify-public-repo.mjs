import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const pathRules = [
  {
    label: 'environment file',
    test: path => /(^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith('/.env.example') && path !== '.env.example',
  },
  { label: 'log file', test: path => /\.log$/i.test(path) },
  { label: 'source map', test: path => /\.map$/i.test(path) },
  { label: 'TypeScript incremental build state', test: path => /\.tsbuildinfo$/i.test(path) },
  {
    label: 'generated dependency/build/test output',
    test: path => /(^|\/)(node_modules|dist|dist-electron|release|coverage|test-results|playwright-report)(\/|$)/.test(path)
      || path.startsWith('functions/lib/'),
  },
  {
    label: 'local cloud/tool state',
    test: path => /(^|\/)(\.firebase|\.aws|\.codex)(\/|$)/.test(path)
      || /^\.firebase\.(?:e2e|dev\.deploy)\..*\.json$/.test(path)
      || path === '.claude/settings.local.json'
      || path.startsWith('.agents/skills/')
      || path.startsWith('.claude/skills/')
      || path === 'skills-lock.json',
  },
  {
    label: 'private key or credential file',
    test: path => /\.(pem|key|p12|pfx|jks|keystore)$/i.test(path)
      || /(^|\/)(id_rsa|id_ed25519)$/i.test(path)
      || /(^|\/)[^/]*(service[-_]?account|firebase-adminsdk)[^/]*\.json$/i.test(path)
      || /(^|\/)credentials\.json$/i.test(path),
  },
];

const contentRules = [
  ['private key block', /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{40,255})\b/],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/],
  ['Stripe live secret key', /\bsk_live_[0-9A-Za-z]{16,}\b/],
  ['SendGrid API key', /\bSG\.[0-9A-Za-z_-]{16,}\.[0-9A-Za-z_-]{16,}\b/],
  ['Brevo API key', /\bxkeysib-[0-9A-Za-z_-]{20,}\b/],
  ['Google OAuth client secret', /\bGOCSPX-[0-9A-Za-z_-]{20,}\b/],
  ['npm access token', /\bnpm_[0-9A-Za-z]{36,}\b/],
  ['JSON secret value', /"(?:client_secret|refresh_token|private_key)"\s*:\s*"(?!replace|example|test|dummy)[^"\r\n]{12,}"/i],
  ['JWT-like token', /\beyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\b/],
  [
    'sensitive environment assignment',
    /^(?:BREVO_SMTP_KEY|POLL_VOTE_SALT|FIREBASE_APPCHECK_DEBUG_TOKEN|VITE_FIREBASE_APPCHECK_DEBUG_TOKEN|NPM_TOKEN|GH_TOKEN)\s*=\s*(?!replace|example|test|dummy|<|\$\{)[^\s#]{8,}/im,
  ],
];

const findings = [];
for (const path of tracked) {
  for (const rule of pathRules) {
    if (rule.test(path)) findings.push(`${rule.label}: ${path}`);
  }

  if (path === 'scripts/verify-public-repo.mjs') continue;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 5 * 1024 * 1024) continue;
  const bytes = readFileSync(path);
  if (bytes.includes(0)) continue;
  const content = bytes.toString('utf8');
  for (const [label, pattern] of contentRules) {
    if (pattern.test(content)) findings.push(`${label}: ${path}`);
  }
}

if (findings.length) {
  console.error('Public repository verification failed:');
  for (const finding of [...new Set(findings)].sort()) console.error(`- ${finding}`);
  console.error('Remove the file/value from Git and rotate any exposed credential before publishing.');
  process.exit(1);
}

console.log(`Public repository verification passed for ${tracked.length} tracked files.`);
