# React + Vite

## Disposable local preview

From the repository root, run `npm run preview:local`. Open the loopback URL
printed as **LOCAL TEST PREVIEW**. This builds the production-style interface
against the `demo-watershed` Auth, Firestore, Functions, and Storage emulators.
It does not use production accounts or data. Use fake addresses such as
`member-one@example.test` and test-only passwords (15–25 characters).

New local test accounts are automatically email-verified within a few seconds.
The page displays a local-test notice. This convenience requires all four
guards: the explicit local-preview flag, emulators enabled, the exact demo
project, and the loopback emulator host. Ordinary E2E tests keep verification
enabled and test its action-code flow. Hosted previews also keep verification
enabled because they share production Firebase services.

Keep the command running while testing; Ctrl+C stops the preview and emulators.
Test data is disposable and is not exported. The served local artifact lives in
ignored `.local-preview-dist`, separate from `dist` used for hosted deployment.

## Account profiles and forum previews

Signup creates the app profile automatically. The server derives the default
public username from the Auth email's part before `@`, normalizes it to the
existing lowercase 3–30 character username format, and reserves it atomically.
Duplicates get suffixes (`-2`, `-3`, etc.; a random suffix for crowded names).
Short local parts get `-user`. The email domain is never included. Signup needs
only email/password; usernames remain editable later in account settings.
Existing usernames are not changed, including when email changes. Old clients
may still submit an explicit username. Deploy `initializeAccountProfile` before
Hosting when releasing this change.
After email verification, accounts
missing a profile (or missing a username) are directed to complete
setup before entering the app. Failed profile reads do not trigger creation, and
accounts being deleted cannot use setup. Profile setup previews the public
username without exposing the email address. No separate display name is
collected. New profile writes mirror the username into legacy `name` and Auth
`displayName` fields for compatibility; existing records are not bulk-migrated.
Forum posts require a separate
preview step before publication, using the same renderer as published posts.

Forum posts and replies offer an opt-in anonymous checkbox (verified accounts
only). Public records omit the anonymous author's UID and username; a separate
`forumAuthors` record retains them for MFA-authorized web/desktop administrators.
Each thread assigns stable numbered handles (Anonymous 1, Anonymous 2, etc.)
using a private `forumAnonymousThreads` map. Handles are not linked across
threads and are never recycled after deletion; at most 1000 per thread.
Content and identity are written atomically. Reports resolve the real author on
the server; approval never copies private identity into public replies. Admin
deletion and account anonymization also clean up private identity records.
Deploy the Firestore rules and Functions before publishing the new frontend.
Older content stays unchanged; anonymity applies to new submissions only.

In Admin → Logs, profile failures appear under `account-profile`, and forum
posting/reply failures under `forum-post`, alongside the `error` tag. Older
`AccountSettings-saveProfile` and `handleNewPost` records get these categories
when displayed/exported; no migration of stored logs is required. Clear filters
and use **Load all** to search beyond the recent entries. New live entries keep
appearing after history is loaded.

## Document feature launch gate

Public documents are temporarily disabled in production builds, including the
stable `dev` Hosting preview, while the PDF rendering issue is investigated.
`src/features.ts` enables them only on the local Vite development server.
Deployed builds omit the Documents navigation, viewer, profile uploads, and
document listing requests; old document page URLs redirect to Home.

Admin document and Storage maintenance remain available. This is a UI feature
gate, not a privacy change: it does not delete files, unpublish documents, revoke
download URLs, or change Firebase permissions. Repair and verify PDF rendering
before removing the gate. Production-build E2E tests cover the disabled state;
unit/integration tests retain coverage for local document functionality.

## Repository documentation

See the [root README](../README.md) for setup, configuration, security, test,
and licensing information. Project-specific environment values belong in an
ignored local file copied from [`.env.example`](.env.example).
