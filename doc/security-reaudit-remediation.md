# Latest security re-audit remediation

This records remediation of [`SECURITY_LAUNCH_REAUDIT_2026-10-02.md`](../SECURITY_LAUNCH_REAUDIT_2026-10-02.md). The audit and earlier remediation records remain point-in-time evidence.

Validated on October 2, 2026 (America/Chicago), after the re-audit. Source changes are based on `215a07788967da6d8e781927b4882eca3cfb9c66`. The Functions dependency patch was deployed with explicit user approval, and all 71 Functions were freshly verified. The local CI additions have not yet been checked by a new GitHub Actions run.

## Finding status

| Finding | Remediation and current boundary |
| --- | --- |
| REAUDIT-01 Functions dependency | Both manifests pin `@fastify/busboy` 3.2.2. The standalone lockfile now resolves 3.2.2. A clean isolated standalone install, build, production audit, and 71-runtime identity check passed. All 71 production Functions were redeployed successfully in eight batches and verified ACTIVE with update timestamps from this rollout. The final Function's deployed source archive contains the exact reviewed `functions/package-lock.json` resolving Busboy 3.2.2. |
| REAUDIT-02 CI coverage | CI separately audits the root production tree and installs, audits, and builds the standalone Functions package with `--workspaces=false`. Functions scripts resolve `tsc` from the installed package instead of hard-coding the parent workspace compiler. Firebase Functions predeploy also audits the standalone production package before lint/build. The new CI steps await the next GitHub run. |
| REAUDIT-03 cloud verification | The existing login succeeded without reauthentication. Fresh authenticated inspection verified 71 active Functions on the five expected scoped runtime accounts; no default Compute Editor grant; twelve-character password enforcement; Authentication, Firestore, and Storage App Check enforcement; media-account trigger/scheduler delivery; cleanup-service invocation restricted to that account; and poll-secret access restricted to the poll account. |
| REAUDIT-04 live release exercises | Pending. No disposable account or live application data was created during this pass. Email delivery/return routing, real client uploads, deletion cleanup, valid-App-Check legacy-callable behavior, and administrator MFA enrollment/recovery still need the release exercise below. |
| REAUDIT-05 development/packaging | Root production audit: zero vulnerabilities. Complete root audit: 14 high-severity affected packages; desktop workspace audit: 13. Two underlying development dependency advisories have no published patched release. Desktop installer `build` now runs its complete workspace audit first and stops on findings or an audit failure. Private development and renderer builds remain available. Signed installer distribution remains blocked. |

## Validation performed

- Standalone Functions `npm ci --workspaces=false --no-audit --no-fund` in a temporary source copy outside the workspace, with no parent workspace dependencies: passed, 251 packages installed.
- Standalone `npm run build --workspaces=false`: passed using that install's TypeScript compiler.
- Standalone `npm audit --omit=dev --workspaces=false`: zero vulnerabilities.
- The exact predeploy command, `npm --prefix functions audit --omit dev --no-workspaces`: zero vulnerabilities. Firebase's command wrapper skipped the original equals-sign argument syntax during the first two deployment batches; both were covered by the passing independent preflight audit. The corrected syntax ran successfully from batch three onward.
- The actual Firebase predeploy runner was tested against an isolated standalone lockfile containing vulnerable Busboy 3.2.0: it returned a nonzero audit result and prevented the hook from completing. This check did not deploy Firebase resources.
- Root `npm audit --omit=dev`: zero vulnerabilities.
- Root locked-install dry run: passed.
- Root `npm run ci`: passed configuration verification, lint, type checking, all 226 application tests with coverage, production app/Functions builds, and all 71 runtime-identity assertions.
- Desktop authentication tests: 14 of 14 passed. The initial sandbox run could not open loopback listeners or launch Chromium; the same tests passed with those local operations permitted.
- Desktop renderer and Electron main/preload builds: passed.
- Desktop installer audit gate: correctly exited with failure on the 13 desktop dependency findings before invoking the builder. Only builder help was requested for this gate check; no installer was produced.
- Firebase CLI Functions source archive: the standalone lockfile matches byte-for-byte and resolves Busboy 3.2.2.
- Fresh `security-cloud.mjs inspect`, `verify-functions`, and `inspect-delivery`: passed against `tillerystreettrail`.

The rollout preflight also exposed a stale-token issue in the cloud helper: Firebase CLI's cached `expires_at` field is not the OAuth client's `expiry_date` field. The helper now starts with only the existing refresh token and refreshes in memory. The corrected helper successfully inspected live controls without reauthentication or credential logging/storage.

Firestore/Storage emulator rules and browser/callable integration suites were not rerun in this pass; their prior passing results remain historical evidence. Local tests do not prove live email delivery, attestation, upload permissions, or deletion cleanup.

