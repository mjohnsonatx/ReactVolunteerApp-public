# Security Launch Re-audit

**Application:** Tillery Street Volunteer Group  
**Repository:** `ReactVolunteerApp`  
**Review date:** October 2, 2026  
**Reviewed commit:** `215a07788967da6d8e781927b4882eca3cfb9c66`  
**Audit type:** Post-remediation source, dependency, automated-test, CI, secret-exposure, and passive live-boundary review  
**Overall recommendation:** **Hold the public launch for one short remediation and release-validation pass.**

## Executive summary

The October 2 remediation materially improved the application's security posture. Firestore and Storage rules are restrictive, deployed callables reject requests without App Check, server password policy requires twelve characters, Function source assigns scoped runtime identities, the earlier Vite filesystem exposure remains closed, and the complete local validation suite passed. The reviewed commit is also the exact commit that passed the GitHub quality gate.

One high-severity dependency issue remains in the standalone Cloud Functions deployment lockfile. [`functions/package-lock.json`](functions/package-lock.json) resolves `@fastify/busboy` 3.2.0, which is affected by two published denial-of-service advisories. The patched release is 3.2.1 or newer. The root workspace lockfile resolves a patched version, but Firebase Cloud Build installs from the standalone Functions lockfile, so the clean root production audit does not cover the deployment artifact.

The saved Firebase CLI authentication expired during this review. Passive public checks succeeded, but the audit could not freshly confirm the authenticated Function inventory, runtime service accounts, IAM bindings, or App Check configuration. The repository's remediation record documents prior successful verification of those controls; that evidence should be refreshed before launch. Live document upload and account verification/deletion checks also remain outstanding.

## Launch decision

| ID | Severity | Finding | Launch status |
| --- | --- | --- | --- |
| REAUDIT-01 | High | The standalone Functions lockfile contains vulnerable `@fastify/busboy` 3.2.0 | Blocker |
| REAUDIT-02 | Medium | CI does not audit the standalone Functions deployment lockfile | Fix with REAUDIT-01 |
| REAUDIT-03 | Verification gap | Firebase CLI authentication expired, preventing a fresh authenticated cloud-state review | Recheck before launch |
| REAUDIT-04 | Release validation | Live client flows and disposable-account verification/deletion remain incomplete | Complete before launch |
| REAUDIT-05 | Conditional | Development and desktop packaging dependencies retain high-severity advisories | Resolve before distributing the desktop app |

## Findings

### REAUDIT-01: Vulnerable dependency in the Functions deployment lockfile

**Severity:** High  
**Status:** Confirmed  
**Affected artifact:** Firebase Functions deployment package

The independent production audit of `functions/package-lock.json` reported one high-severity vulnerable package covering two advisories:

