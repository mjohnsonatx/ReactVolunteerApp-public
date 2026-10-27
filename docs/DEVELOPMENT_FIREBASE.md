# Real Firebase development preview

The development environment uses its own Firebase project, `tillerystreettrail-dev` (project number `274454283920`). Production remains `tillerystreettrail`.

| Resource | Development configuration |
| --- | --- |
| Preview site | `https://tillerystreettrail-dev.web.app` |
| Firestore | `(default)`, Standard edition, `us-central1` |
| Auth | Separate email/password users, real email verification, optional TOTP for administrators |
| Functions | `us-central1`, dedicated `tsv-*` accounts in the development project |
| Storage | `tillerystreettrail-dev.firebasestorage.app` |
| App Check | Separate reCAPTCHA Enterprise provider; callable enforcement stays enabled |
| Push | Separate public VAPID key generated in the dev Firebase console |
| Billing | Uses the billing account approved for the dev project; usage is billable |

No production users, documents, Storage objects, or secrets are copied. Emulator accounts are not cloud accounts. Use email addresses you control when checking signup, verification, password reset, and notifications.

## Local configuration and deployment

The ignored `app/.env.development.local` contains the dev web SDK configuration, public reCAPTCHA key and public VAPID key. It must also set `FIREBASE_PROJECT_ID=tillerystreettrail-dev`, `VITE_RECAPTCHA_PROVIDER=enterprise`, `VITE_USE_FIREBASE_EMULATORS=false`, and `VITE_LOCAL_EMAIL_AUTO_VERIFY=false`. No SMTP key or service-account key belongs in this file.

Copy `functions/.env.example` to the ignored
`functions/.env.tillerystreettrail-dev` file and set its public backend values
for the dev web app and notification-link destination. Runtime identities and
callable origins are derived from the Firebase project supplied during
deployment/runtime. Never commit the project-specific file.

```bash
# Build Functions and validate the target without deploying.
npm run deploy:dev

# Deploy dev rules, indexes, Storage policy, Functions, and the dev website.
npm run deploy:dev -- --apply

# Rebuild and publish only the dev website after frontend changes.
npm run deploy:dev -- --apply --hosting-only
```

The development deploy command rejects production project IDs, mismatched Auth/Storage/app settings, and emulator or automatic-verification flags. It generates a temporary Hosting configuration with the dev Functions origin in the content security policy. The production Hosting configuration remains separate.

The generated Storage configuration explicitly targets
`tillerystreettrail-dev.firebasestorage.app` with the shared rules file. This avoids
Firebase CLI default-bucket discovery, which returned 404 under the restricted CI
identity even though the bucket and its Firebase registration were present.

`npm run verify:development` checks deployment targeting, runtime identities, CORS, App Check enforcement, and notification link isolation after Functions are built. The normal E2E suite continues to use disposable emulators.

Functions deploy in batches of ten. If a first deployment is interrupted, verify the completed batches and rerun with `--backend-only --start-batch=N` to resume at the first incomplete batch. Afterward, `FIREBASE_PROJECT_ID=tillerystreettrail-dev node scripts/security-cloud.mjs verify-functions` checks the complete live inventory.

## Desktop administrator preview

From the repository root, launch the desktop app with its browser sign-in page set to dev:

```bash
DESKTOP_SIGN_IN_URL=https://tillerystreettrail-dev.web.app/desktop-sign-in npm run dev --workspace @watershed/desktop
```

The desktop renderer uses `app/.env.development.local`. `DESKTOP_SIGN_IN_URL` also directs the Electron browser handoff to dev; its default is the production sign-in page. Click **Sign in with browser**, use your dev administrator account and authenticator code, then return to the desktop window. Start sign-in from the desktop button so it includes the temporary callback and state.

## GitHub previews

