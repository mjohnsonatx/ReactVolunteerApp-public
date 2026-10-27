# Security Launch Readiness Audit

**Application:** Tillery Street Volunteer Group  
**Repository:** `ReactVolunteerApp`  
**Review date:** October 2, 2026  
**Reviewed commit:** `97e03cd7be8009d5e5ce5da5ebac820494034adb` (`main`, synchronized with `origin/main` before this report was added)  
**Audit type:** Pre-release source, dependency, emulator, CI, and passive live Firebase review  
**Overall recommendation:** **Do not deploy Hosting publicly until the three high-severity launch blockers below are resolved.**

## Executive summary

The reviewed source contains the October 2 security remediation and performed well in local validation. Authentication no longer sends passwords through a custom callable, participation paths require verified email where appropriate, account deletion uses a shared and substantially more complete cleanup service, direct database rules remain restrictive, the previous Vite filesystem exposure is closed, and the production bundle contains no source maps or credential markers.

The deployed Firebase environment does not yet match that source. Production is missing the new `initializeAccountProfile` callable, all deployed Functions run with a project-wide Editor service account, and the server-side password policy still accepts six-character passwords. Firebase App Check is also in monitoring-only mode for Authentication, Firestore, Storage, and Realtime Database.

Deploying the web application by itself would therefore publish a frontend that calls a missing backend function, while the reviewed server-side authentication, verification, and deletion changes would remain absent from production.

## Risk summary

| ID | Severity | Finding | Launch status |
| --- | --- | --- | --- |
| LIVE-01 | High | Deployed Functions do not match the reviewed frontend and backend source | Blocker |
| LIVE-02 | High | Every deployed Function runs with the project-wide Editor role | Blocker |
| LIVE-03 | High | Firebase Authentication enforces a minimum password length of only six | Blocker |
| LIVE-04 | Medium | Firebase App Check is monitoring traffic but is not enforced at service boundaries | Resolve during the release sequence |
| LIVE-05 | Low | Seven advisories remain in development-only Firebase CLI dependencies | Track; production audit is clean |
| LIVE-06 | Low | Obsolete preview origins remain authorized | Clean up after release verification |

## Findings

### LIVE-01: Deployed Functions do not match the reviewed release

**Severity:** High  
**Status:** Confirmed  
**Affected surface:** Registration, verified participation, account deletion, and every remediated callable

The compiled source at the reviewed commit exports 70 Cloud Functions. The production inventory contains 69 and does not contain `initializeAccountProfile`.

The current browser registration path creates the Firebase Authentication account through the client SDK and then calls `initializeAccountProfile`:

