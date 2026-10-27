# Live security remediation — October 2, 2026

This records work against `SECURITY_LAUNCH_READINESS_2026-10-02.md`. The audit is historical evidence; it should not be rewritten as a passing report.

The post-remediation launch review is recorded in [`SECURITY_LAUNCH_REAUDIT_2026-10-02.md`](../SECURITY_LAUNCH_REAUDIT_2026-10-02.md). It identifies the current standalone Functions dependency blocker, cloud re-verification boundary, and remaining live release exercises.

The follow-up dependency fix, CI/deployment gates, refreshed cloud verification, and remaining release checks are recorded in [Latest security re-audit remediation](security-reaudit-remediation.md).

## Runtime permissions

Every Function has an explicit runtime account in source, using its full email address. The Firebase CLI's secret-IAM deployment path does not resolve short account names, so the source names the production project explicitly.

| Account | Function group | Permissions |
| --- | --- | --- |
| `tsv-data` | Ordinary database callables | Firestore data access |
| `tsv-identity` | Profile/account lifecycle and admin deletion | Firestore; Auth user get/update/delete through a custom role; object access on the application bucket |
| `tsv-media` | Document/image callables, overlay upload lifecycle, and cleanup triggers | Firestore; object access on the application bucket; Eventarc receive; invocation of its two cleanup services |
| `tsv-polls` | The five poll functions using participant hashes | Firestore; access only to the `POLL_VOTE_SALT` secret |
| `tsv-appcheck` | Desktop browser handoff and token renewal | Auth user read; signing only as its own account |

The default Compute account remains the Firebase CLI's build identity. Build permissions are limited to log writing, the `gcf-artifacts` repository, and the project's Function source/upload buckets. The explicit media account also becomes the Eventarc trigger identity, so it needs event-receive permission and permission to invoke its cleanup service. The retirement stage verifies all 71 runtimes, the Firestore trigger, scheduler, and service-specific invocation grants before removing the default account's Editor, obsolete delivery/invocation roles, and poll-secret access. Those removals have been applied and verified.

The runtime verifier runs in local CI and the GitHub quality gate. It checks all 71 exports, account grouping, and isolation of the five secret-bearing poll functions. Adding a Function requires reviewing that inventory.