The `dev` branch CI job uses the `development` GitHub Environment to deploy the dev backend plus its persistent dev site after the quality gate. The operator applied `configure-dev-ci-permissions.mjs --apply` on 2026-10-16, and the first complete GitHub-authenticated deployment passed in [run 38989290564](https://github.com/mjohnsonatx/ReactVolunteerApp/actions/runs/38989290564) for `b169fa59`. Local deployment uses the authenticated operator instead. Its Firebase variables must all reference `tillerystreettrail-dev`, including `VITE_RECAPTCHA_PROVIDER=enterprise`. Google authentication uses the Environment's `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT`; no service-account key belongs in the repository. The provider restricts that identity to this repository, `refs/heads/dev`, and the `development` Environment.

Staging continues to use its existing preview-channel job. Production deployment still requires its separate main-branch workflows.

The `development` Environment's public Firebase values were aligned with the tested
dev configuration on 2026-10-16, including the public VAPID key and Enterprise
provider. The unused Analytics measurement ID was removed from that Environment.

The first complete GitHub quality gate passed for `023bdee6`, but its deployment
stopped during default Storage bucket discovery. The retry for `b169fa59` passed
352 frontend tests, 34 rules tests, 15 desktop tests, and 50 browser/callable tests,
then deployed rules, indexes, all 84 Functions, and Hosting. The explicit bucket
configuration above resolved the lookup failure without additional IAM grants.

The build/test CI job runs on GitHub and needs no GCP deployment identity. To enable automatic dev deployment, create these resources in `tillerystreettrail-dev`:

1. The deployment service account `tillery-volunteer-group@tillerystreettrail-dev.iam.gserviceaccount.com`.
2. A global Workload Identity Pool and GitHub OIDC provider using issuer `https://token.actions.githubusercontent.com`. Its trust condition must require repository `mjohnsonatx/ReactVolunteerApp`, branch `refs/heads/dev`, and subject `repo:mjohnsonatx/ReactVolunteerApp:environment:development` (prefer additionally pinning the immutable repository/owner IDs).
3. A `roles/iam.workloadIdentityUser` binding on that service account for the restricted GitHub principal, plus dev-only deployment grants for Hosting, Functions, rules, indexes, and scheduled jobs. Limit `roles/iam.serviceAccountUser` to the six dev runtime accounts, the dev build account, and the legacy App Engine account required by the installed Firebase CLI's deployment precheck. Remove that legacy account's unused Editor grant before permitting CI to act as it. Existing service agents and runtime permissions are provisioned separately; CI does not need project IAM administration or a downloaded service-account key.

Put the provider's full `projects/274454283920/locations/global/workloadIdentityPools/.../providers/...` resource name in `GCP_WORKLOAD_IDENTITY_PROVIDER`, and the deployment account email in `GCP_DEPLOY_SERVICE_ACCOUNT`. Both are GitHub `development` Environment variables. Restrict that Environment to the `dev` branch. Validate the applied role bindings with a deployment under that identity. See [Google's GitHub authentication guide](https://github.com/google-github-actions/auth#workload-identity-federation-through-a-service-account) and [Firebase deployment permissions](https://firebase.google.com/docs/projects/iam/permissions).

### Operator-run permission setup

The existing provider is `projects/274454283920/locations/global/workloadIdentityPools/github/providers/my-repo`. Live inspection confirmed its repository, branch, and environment condition and the separate dev runtime/build identities. The operator-run script below fixes the project and account names so it cannot accidentally target the active production project in gcloud.

```bash
# Print every planned command without authenticating or changing cloud state.
node scripts/configure-dev-ci-permissions.mjs

# Read-only cloud preflight using the operator's existing gcloud login.
node scripts/configure-dev-ci-permissions.mjs --check

# Apply the reviewed grants after repeating the preflight.
node scripts/configure-dev-ci-permissions.mjs --apply
```

The plan grants these roles to `tillery-volunteer-group`:

| Scope | Role | Purpose |
| --- | --- | --- |
| Dev project | `roles/firebasehosting.admin` | Publish the dev site |
| Dev project | `roles/firebaserules.admin` | Deploy Firestore and Storage rules |
| Dev project | `roles/datastore.indexAdmin` | Deploy indexes |
| Dev project | `roles/cloudfunctions.admin` | Deploy Functions and configure their Cloud Run/Eventarc resources |
| Dev project | `roles/cloudscheduler.admin` | Update scheduled Functions jobs |
| Dev project | Custom `firebaseDevCiMetadata` | Read deployment configuration and use enabled APIs |
| Eight named dev service accounts | `roles/iam.serviceAccountUser` | Assign the six runtime accounts, build account, and satisfy the CLI's legacy precheck |
| Dev `POLL_VOTE_SALT` secret | `roles/secretmanager.viewer` | Validate secret/version metadata without reading its payload |
| Dev `BREVO_SMTP_KEY` secret, once created | `roles/secretmanager.viewer` | Validate email secret/version metadata without reading its payload during deployment |

The script checks that the legacy account has no unexpected project grants, there is no App Engine application, all deployed Functions have the expected runtime/build identities, and the inspected Cloud Run services and Scheduler jobs in `us-central1` use the six runtime accounts. It removes the legacy account's Editor binding before adding any `actAs` grant. The metadata role permits listing empty legacy Runtime Config; it does not permit reading variable values. Preflight fails if legacy config exists or if a preexisting custom role differs from the reviewed permissions.

The script creates no keys and grants no project IAM administration, API-disable permission, broad Storage data access, or direct secret-payload access. Its default mode and cloud preflight have been checked. The operator's successful apply output confirms removal of the legacy Editor grant, creation of the metadata role, and application of the scoped deployment grants. The successful GitHub deployment validated those grants against the existing dev resources, including Firebase CLI's legacy Service Usage `generateServiceIdentity` calls. All APIs and service agents were already provisioned; this does not validate first-time provisioning of new APIs or service agents.

## Brevo email setup is separate

Until a real dev `BREVO_SMTP_KEY` secret and SMTP login are configured, `WATERSHED_EMAIL_ENABLED=false` keeps email delivery disabled in the dev project. All 84 Functions can deploy, and the admin settings correctly report that SMTP is not configured. Push and member preferences do not require the key. Production also keeps email delivery disabled until its own secret and login are ready and `WATERSHED_EMAIL_ENABLED=true` is set for deployment.

To enable Brevo, first authenticate `tillerystreetvolunteers.org` in Brevo, then follow [NOTIFICATIONS.md](NOTIFICATIONS.md) for the SMTP login, project-specific secret, and runtime permissions. Set `WATERSHED_EMAIL_ENABLED=true` only after the dev secret exists, then deploy the backend. Do not copy the production key automatically or paste an SMTP key into chat.

## Manual real-flow check

1. Create two accounts using inboxes you control and complete each verification email. Use separate browser profiles to keep their sessions independent.
2. On the receiving account, open **Profile → Notifications → Turn on**, accept the browser permission prompt, and enable **Push: Replies to my forum threads**.
3. Start a thread with that account and reply from the other account. Check the system notification, icon, and destination when clicked. Repeat with the receiving site's tab closed and the browser still running.
4. Turn that topic off and repeat. Check that your own replies do not notify you, and signing out unregisters that browser.
5. Use an MFA administrator to check new-event notifications and moderation approval flows. Follow the [full notification checklist](NOTIFICATIONS.md#manual-testing) for topic and digest coverage.

The hosted dev site exercises real Firebase services. Emulator transaction tests and successful deployment alone do not prove browser delivery or inbox receipt; record those separately after the manual flow succeeds.

## Validation on 2026-10-16

- Built and published the dev frontend with the supplied public VAPID key and reCAPTCHA Enterprise. A real browser App Check exchange and the public `listPolls` callable both returned HTTP 200.
- Verified all 84 deployed Functions are active with explicit dev runtime accounts; all 18 Firestore indexes are ready. Storage download CORS allows the dev Hosting origins and the existing local development ports.
- Lint, frontend/Functions builds, development-isolation checks, and runtime-identity checks passed. The unit suite passed 327 tests; the emulator E2E suite passed 44 tests.
- Eight live backend checks passed using two disposable fixture accounts: App Check acceptance/rejection, Firebase sign-in, the email-verification guard, notification preferences, device registration/removal and private-data rules, administrator access protection, forum posting/replies with Eventarc dispatch, and opt-out persistence. The exact test documents and accounts were removed afterward.

Fixture emails were verified administratively for the backend check; this did not test inbox receipt. The initial device-registration check used a synthetic token that was removed before posting, so it did not test FCM delivery or an operating-system notification.

Later validation of the polling and responsive-layout release:

- GitHub run `38989290564` passed the full quality gate and deployed `b169fa59`. All 84 Functions were then confirmed active with the expected dev runtime identities.
- Live browser checks used real App Check and Firestore to submit multi-select and ranked ballots, reload their selections, replace votes, and verify server totals. A partial ranked ballot retained the configured K-point first-choice score. Both temporary polls and their votes were removed.
- Profile and header layouts were checked with a signed-in emulator account at widths of 320, 390, 640, 768, 1024, 1100, 1280, and 1440 pixels. No horizontal overflow appeared; the account button stayed in the first header row, notification labels remained readable, and preference saving worked.
- The user confirmed the browser permission dialog appeared on the hosted dev site. The real two-account forum-reply check then delivered exactly one notification, and clicking it opened the correct forum thread. This confirms that push path; it does not establish delivery for every browser, operating system, or notification topic.

Brevo digest delivery remains disabled pending its separate dev secret, SMTP login, and authenticated sender domain.