## Unpatched development dependencies

The complete audit's 14 affected packages originate in these two advisories:

- [`braces` through 3.0.3](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), used through build/watch tooling including Firebase CLI and desktop Tailwind.
- [`http-cache-semantics` through 4.2.0](https://github.com/advisories/GHSA-ch52-4w7c-c8xp), used through the desktop packaging download/cache chain.

The advisory pages list no patched version, and npm's latest published versions are 3.0.3 and 4.2.0 respectively at verification time. No forced toolchain downgrade, major Tailwind migration, or unreviewed vendored patch was applied. These dependencies are absent from the production web/Functions audit. The packaging gate does not fix the dependencies; it prevents the normal installer build from proceeding with the known findings. Revisit the upstream chains before distributing installers and separately sign and test the eventual release artifact.

## Production rollout

All 71 Functions share the standalone deployment dependency tree. Redeploy every Function from the patched source after approval, then refresh the cloud checks:

```bash
npm run audit:production
npm run build --workspace functions
npm run verify:runtime-identities
node scripts/deploy-security-functions.mjs --apply
node scripts/security-cloud.mjs inspect
node scripts/security-cloud.mjs verify-functions
node scripts/security-cloud.mjs inspect-delivery
```

The prepared deployment plan has eight batches of at most ten Functions. It targets `tillerystreettrail` explicitly and stops on the first failed batch. No IAM, App Check, rules, password-policy, or public Hosting changes are needed for this dependency patch. The deployment gate must be rerun at release time because advisories can change.

### Completed rollout

The user approved the production redeployment. All eight batches completed successfully, with 71 distinct successful Function updates and no failed batches. The first live update timestamp was `2026-10-03T02:11:54.991817899Z`; the last was `2026-10-03T02:21:54.453351071Z` (October 2 in America/Chicago).

Post-deployment verification completed at approximately `2026-10-03 02:23 UTC`:

- All 71 Functions are ACTIVE, have the expected runtime accounts, and have update timestamps from this rollout.
- The deployed source archive for the final `saveSiteContent` update was retrieved using its Cloud Functions source provenance. Its standalone lockfile matches the reviewed local lockfile byte-for-byte and resolves Busboy 3.2.2. This checks the final deployed archive; it is not an inspection of every running container.
- The default Compute account has no Editor grant. Server password minimum remains twelve; Authentication, Firestore, and Storage App Check remain ENFORCED.
- Cleanup trigger/scheduler delivery uses the media account, both cleanup services restrict invocation to it, and the poll secret grants access only to the poll account.
- Unattested requests to `listPublicDocuments` and `issueDesktopSignInToken` returned HTTP 401 `UNAUTHENTICATED`.

The local deployment log is `/tmp/tsv-functions-redeploy-20261003.log`. No Hosting, security-rules, or application-data writes were performed in this rollout. The Functions patch is deployed; the live release exercise below remains outstanding.

## Remaining live release exercise

Use an operator-controlled disposable inbox and the intended release origin with its real App Check configuration. Record the artifact/commit, origin, time, test UID, and created resource IDs; do not record passwords, verification codes, or authentication/attestation tokens. Limit cleanup to resources created for this exercise.

1. Confirm the Firebase Authentication API rejects a password shorter than twelve characters. A browser-only validation error is insufficient evidence.
2. Register the disposable account, confirm delivery of the verification email, and check its link/return origin. Before verification, confirm protected posting, voting, RSVP, and upload operations are rejected by the backend.
3. Follow the verification link, refresh the account/ID token through the normal client, and perform a document upload and the member flows under live App Check enforcement. Capture the resulting document, upload-ticket, and object identifiers.
4. Through a valid App Check session, call legacy `createAccount` with harmless fixture data and expect `failed-precondition` with the closed update-client response. Missing-App-Check rejection does not prove the closed handler ran.
5. Delete the disposable account through the normal UI. Read back the shared deletion inventory: Authentication user, profile and username reservation, document records/tickets/quota, `documents/<uid>/` Storage objects including interrupted uploads, RSVP/vote/comment/report/message records, mailing/volunteer records for that email, and rate-limit entries. Check forum content/replies and target-author references are anonymized as specified in `functions/src/lib/userData.ts`. Do not substitute an administrator-only direct Auth deletion for this UI exercise.
6. Review administrator MFA enrollment and recovery with the operator before enforcing any new requirement. Confirm a normal sign-in and recovery path without changing or deleting the operator's existing account.
7. After the approved release artifact is deployed/promoted, repeat the passive headers, CORS, protected-resource, App Check, source-map, and bundle-secret checks against its permanent origin.

Public launch remains on hold until these live exercises are complete. The production Functions dependency rollout is complete. The current desktop sign-in-only Hosting deployment is not a member-flow release environment.