The permission approach follows [Firebase's explicit service-account configuration](https://firebase.google.com/docs/functions/manage-functions#set_a_service_account), [Google's Function build-account requirements](https://docs.cloud.google.com/functions/docs/building), and [Eventarc's trigger-identity requirements](https://docs.cloud.google.com/eventarc/docs/roles-permissions?hl=en).

## Desktop browser authentication

The desktop application opens `/desktop-sign-in` in the system browser. The browser acquires reCAPTCHA App Check before Firebase Authentication, authenticates an administrator, and calls the App Check-enforced `issueDesktopSignInToken` endpoint. The endpoint checks token revocation and the admin claim before issuing a custom sign-in token for that same UID.

The credential and attestation return in a POST body to a random loopback-only port. They are not put in URLs or logs. The temporary callback validates the exact website Origin, the Host, and a random 256-bit state value; limits request size; accepts one response; and expires after five minutes. Its responses are non-cacheable. The desktop IPC entrypoint accepts only the main trusted renderer frame and does not accept a caller-supplied sign-in destination. Desktop Firebase Auth uses memory-only persistence.

The desktop seeds App Check with the browser's attestation before exchanging the custom token. Later desktop token renewal requires both an unrevoked administrator ID token and an existing, valid App Check token for the configured app. An administrator ID token alone no longer mints App Check. An expired session must authenticate in the browser again.

The live reCAPTCHA registration issues seven-day tokens (`tokenTtl: 604800s`). The initial handoff incorrectly rejected any expiry beyond one hour. The browser now gives the desktop a cache expiry of the earlier of thirty minutes or the JWT's real expiry; the existing one-hour callback bound remains intact. This schedules earlier desktop renewal and never extends a token. It does not change the underlying seven-day Firebase token lifetime or lower the reCAPTCHA threshold. Unit coverage and the real Chromium form-POST regression include a seven-day token fixture. Firebase supports [reCAPTCHA token lifetimes from thirty minutes to seven days](https://firebase.google.com/docs/app-check/web/recaptcha-provider).

The sign-in route has a separate CSP allowing a form POST only to `127.0.0.1`; other application routes keep their existing form restriction. Its referrer policy is `origin`: `no-referrer` and strict downgrade policies make Chromium send a null Origin to the HTTP loopback callback. Origin-only sends no URL path, state, or port query to other origins. A real Chromium form-POST test covers this boundary with the exact Hosting headers. The callback page itself remains `default-src 'none'`; Chrome DevTools probing its well-known metadata path can produce a harmless CSP warning.

The sign-in route can be published independently with `scripts/prepare-desktop-auth-hosting.mjs`. The script rebuilds with emulators disabled before copying assets, since integration tests overwrite `app/dist`. That artifact has no homepage or catch-all rewrite, so it does not launch the public website.

Analytics is not initialized on this route. Authentication failures show only a safe SDK error code and explanation, not exception messages, request URLs, passwords, or tokens. A blocked Analytics script is not an Authentication failure; the initial client report of HTTP 400 needs its specific Auth code to establish the cause.

Rebuild the desktop application before using this flow. Older desktop builds do not send the required attestation header. Administrator MFA enrollment and recovery still require a separate review; this change does not enforce unenrolled administrators into an unusable MFA flow.

## Dependency fixes

The root manifest now requires Firebase CLI 15.32.1 or newer. Scoped overrides patch the CLI's `@opentelemetry/core` to 2.8.0 and `basic-ftp` to 6.2.1. Both remain development dependencies. These overrides cross the upstream consumers' declared major ranges; CLI deployment and emulator/browser tests are required validation, and the pins should be removed when the consumers natively request patched versions.

The separate Functions lockfile also needed correction: its locked `@grpc/grpc-js` 1.14.4 and `brace-expansion` 2.1.4 had advisories despite the clean root workspace audit. Its manifest and lock now pin 1.14.5 and 2.1.7 respectively. Run both audits; the root lock does not establish which dependencies Cloud Build installs from `functions/package-lock.json`.

## Operator commands

Cloud commands use the existing Firebase CLI login in memory and never print or save its tokens. All changes target `tillerystreettrail` explicitly. Without `--apply`, mutation commands print their intended stage.

```bash
npm run build --workspace functions
npm run verify:runtime-identities
node scripts/security-cloud.mjs inspect
node scripts/security-cloud.mjs inspect-domains
node scripts/security-cloud.mjs provision --apply
node scripts/security-cloud.mjs password --apply
node scripts/security-cloud.mjs domains --apply
node scripts/deploy-security-functions.mjs --apply
node scripts/security-cloud.mjs verify-functions
node scripts/security-cloud.mjs retire-editor --apply
```

Deployment batches have at most ten Functions and stop on a failure. Resume a reviewed failed batch with `--start-batch=N`; use `--stop-batch=N` for a bounded redeployment. Deploy rules separately with `firebase deploy --project tillerystreettrail --only firestore:rules,storage`.

Before enabling service-level App Check, validate a real browser session against the approved origin and the rebuilt desktop handoff. A failed attestation request from an automated browser does not establish that human users will be accepted. Do not reduce the reCAPTCHA threshold merely to make that probe pass.

After real browser/desktop validation and metrics review, `node scripts/security-cloud.mjs enforce-appcheck --apply --verified-browser` enforces Authentication, Firestore, and Storage. That command has now been applied and all three settings were independently read back as ENFORCED. Firebase notes that [enforcement can take up to fifteen minutes to propagate](https://firebase.google.com/docs/app-check/enable-enforcement).

`node scripts/security-cloud.mjs inspect-metrics` reviews the previous two hours of App Check verdicts through Cloud Monitoring. Before enforcement, the service-verification metric showed 23 VALID/ALLOW Authentication requests and 42 VALID/ALLOW Firestore requests for the configured app. Those are separate service counts, not totals added across the overlapping resource/service/verdict metrics. There was no recent valid-client Storage traffic; document upload still requires a live client check.

The application does not import or use Realtime Database. Its legacy default instance is ACTIVE, but authenticated rule inspection confirmed `{ ".read": false, ".write": false }` at the root. Its rules, records, and unenforced App Check setting were left unchanged. Enable App Check there before introducing an application client; do not mistake unused-service status for database deletion.

## Completion evidence

| Audit finding | Current evidence |
| --- | --- |
| LIVE-01 deployed source mismatch | All 71 Functions deployed successfully and verified ACTIVE with the expected runtime identities, including `initializeAccountProfile` and the new browser handoff. Firestore and Storage rules deployed. |
| LIVE-02 Editor runtimes | No Function uses the default Compute account. Five dedicated runtime identities deployed. The default account no longer has Editor, project-wide Run invocation, Eventarc receive, or poll-secret access. A bounded redeployment of `saveSiteContent` succeeded after removal, proving its build path works without Editor. Both cleanup services accept only the media account; the poll secret grants access only to the poll account. |
| LIVE-03 weak server password policy | Server policy ENFORCE, minimum 12; a direct eight-character-password signup probe returned `PASSWORD_DOES_NOT_MEET_REQUIREMENTS`. No account was created. Existing-password sign-in was not forcibly upgraded. |
| LIVE-04 service-level App Check | User confirmed successful corrected browser-to-desktop sign-in before and after enforcement. Monitoring shows VALID/ALLOW traffic and MISSING_UNKNOWN_ORIGIN/DENY traffic for Auth and Firestore after the change. Authentication, Firestore, and Storage independently read back as ENFORCED. Authentication rejects an unattested probe with HTTP 401 `Firebase App Check token is invalid.` An anonymous public Firestore missing-document probe switched from 404 to 403 after enforcement. After propagation, Storage also explicitly rejects both missing and invalid attestation with HTTP 401 `Firebase App Check token is invalid.` Callable enforcement remains active. Realtime Database is unused and its legacy instance has deny-all client rules. |
| LIVE-05 toolchain advisories | Complete root dependency audit: zero advisories. Independent standalone Functions production audit: zero advisories. Both lockfiles dry-run install successfully. |
| LIVE-06 stale origins | Removed three expired preview domains from Auth and Storage CORS. Auth retains localhost and the two permanent Firebase domains. |

Local validation: configuration verification, lint, type checking, 226 app tests, production app/Functions builds, 71-runtime verifier, 29 rules tests, 22 emulator/browser integration tests, 14 desktop tests, and desktop renderer/Electron main/preload builds passed. The latest CI run and desktop regression include the token-expiry correction. The real Chromium callback regression uses exact Hosting CSP/referrer headers and a seven-day token fixture. The signed desktop installer was not built or tested. Emulator tests do not prove live IAM, reCAPTCHA, email delivery, or account cleanup.

Only the desktop sign-in route and its assets were published. Its live response is HTTP 200 with CSP, framing denial, MIME protection, origin-only referrer policy, permissions policy, and no-cache headers; the homepage remains HTTP 404. A read-only live Chromium probe rendered the sign-in page without any Google Analytics or Tag Manager requests. The deployed desktop-renewal endpoint rejected a request without App Check with HTTP 401 `missing-app-check`. These probes did not create live application records or disposable accounts. The source and configuration changes accompany this remediation record.

After the token-expiry correction, the user confirmed successful desktop access. The user then restarted with `npm run dev --workspace @watershed/desktop` and confirmed that sign-in still succeeds after service enforcement. This verifies the private development workflow, not a signed desktop installer. Post-change metrics also show valid Authentication and Firestore traffic alongside denied missing-token probes.

Storage initially retained its old verdict while settings propagated. At 2026-10-03 01:12:50 UTC, read-only Storage probes with no App Check header and with SDK-equivalent headers plus an invalid attestation both received HTTP 401 `Firebase App Check token is invalid.` No account, document, or object was created by these boundary checks. Resource-policy listing confirmed that none of these three services supports per-resource overrides.

Outstanding release checks: validate document upload and the other client flows under enforcement, then exercise disposable-account verification/deletion against the release site. The valid-App-Check live probe of the closed legacy `createAccount` endpoint remains pending; its deployed source and emulator regression are verified. This is not public-launch approval.