- [`GHSA-xjh9-v7x6-24jw`](https://github.com/advisories/GHSA-xjh9-v7x6-24jw) / `CVE-2026-19484`: an oversized multipart boundary can cause excessive CPU consumption.
- [`GHSA-x8mw-p69m-v3mx`](https://github.com/advisories/GHSA-x8mw-p69m-v3mx) / `CVE-2026-19481`: a prototype-named multipart header can crash the parser.

The standalone lockfile resolves:

```text
@fastify/busboy 3.2.0
```

Both advisories are patched in 3.2.1 and later. The dependency is transitive through `firebase-admin`; application source does not import Busboy directly, so this review did not establish that an attacker can reach the vulnerable parser through an exported Function. The deployment artifact nevertheless fails its production dependency audit and should not be released with a known high-severity denial-of-service dependency.

The root workspace lockfile resolves `@fastify/busboy` 3.2.2. That does not remediate the standalone lockfile used by Cloud Build.

**Required remediation:**

1. Regenerate or update `functions/package-lock.json` so it resolves `@fastify/busboy` 3.2.1 or newer.
2. Run a clean standalone Functions install, build, and production audit.
3. Confirm the Functions lockfile is the artifact submitted to Cloud Build.

### REAUDIT-02: CI does not audit the standalone Functions lockfile

**Severity:** Medium  
**Status:** Confirmed

The GitHub workflow runs `npm ci` from the repository root and then exercises configuration, application tests, builds, rules tests, desktop tests, and browser integration tests. It does not run `npm audit`, and it does not independently install or audit `functions/package-lock.json` with workspace processing disabled.

This allowed the quality gate to pass while the deployment lockfile still contained the high-severity dependency described above.

**Required remediation:** Add a CI step that performs a standalone Functions lockfile install check and production audit, for example from `functions/` with `--workspaces=false`. Retain the root production audit as a separate check because the two lockfiles describe different install artifacts.

### REAUDIT-03: Authenticated live Firebase state could not be refreshed

**Severity:** Verification gap  
**Status:** Blocked by expired operator authentication

The read-only cloud inspection command returned HTTP 401 because the saved Firebase CLI OAuth session is no longer valid. The following current production facts could therefore not be freshly verified during this re-audit:

- The complete deployed Function inventory and active status.
- The runtime service account assigned to each Function.
- Current project IAM bindings and removal of the default Compute account's Editor role.
- Current service-level App Check enforcement settings.
- Delivery and invocation configuration used by scheduled and event-driven Functions.

[`doc/live-security-remediation.md`](doc/live-security-remediation.md) records prior verification that all 71 Functions were active with scoped identities, the default Compute Editor grant was removed, and Authentication, Firestore, and Storage App Check enforcement was enabled. Those are strong historical results, but cloud configuration can drift and the failed authenticated inspection cannot establish their current state.

**Required remediation:** Reauthenticate the Firebase CLI and rerun:

```bash
firebase login --reauth
node scripts/security-cloud.mjs inspect
node scripts/security-cloud.mjs verify-functions
node scripts/security-cloud.mjs inspect-delivery
```

Review the output before deploying or promoting Hosting.

### REAUDIT-04: Required live release exercises remain incomplete

**Severity:** Release validation  
**Status:** Pending

Automated emulator and browser coverage is broad, but it does not prove the live email, App Check, Storage, Authentication, IAM, and cleanup paths work together. Complete these checks against the intended release environment:

1. Register a disposable account and confirm Firebase Authentication itself rejects a password shorter than twelve characters.
2. Confirm the verification email arrives and returns to the intended release origin.
3. Confirm the unverified account cannot use protected participation and upload flows.
4. Verify the account, then exercise document upload and the other member flows under App Check enforcement.
5. Delete the account through the normal UI and confirm the documented Authentication, Firestore, and Storage cleanup or anonymization.
6. Use a valid App Check session to confirm the closed legacy `createAccount` callable returns its intended failure response.
7. Review administrator MFA enrollment and recovery before relying on the desktop administration flow for production operations.

### REAUDIT-05: Development and desktop packaging advisories

**Severity:** Conditional  
**Status:** Confirmed

The root production audit reported zero vulnerabilities. The complete root audit reported fourteen high-severity advisories in development and packaging dependencies, including `electron-builder` and Firebase CLI dependency chains. These packages are not part of the public website runtime.

The owner currently uses the desktop application privately. If a desktop installer will be distributed, update and re-audit the packaging chain, build from the reviewed lockfile, sign the package, and test the signed artifact before distribution.

## Current controls and validation

### Source controls reviewed

- Firestore rules default to denial and expose only the intended public event, site-content, approved-forum, and published-overlay data.
- Storage rules require ticket-bound uploads, verified ownership, and path, content-type, and size constraints before default denial.
- Deployed-environment Function options enforce App Check and assign scoped runtime service accounts in source.
- Shared guards enforce verified email and administrator authorization where required.
- Self-service and administrator deletion use the shared, resumable user-data inventory.
- Desktop browser sign-in checks state, Origin, Host, request size, and timeout; desktop authentication remains in memory.

### Automated validation passed

- Root `npm run ci`: configuration checks, lint, type checking, 226 application tests with coverage, application and Functions builds, and all 71 runtime-identity assertions.
- Firestore and Storage rules: 29 of 29 tests.
- Desktop authentication: 14 of 14 tests, plus renderer and Electron main/preload builds.
- Firebase emulator and browser integration: 22 of 22 tests, covering registration, verified-email restrictions, callable authorization, moderation, upload-ticket ownership and metadata, polls, administrator controls, and account deletion.
- GitHub quality gate for the reviewed commit: [successful run](https://github.com/mjohnsonatx/ReactVolunteerApp/actions/runs/37085874159).

### Passive live checks passed

- `/desktop-sign-in` returned HTTP 200 with its dedicated loopback form-action CSP, framing denial, MIME protection, origin-only referrer policy, and no-cache policy.
- The public `listPublicDocuments` callable rejected a request without App Check with HTTP 401.
- A private Firestore probe was rejected with HTTP 403.
- Storage listing without App Check was rejected with HTTP 401 and an invalid-token response.
- An untrusted-Origin preflight returned no `Access-Control-Allow-Origin` header.
- The public Authentication password-policy endpoint reported `ENFORCE` with `minPasswordLength: 12`.
- The root Hosting URL returned HTTP 404, consistent with the site not yet being publicly launched.

### Secret and development-server checks passed

- Focused Vite requests for `/.env` and repository files outside the allowed application roots returned HTTP 403.
- The production artifact contained no configured App Check debug token and no source maps.
- A tracked-source scan found no credential values or private keys.
- The ignored application environment file contains public Firebase configuration and a local App Check debug token; it remains excluded from version control and absent from the production artifact.

## Release gate

Public launch can proceed after all of the following are true:

- The standalone Functions production audit reports zero vulnerabilities.
- CI independently checks the standalone Functions lockfile and production dependencies.
- Authenticated cloud inspection confirms the deployed Function inventory, scoped runtime identities, IAM retirement, App Check enforcement, and delivery configuration.
- The disposable-account, verified-email, live upload, deletion, and closed legacy-callable exercises pass.
- Any desktop installer intended for distribution has a separately clean, signed, and tested release artifact.

After those checks, deploy or promote the exact reviewed artifact and repeat the passive headers, CORS, private-resource, App Check, source-map, and bundle-secret probes against the permanent URL.

## Scope and limitations

This was a focused pre-launch re-audit, not a formal penetration test. It included source review, dependency audits, local builds and automated tests, Firebase emulator and browser tests, development-server exposure probes, artifact secret scanning, CI verification, and passive public-endpoint checks.

The review did not create a live account, write production application data, change Firebase configuration, alter IAM, deploy resources, perform load testing, test social-engineering resistance, or build and assess a signed desktop installer. Authenticated live cloud inspection was attempted but could not proceed after the saved Firebase CLI session returned HTTP 401.

This report supplements the historical [`SECURITY_LAUNCH_READINESS_2026-10-02.md`](SECURITY_LAUNCH_READINESS_2026-10-02.md), the earlier [`SECURITY_AUDIT_2026-10-02.md`](SECURITY_AUDIT_2026-10-02.md), and the remediation record at [`doc/live-security-remediation.md`](doc/live-security-remediation.md). Those documents should remain unchanged as point-in-time evidence.
