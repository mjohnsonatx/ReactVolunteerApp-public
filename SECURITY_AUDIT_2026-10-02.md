# Pre-Launch Security Audit

**Application:** Tillery Street Volunteer Group  
**Repository:** `ReactVolunteerApp`  
**Review date:** October 2, 2026  
**Overall recommendation:** Do not launch publicly until the three web launch blockers below are resolved. Treat the desktop findings as an additional release blocker if the Electron admin application will be distributed.

## Executive summary

The application's deployed perimeter and database rules performed well during passive checks. Private Firestore and Storage requests were rejected, App Check-protected functions rejected missing tokens, untrusted browser origins were not granted CORS access, and the production web bundle did not contain a private key, App Check debug token, or source maps.

The review nevertheless found three high-severity web launch blockers:

1. A locally stored Firebase service-account key can be downloaded through the Vite development server.
2. Unverified accounts can become active immediately and publish content or vote.
3. Account deletion leaves personal data in multiple collections.

The Electron desktop application also has a stale dependency lock and security advisories that should be resolved before it is distributed or used for production administration.

## Findings

### SEC-01: Vite can expose the local Firebase service-account key

**Severity:** High  
**Status:** Confirmed  
**Affected surface:** Local development and desktop development servers

Both Vite configurations grant access to their parent directory:

- [`app/vite.config.ts`](app/vite.config.ts#L37)
- [`desktop/vite.config.ts`](desktop/vite.config.ts#L15)

The repository contains an ignored Firebase service-account JSON file under `admin-tools`. A loopback-only validation request confirmed that Vite returned this file with HTTP 200 through its filesystem-serving mechanism. The response body was deliberately not printed or recorded.

The key was not found in Git history or in the built web application. This is therefore not currently a Firebase Hosting leak. It becomes exploitable whenever a developer server is exposed through a LAN address, tunnel, forwarded port, development proxy, or shared preview.

The credential is particularly sensitive because the administrative scripts that load it can perform privileged operations such as setting administrator claims and deleting Firebase Authentication users.

**Required remediation:**

1. Move the service-account key outside the repository and outside every Vite-accessible directory.
2. Remove `server.fs.allow: ['..']`, or replace it with the narrowest explicit directory required by the build.
3. Keep development servers bound to loopback unless there is a reviewed reason to expose them.
4. Rotate or revoke the existing key if any development server using this repository has ever been accessible to another machine or through a tunnel.
5. Prefer Application Default Credentials or narrowly scoped, short-lived credentials over a long-lived downloaded key.

### SEC-02: Unverified accounts can immediately publish content and vote

**Severity:** High  
**Status:** Confirmed  
**Affected surface:** Public account registration, forum, event comments, polls, and other member actions

The [`createAccount`](functions/src/callables/auth.ts#L36) callable accepts a plaintext password from an unauthenticated request, permits passwords as short as six characters, creates the Firebase Authentication user with the Admin SDK, and immediately creates an active, unmoderated profile.

The review found no requirement that the user verify ownership of the supplied email address before participating. Ordinary new accounts can therefore publish content immediately. For example, [`submitEventComment`](functions/src/callables/eventComments.ts#L142) assigns approved status to comments from accounts that have not been placed into moderation.

App Check and IP-based throttling reduce automated volume but do not establish that the user owns the email address. An attacker could impersonate an email owner, create disposable identities, post spam, and influence member polls.

The custom callable also means the Functions backend receives the user's raw password before passing it to Firebase Authentication. TLS protects the request in transit, but this unnecessarily expands the number of application components handling credentials and should be reflected in the privacy model until removed.

**Required remediation:**

1. Create accounts using the Firebase Authentication client SDK rather than sending passwords to a custom callable.
2. Send an email-verification message after registration.
3. Initialize the profile through an authenticated server-side operation with an atomic user-name reservation.
4. Require the `email_verified` claim for posting, replying, commenting, voting, document upload, and other reputation-bearing actions.
5. Configure a stronger Firebase password policy; twelve or more characters is an appropriate baseline unless another reviewed authentication policy is adopted.
6. Add automated tests proving that an unverified user cannot perform gated actions.

### SEC-03: Account deletion does not remove all personal data

**Severity:** High  
**Status:** Confirmed  
**Affected surface:** User privacy, account deletion, administrator deletion, and data-retention compliance

[`deleteOwnAccountData`](functions/src/callables/auth.ts#L150) currently covers the user profile, Authentication account, RSVPs, documents, mailing-list entry, user-name reservation, and part of the forum data. It does not remove or anonymize all newer user-linked data.

Examples of data left behind include:

- Pending forum replies
- Event comments containing author identifiers and names
- Event-comment reports containing reporter and target identifiers, names, and reporter email
- Profile messages containing UID, name, email, and message text
- Poll-vote records containing a member UID
- Client error logs containing a UID

The event-comment report fields are visible in [`functions/src/callables/eventComments.ts`](functions/src/callables/eventComments.ts#L274), and member identifiers are stored with votes in [`functions/src/callables/polls.ts`](functions/src/callables/polls.ts#L549).

Administrator-initiated deletion is incomplete as well. Existing deletion tests cover the older collection set and would not detect these retained records.

**Required remediation:**

1. Create one shared deletion/anonymization service used by both self-service and administrator deletion.
2. Maintain an explicit inventory of every collection, Storage path, and external system containing UID, email, user name, or other identifying data.
3. Delete or irreversibly anonymize all related data unless a documented legal or operational retention rule requires otherwise.
4. Remove rate-limit, telemetry, and support-message records where appropriate, or document their limited retention period.
5. Add deletion tests for every inventoried location, including Storage objects and future schema additions.
6. Update user-facing deletion and privacy language to describe any intentional retention accurately.

### SEC-04: Desktop dependency and lockfile risks

**Severity:** High if the desktop application is distributed; otherwise High priority before future distribution  
**Status:** Confirmed  
**Affected surface:** Electron desktop administrator application and build toolchain

The desktop manifest requests newer Firebase and Vitest versions than the lockfile resolves. A clean isolated install succeeded, but `npm ls` reported the locked Firebase and Vitest versions as invalid relative to the workspace manifest. This makes the resulting dependency set misleading and complicates reproducible security updates.

The isolated dependency audit reported 48 findings across the full workspace dependency graph: 2 critical, 28 high, 17 moderate, and 1 low. A production-scoped audit reported 12 findings: 6 high and 6 moderate. Not every transitive advisory is necessarily reachable in this application's runtime, but the direct desktop stack includes versions with material advisories:

- Electron 31.7.7, including an [Electron context-isolation bypass advisory](https://github.com/advisories/GHSA-h7rp-cf8h-j98x)
- electron-builder 24.13.3, including an [AppImage search-path advisory](https://github.com/advisories/GHSA-7g7r-gx96-252g)
- Vite 4.5.14, including [development-server path restriction bypasses](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)
- A critical transitive `tar` denial-of-service advisory: [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw)

**Required remediation:**

1. Decide whether the desktop application is part of the launch. Do not distribute or use it for production administration until upgraded if it is.
2. Reconcile workspace manifests and regenerate the lockfile from a clean install.
3. Upgrade Electron, electron-builder, Vite, Vitest, Firebase, and affected transitive packages to supported patched versions.
4. Re-run production and full dependency audits, then review each remaining advisory for actual reachability.
5. Rebuild, test, and sign the desktop package from the corrected lockfile.

### SEC-05: Desktop App Check is not independent attestation

**Severity:** Medium  
**Status:** Design weakness  
**Affected surface:** Desktop administrator authentication

The desktop application obtains a custom App Check token by presenting its Firebase administrator ID token. The backend verifies that identity token and then mints the App Check token. Consequently, anyone who steals a valid administrator ID token can also obtain the second token; App Check does not provide an independent proof of the device or signed application in this flow.

This does not by itself bypass administrator authorization, but it weakens defense in depth for the application's most privileged interface.

**Recommended remediation:**

- Require MFA for all administrators.
- Use short session lifetimes, token revocation, least-privilege claims, and administrator security alerts.
- Use platform-bound or signed-application attestation if App Check is intended to represent a separate trust factor.
- Otherwise document that this desktop flow relies primarily on administrator authentication rather than independent App Check attestation.

### SEC-06: Poll voting is vulnerable to Sybil manipulation

**Severity:** Medium for consequential polls; Low for informal surveys  
**Status:** Confirmed design limitation  
**Affected surface:** Guest and member polls

Guest identity is derived from a browser-provided participant identifier in [`functions/src/callables/polls.ts`](functions/src/callables/polls.ts#L62). The identifier is salted before storage, which protects the raw value, and the function enforces voter-key and IP-based rate limits. It does not establish one real person per vote.

An attacker can rotate participant identifiers and IP addresses. Because registration does not require verified email, the attacker can also create multiple member identities. The implementation therefore provides one vote per stored identity, not reliably one vote per person.

**Recommended remediation:**

- Require verified member accounts for polls that influence organizational decisions.
- Consider invite codes or a maintained member roster for sensitive votes.
- Describe guest polls as informal and avoid relying on them for binding decisions.
- Monitor unusual account creation and voting patterns.

## Positive security observations

The following controls worked as intended during this review:

- Firestore and Storage rules are narrowly scoped and recursively default-deny.
- All 29 emulator rule tests passed.
- All 212 application unit and integration tests passed.
- Anonymous private Firestore and Storage requests returned HTTP 403.
- An App Check-protected callable rejected a request without App Check with HTTP 401.
- A preflight request from an untrusted browser origin was not granted an allowed origin.
- Public Firestore access was limited to the intended public data tested.
- The built web artifact contained no private key, service-account marker, App Check debug token, or source maps.
- The local service-account key was ignored and was not found in Git history.
- The Hosting configuration contains a restrictive Content Security Policy and related browser security headers.
- The Electron window already enables `contextIsolation`, disables Node integration, and enables Chromium sandboxing.

These controls materially reduce risk, but they do not compensate for the confirmed findings above.

## Current deployment state

At review time:

- The live Firebase Hosting URL returned HTTP 404, so the website was not yet publicly deployed.
- Sixty-nine Cloud Functions were active, meaning the backend surface was already internet-accessible.
- Sensitive Hosting path probes returned 404.
- The local `main` branch was two commits ahead of `origin/main`.

Before launch, build and deploy from an explicitly reviewed commit and verify that the deployed Hosting artifact exactly matches the clean local build.

## Recommended remediation order

1. Remove Vite access to the service-account key, move the key, and determine whether rotation is required.
2. Add verified-email gating and remove password handling from the callable registration flow.
3. Complete the deletion inventory, implementation, tests, and privacy-language review.
4. Decide whether desktop distribution is in launch scope; if so, reconcile and upgrade its complete dependency stack.
5. Require MFA and strengthen administrator session controls.
6. Decide which polls require verified membership and communicate the limitations of guest voting.
7. Run all release gates from a clean locked install and perform a final passive check against the exact deployed artifact.

## Validation performed

This was a non-destructive review. It included:

- Source and configuration inspection
- Git and build-artifact secret checks
- Git-history checks for the local credential
- A loopback-only Vite filesystem exposure test
- Firestore and Storage emulator rule tests: 29 passed
- Application unit and integration tests: 212 passed
- Isolated clean-install dependency audits
- Passive checks of Hosting, Functions, Firestore, Storage, CORS, and App Check behavior

## Limitations

The review did not:

- Run the complete CI pipeline, application build, or end-to-end suite
- Create an account, submit content, vote, upload a document, or perform destructive account-deletion testing against production
- Mutate production data or configuration
- Deploy Hosting, Functions, or rules
- Perform load testing, credential attacks, social engineering, or invasive penetration testing
- Prove whether every dependency advisory is reachable in this application's specific execution paths

No application source files or production resources were changed during the audit.
