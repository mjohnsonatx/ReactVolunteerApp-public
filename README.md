# WatershedCrew

WatershedCrew is the web and desktop application used by the Tillery Street
Volunteer Group to coordinate volunteers, events, community discussions,
documents, maps, polls, and member communications.

The repository is a TypeScript monorepo with a React/Vite browser app, an
Electron administrator app, shared validation code, and Firebase Functions and
security rules. Production credentials and local Firebase state do not belong
in source control.

## Repository layout

| Path | Purpose |
| --- | --- |
| `app/` | React 19 browser app, UI tests, and browser integration tests |
| `desktop/` | Electron administrator dashboard reusing browser-app modules |
| `functions/` | Callable, scheduled, and event-triggered Firebase Functions |
| `shared/` | Validation, sanitization, and data contracts shared by clients and Functions |
| `firebase_rules/` | Firestore and Cloud Storage security rules |
| `scripts/` | Configuration, verification, deployment, and security helpers |
| `docs/` and `doc/` | Operational and design documentation |

## Local preview

Install Node.js 22 and Java 21, then run:

```bash
npm ci
npm run preview:local
```

The command prints a loopback-only preview URL and starts disposable Firebase
Auth, Firestore, Functions, and Storage emulators under the `demo-watershed`
project. It does not connect to production accounts or data. Stop it with
Ctrl+C.

For package-level development:

```bash
npm run dev --workspace app
npm run dev --workspace @watershed/desktop
```

The browser and desktop apps share the Firebase client settings in `app/`.
Copy [`app/.env.example`](app/.env.example) to an ignored local environment
file before connecting to a real development project. Copy
[`functions/.env.example`](functions/.env.example) to the Firebase
project-specific Functions environment file when preparing a cloud deployment.
See [the Firebase development guide](docs/DEVELOPMENT_FIREBASE.md) for the
project-isolation and deployment requirements.

## Configuration and secrets

Variables prefixed with `VITE_` are embedded in client bundles and must be
treated as public. Firebase web app IDs, web API keys, reCAPTCHA site keys, and
VAPID public keys identify public clients; authorization still depends on
Firebase Security Rules, IAM, App Check, and trusted server code.

Never commit any of the following:

- `.env` or project-specific environment files;
- App Check debug tokens, SMTP credentials, vote salts, or OAuth refresh tokens;
- service-account JSON, private keys, Cloud CLI state, or admin-tool credentials;
- generated builds, logs, source maps, coverage, or browser-test reports.

`BREVO_SMTP_KEY` and `POLL_VOTE_SALT` are server secrets and belong in Google
Secret Manager. Local agent skills and their install metadata are also ignored;
each contributor can install their preferred tooling separately.

Run the public-repository guard before committing:

```bash
npm run verify:public
```

The guard checks tracked paths and content for common credential formats,
environment files, private keys, logs, source maps, generated output, and local
tool state. It intentionally reports only the detector and path, never a
matching value.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:rules
npm run test:e2e
```

The production web build is minified with source maps disabled and is checked
after every build. CI also audits production dependencies and exercises the
browser, desktop, Functions, and Firebase rules layers. Deployment workflows
are separate, protected operations and are not required for local development.

## Security

Please report vulnerabilities privately as described in
[`SECURITY.md`](SECURITY.md). Do not include credentials, private user data, or
an exploitable production proof in a public issue.

## License

Project-owned source and documentation are available under the
[MIT License](LICENSE). Third-party packages retain their own licenses and
notices. OpenStreetMap data is attributed in the map UI.