- [`app/src/context/AppContext.tsx`](app/src/context/AppContext.tsx#L198)
- [`app/src/libs/callables.ts`](app/src/libs/callables.ts#L3)

The current Functions entrypoint exports that callable:

- [`functions/src/index.ts`](functions/src/index.ts#L1)

Production's `createAccount` source generation dates to September 10, 2026. That predates the reviewed October 2 implementation, where the legacy password-taking endpoint is retained only to return a closed response:

- [`functions/src/callables/auth.ts`](functions/src/callables/auth.ts#L30)

The live inventory mismatch also means the following source-side protections cannot be considered deployed:

- Verified-email participation guard in [`functions/src/lib/guards.ts`](functions/src/lib/guards.ts#L11)
- Shared deletion and anonymization service in [`functions/src/lib/userData.ts`](functions/src/lib/userData.ts#L132)
- Verified-owner document uploads in [`firebase_rules/storage.rules`](firebase_rules/storage.rules#L90)

**Impact:** Deploying Hosting alone will break new-account profile initialization. It would also leave the earlier backend behavior active instead of the reviewed verification and deletion protections.

**Required remediation:**

1. Deploy Functions, Firestore rules, and Storage rules from the reviewed commit before deploying Hosting.
2. Verify that production lists `initializeAccountProfile`.
3. Call the legacy `createAccount` endpoint with an otherwise valid test request and confirm it returns the intended closed `failed-precondition` response.
4. Complete the release account test described under **Required release validation**.

### LIVE-02: Function runtime identity has project-wide Editor access

**Severity:** High  
**Status:** Confirmed  
**Affected surface:** All deployed Cloud Functions and the wider Firebase/Google Cloud project

All 69 deployed Functions use the Compute Engine default service account:

```text
224851969688-compute@developer.gserviceaccount.com
```

A read-only project IAM query found these roles on that account:

```text
roles/editor
roles/eventarc.eventReceiver
roles/run.invoker
```

The shared callable configuration currently sets region, App Check enforcement, and CORS, but no restricted service account:

- [`functions/src/lib/options.ts`](functions/src/lib/options.ts#L15)

Firebase documents that default Function service accounts have broad permissions and supports assigning custom runtime service accounts to individual functions or globally. See [Manage Functions: set a service account](https://firebase.google.com/docs/functions/manage-functions#set_a_service_account).

**Impact:** If a public Function or one of its dependencies is compromised, its credentials provide project-wide Editor access rather than access limited to that Function's actual Firestore, Storage, Authentication, App Check, or Secret Manager duties.

**Required remediation:**

1. Create dedicated runtime service accounts with only the permissions required by each function group.
2. Set the runtime account explicitly in source so later deployments preserve the reviewed identity.
3. Remove `roles/editor` from the default Compute service account after every deployed Function has migrated and been tested.
4. Recheck scheduled, Firestore-triggered, callable, and desktop App Check-token functions because their permission needs differ.

### LIVE-03: Server password policy permits six-character passwords

**Severity:** High  
**Status:** Confirmed  
**Affected surface:** Firebase email/password accounts

The live Firebase Authentication password-policy endpoint returned:

```text
enforcementState: ENFORCE
minPasswordLength: 6
maxPasswordLength: 4096
```

The browser UI requires twelve characters in [`app/src/context/AppContext.tsx`](app/src/context/AppContext.tsx#L207). That client-side check can be bypassed by calling Firebase Authentication directly, so it does not replace the server policy. Firebase identifies `customStrengthOptions.minPasswordLength` as the enforced policy value in its [PasswordPolicy API reference](https://firebase.google.com/docs/reference/js/auth.passwordpolicy).

**Impact:** Accounts can be created with substantially weaker passwords than the application presents to users and than the remediation status requires.

**Required remediation:** Set the Firebase Authentication minimum password length to 12 in the Firebase Console and repeat the public policy query before launch.

### LIVE-04: App Check is not enforced at Firebase service boundaries

**Severity:** Medium  
**Status:** Confirmed  
**Affected surface:** Authentication, Firestore, Storage, and Realtime Database

The live Firebase App Check service inventory reported:

| Service | Enforcement mode |
| --- | --- |
| Authentication | `UNENFORCED` |
| Firestore | `UNENFORCED` |
| Storage | `UNENFORCED` |
| Realtime Database | `UNENFORCED` |

In `UNENFORCED` mode, App Check collects metrics but does not reject traffic with missing or invalid tokens. Firebase describes that behavior in its [App Check enforcement-mode reference](https://firebase.google.com/docs/reference/appcheck/rest/v1/EnforcementMode).

The reviewed web client initializes App Check with reCAPTCHA v3 and automatic token refresh:

- [`app/src/firebase.ts`](app/src/firebase.ts#L51)

The live App Check configuration confirms that reCAPTCHA v3 is configured for the production web application. Callable Functions separately use hard enforcement outside the emulator:

- [`functions/src/lib/options.ts`](functions/src/lib/options.ts#L15)

A passive production request without an App Check token received HTTP 401 from a callable, confirming that the Function-level control is active. Firestore and Storage rules also rejected anonymous access to private resources with HTTP 403. Those controls reduce the immediate impact, but service-level App Check remains monitoring only.

**Required remediation:**

1. Validate real App Check tokens from the final Hosting or preview origin.
2. Review App Check metrics for valid production traffic.
3. Change Authentication, Firestore, and Storage to `ENFORCED` before public launch.
4. Leave Realtime Database disabled or unused if the application does not need it; otherwise enforce it as well.
5. Repeat registration, sign-in, document upload, and public-content tests after enforcement.

### LIVE-05: Development-only dependency advisories remain

**Severity:** Low  
**Status:** Confirmed  
**Affected surface:** Local development and release tooling

The production dependency audit reported zero vulnerabilities. The Functions audit also reported zero vulnerabilities.

The complete repository audit reported seven development-only advisories: five high and two moderate. All are transitive dependencies of `firebase-tools`, including the affected `@opentelemetry/core` and `basic-ftp` chains. The available forced npm remediation would replace Firebase CLI with an incompatible version and was not applied.

**Required remediation:** Track Firebase CLI releases and rerun the full audit after upgrading. Do not use the forced incompatible downgrade as an automatic release fix.

### LIVE-06: Obsolete preview origins remain authorized

**Severity:** Low  
**Status:** Confirmed  
**Affected surface:** Firebase Authentication authorized domains and Storage CORS configuration

The public Firebase project configuration contains three historical preview hostnames in addition to localhost and the permanent Firebase Hosting domains. One historical preview also remains in [`cors.json`](cors.json#L12).

These origins are still project-controlled and do not independently grant database authorization, but retaining unused origins increases the number of browser origins trusted by the project.

**Required remediation:** Remove preview domains after confirming they are no longer used for release validation. Retain only the permanent production domain, required Firebase domains, and deliberately supported local-development entries.

## Controls and tests that passed

### Source and build validation

- Repository CI passed configuration synchronization, lint, type checking, and production build verification.
- 21 application test files and 212 tests passed.
- The build verifier confirmed 25 minified JavaScript/CSS assets.
- No production source maps were generated.
- The built web application contained no private-key headers, service-account markers, Firebase CLI tokens, or App Check debug-token markers.
- `npm ls --all` completed without an invalid dependency tree.
- The GitHub quality gate for commit `97e03cd7` completed successfully.

### Firebase rules and end-to-end validation

- Three rules test files and 29 tests passed.
- The full Firebase emulator and Playwright suite passed all 21 tests.
- The suite covered public forms, registration, profile initialization, verified-email restrictions, RSVPs, forum posting, polls, documents, administrative operations, and friendly authentication failures.
- Ten desktop tests passed.
- The desktop renderer and Electron main/preload builds completed successfully.

### Passive live perimeter checks

- A callable request without App Check was rejected with HTTP 401.
- Anonymous private Firestore access was rejected with HTTP 403.
- Anonymous Storage bucket listing was rejected with HTTP 403.
- An untrusted-origin callable preflight did not receive an `Access-Control-Allow-Origin` header.
- The permanent Hosting URL currently returns HTTP 404. Consequently, the final deployed HTML, headers, content-security policy, and JavaScript artifacts could not yet be inspected live.

### Vite credential-exposure regression

The prior audit found that Vite could serve a locally stored service-account file through `/@fs/`. The reviewed configuration now binds to loopback and limits filesystem access to `app`, `shared`, and `node_modules`:

- [`app/vite.config.ts`](app/vite.config.ts#L38)

Focused requests for the repository environment file and a known existing root-level `package.json` both returned HTTP 403. The removed historical service-account path returned only the application's HTML fallback and did not return a credential file. The repository and production bundle contain no copy of that key.

## Required release validation

Complete these checks against the release environment before making Hosting public:

1. Create a disposable account with a unique email address.
2. Confirm a password shorter than 12 characters is rejected by Firebase Authentication itself.
3. Confirm profile initialization succeeds through `initializeAccountProfile`.
4. Confirm the verification email arrives and its link returns to the intended production origin.
5. Confirm the unverified account cannot post, reply, comment, vote as a member, RSVP, or upload a document.
6. Verify the email address and repeat the permitted member actions.
7. Delete the account through the normal UI.
8. Confirm removal or intended anonymization in Firebase Authentication, Firestore, Storage, user-name reservations, support messages, event comments/reports, poll votes, RSVPs, documents, overlay uploads, error logs, and rate-limit records.
9. Confirm the final site returns the configured CSP, framing denial, MIME protection, referrer policy, permissions policy, and asset-cache headers from [`firebase.json`](firebase.json#L65).
10. Re-run passive private-resource, CORS, App Check, bundle-secret, and source-map probes against the deployed release.

## Required release order

1. Replace the Editor runtime identity with reviewed least-privilege service accounts.
2. Set the Firebase Authentication password minimum to 12.
3. Deploy Functions, Firestore rules, and Storage rules from commit `97e03cd7`. Firebase recommends deploying large Function sets in groups of ten or fewer to avoid deployment quotas; see [Firebase's deployment guidance](https://firebase.google.com/docs/functions/manage-functions#deploy_functions).
4. Confirm all 70 source exports are represented as expected and that `initializeAccountProfile` is live.
5. Deploy Hosting to a preview channel and complete the release-account and App Check tests.
6. Enable App Check enforcement for Authentication, Firestore, and Storage and repeat the affected tests.
7. Deploy Hosting to the live channel.
8. Verify headers, assets, routes, account lifecycle, and passive perimeter behavior on the permanent URL.
9. Remove unused preview origins.

## Scope and limitations

This was a focused pre-launch audit rather than a formal penetration test. It included source review, dependency analysis, local compilation and automated testing, Firebase emulator tests, browser tests, read-only Firebase configuration and IAM queries, and passive requests to deployed public endpoints.

The audit did not create a production account, submit production forms, modify production data, alter Firebase settings, deploy resources, rotate credentials, change IAM bindings, or distribute/test a signed desktop installer. Destructive testing, load testing, social-engineering review, and independent third-party infrastructure assessment were outside scope.

## Repository state

No application source or production resource was changed during the audit. The checkout was clean and synchronized with `origin/main` before this report file was added.

This report supplements the historical [`SECURITY_AUDIT_2026-10-02.md`](SECURITY_AUDIT_2026-10-02.md) and the source-remediation tracker at [`doc/security-remediation-status.md`](doc/security-remediation-status.md). Those files describe the earlier findings and source fixes; this report records the final live-readiness check and outstanding production work.
