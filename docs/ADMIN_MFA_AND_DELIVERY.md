# Administrator MFA and delivery runbook

## Security model

- An account becomes an administrator only after its verified email receives the `admin: true` custom claim.
- The claim alone does not unlock administrator data or actions. The current ID token must also prove a TOTP sign-in (`firebase.sign_in_second_factor == "totp"`).
- The desktop browser handoff accepts only a direct TOTP-authenticated web session. It creates a short-lived custom-token session marked `desktop_admin_mfa: true`; the desktop app and backend both require that marker.
- Members continue to use password sign-in. The project-wide TOTP provider merely makes enrollment possible; this application only presents enrollment to administrator-claimed accounts.
- Email verification is required before an admin claim can be granted. Email is not used as a second factor.

## Safe rollout order

Do not deploy the new Functions or Firestore/Storage rules until at least two administrators have completed steps 1–7. Deploying enforcement first can lock every password-only administrator out.

1. Merge or commit this implementation on `dev`, push `dev`, and let CI pass.
2. Configure the `development` GitHub Environment and let the Hosting workflow create the stable `dev` preview channel.
3. Add the generated preview hostname to the reCAPTCHA v3 key's allowed domains, then synchronize the active preview hostname into Identity Platform and Storage CORS with `node scripts/security-cloud.mjs domains --apply`. Confirm App Check and document previews succeed on the preview.
4. Now change Identity Platform **TOTP MFA** from **Disabled** to **Enabled**. Enabling the provider does not enroll members or force MFA on non-admin accounts.
5. Open the preview and sign in as the existing administrator. The app will show the authenticator enrollment screen instead of admin tools. Scan the QR code, verify a code, then sign out.
6. Sign back in with password plus TOTP and confirm the admin view loads. Do not count enrollment alone as proof; test a fresh sign-in.
7. Create two backup accounts through the normal sign-up UI, verify both email addresses, then grant each the enrollment claim:

   ```bash
   node scripts/set-admin.mjs first-backup@example.com
   node scripts/set-admin.mjs second-backup@example.com
   ```

   Run this with Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS` pointing outside the repository. Each backup administrator must enroll a different authenticator and complete a fresh password-plus-TOTP sign-in. Prefer separate trusted people and separate devices.

8. Exercise one backup account against an admin read and write, then verify one administrator can complete the desktop browser handoff.
9. Promote `dev` to `staging` by pull request. Let CI pass and verify the stable `staging` Hosting preview.
10. Promote `staging` to `main` by pull request. After CI passes, manually run **Deploy Firebase Backend** from `main`, type `deploy-production-backend`, and approve the protected `production-backend` Environment.
11. Manually run **Deploy Firebase Hosting** from `main`, type `deploy-production`, and approve the protected `production` Environment.
12. Repeat fresh web and desktop sign-ins for the primary and at least one backup administrator on the live domain.

The backend and production Hosting workflows are intentionally manual and environment-protected. Pushing a branch cannot deploy production.

## Recovery

Identity Platform does not generate recovery codes for this flow. The primary recovery control is a second independently controlled administrator account.

If an administrator loses every enrolled authenticator, first verify the person's identity outside the app. Inspect the operation without changing anything:

```bash
node scripts/reset-admin-mfa.mjs admin@example.com
```

After a second authorized person approves the reset, apply it:

```bash
node scripts/reset-admin-mfa.mjs admin@example.com --apply
```

The apply form removes all factors and revokes all sessions. The admin claim remains, so the account is routed into enrollment at its next password sign-in. Record who approved and performed the reset; never copy or transmit an enrollment setup key.

## Branch and GitHub setup

Promotion path:

```text
feature branch -> dev -> staging -> main
```

Protect all three branches and require the `CI / Quality gate` check. Disallow direct pushes to `staging` and `main`. Require at least one reviewer for `staging`, and configure required reviewers on both production GitHub Environments.

Create these GitHub Environments:

- `development`
- `staging`
- `production` (required reviewers)
- `production-backend` (required reviewers; restrict to `main`)

Set the following Environment variables where applicable:

- `FIREBASE_PROJECT_ID`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_RECAPTCHA_SITE_KEY`
- `VITE_RECAPTCHA_PROVIDER` (`enterprise` for the isolated dev project)
- `VITE_FIREBASE_VAPID_KEY` (required by the dev deployment guard; enables browser push notifications, see `docs/NOTIFICATIONS.md`)

Use GitHub OIDC/Google Workload Identity Federation; do not store a service-account JSON key in GitHub. Use separate deployment service accounts for Hosting and backend environments when possible, granting each only its required deploy roles.

The `dev` configuration now uses the isolated `tillerystreettrail-dev` Firebase project and persistent development site. See [DEVELOPMENT_FIREBASE.md](DEVELOPMENT_FIREBASE.md) for its setup and current CI access status. The `staging` Hosting preview still uses the production Firebase backend; treat that preview as a production-data surface.

## Workflow behavior

- `.github/workflows/ci.yml`: full quality gate for pushes and pull requests targeting `dev`, `staging`, or `main`; once its deployment identity is configured, a successful `dev` push deploys the isolated dev backend and persistent site. A successful `staging` push updates its 30-day Hosting preview channel.
- `.github/workflows/deploy-hosting.yml`: live Hosting is a confirmed, protected, manual action from `main`.
- `.github/workflows/deploy-backend.yml`: reruns audits, builds, unit/rules/integration tests, then deploys Functions in bounded batches and deploys Firestore/Storage policy. It is a confirmed, protected, manual action from `main`.
- `.github/workflows/release.yml`: tags continue to produce GitHub releases; tags do not deploy Firebase.
