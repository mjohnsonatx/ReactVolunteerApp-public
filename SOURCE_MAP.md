# ReactVolunteerApp Source Map

Generated on 2026-07-10 and updated for the public repository boundary on
2026-10-27. This map covers project-owned source, configuration, tests, rules,
scripts, and package manifests. It intentionally omits generated, vendor, and
local-only artifacts such as `.git/`, `node_modules/`, locally installed agent
skills, `app/dist/`, `functions/lib/`, Firebase debug logs, emulator caches,
Playwright reports, coverage output, and environment files.

## Root

- `.firebaserc` - Defines Firebase project aliases used by Firebase CLI commands.
- `.gitignore` - Controls ignored local files, generated outputs, secrets, dependency folders, and Firebase rule tracking exceptions.
- `.nvmrc` - Pins local Node.js tooling to the same Node 22 major used by deployed Functions.
- `LICENSE` - Licenses project-owned source and documentation under MIT.
- `README.md` - Documents the architecture, local preview, configuration, checks, security, and license.
- `SECURITY.md` - Defines private vulnerability reporting and repository hygiene expectations.
- `cors.json` - Defines Firebase Storage CORS origins, methods, headers, and max age.
- `firebase.config.json` - Stores non-secret project configuration synced into Functions source for deployment.
- `firebase.json` - Configures Firestore, Storage, Functions, emulators, Hosting, headers, rewrites, and predeploy hooks.
- `firestore.indexes.json` - Declares Firestore composite indexes for ordered and filtered queries, including approved-forum, published-overlay, owner contact-message, batched event-comment, poll, and poll-vote listings.
- `package.json` - Defines root npm workspaces and shared dev tooling for Firebase, Vitest, and Playwright.
- `package-lock.json` - Locks the root workspace dependency graph.
- `SOURCE_MAP.md` - Provides this one-line-per-file project map.
- `TODO.md` - Tracks small launch-readiness follow-ups such as getting a domain and proper contact email address.
- `volunteer_page.txt` - Preserves an older single-file volunteer page implementation/reference.

## `.github/workflows/`

- `.github/workflows/ci.yml` - Runs locked install, config verification, lint, type checks, coverage, production builds, rules tests, and browser/callable E2E tests for pushes and pull requests to `main`.
- `.github/workflows/release.yml` - Repeats the complete quality gate for `v*.*.*` tags before creating a generated-notes GitHub release.

## `scripts/`

- `scripts/sync-config-to-functions.mjs` - Generates `functions/src/generatedConfig.ts` from `firebase.config.json` before Functions builds.
- `scripts/verify-public-repo.mjs` - Rejects tracked secrets, environment files, keys, source maps, logs, generated output, and local tool state.
- `scripts/verify-no-source-maps.mjs` - Rejects source maps and source-map references in desktop build output.
- `scripts/verify-emulator-config.mjs` - Verifies emulator ports and the Functions Node runtime from repository-root configuration files.

## `firebase_rules/`

- `firebase_rules/firestore.rules` - Keeps event comments, comment reports, polls, and poll votes admin-read/callable-write only, restricts direct Firestore writes, closes username reservations/report records to clients, hides unapproved forum posts and unpublished overlays from non-admins, limits contact messages to their sender or admins, denies every client access to notification settings, push tokens, digest queues, and email settings, and leaves sensitive mutations to callable Functions while preserving allowed reads.
- `firebase_rules/storage.rules` - Enforces Firebase Storage access for documents, background images, site-content profile images, and admin-only event images (JPEG/PNG/WebP up to 5 MB) with public read.

## `shared/`

- `shared/package.json` - Defines the shared workspace package used by app and Functions code.
- `shared/tsconfig.json` - Configures TypeScript for shared source compilation.

## `shared/src/`

- `shared/src/geojson.ts` - Sanitizes uploaded GeoJSON feature collections, geometry, properties, and collection size.
- `shared/src/htmlEscape.ts` - Escapes HTML-sensitive characters for safe interpolation.
- `shared/src/index.ts` - Re-exports shared sanitization and safety helpers.
- `shared/src/mapSafe.ts` - Sanitizes map colors, numeric values, labels, and image URLs before rendering map data.
- `shared/src/sanitize.ts` - Sanitizes text, markdown, email, phone, URLs, forms, and malicious input patterns for app and Functions use.
- `shared/src/eventMedia.ts` - Defines event-image content types, the 5 MB cap, caption sanitizing, and the `events/{eventId}/{imageId}.{ext}` path builders/validators shared by the app, Functions, and Storage rules.
- `shared/src/eventComments.ts` - Validates event comment bodies, batch sizes, report reasons, and the public/anonymous author label.
- `shared/src/polls.ts` - Defines poll status/audience/result-visibility enums, option limits (2-15), sanitizers, window-state helpers, and the deterministic vote document id.
- `shared/src/csvSafe.ts` - Escapes CSV fields against spreadsheet formula injection and builds the mailing-list export plus its predictable file name.
- `shared/src/notifications.ts` - Defines opt-in notification topics, default-off preferences, reply recipients, push/digest message wording, same-site link checks, the 7 PM Central digest schedule, and the escaped digest email.

## `functions/`

- `functions/.eslintrc.js` - Legacy ESLint configuration retained for the Functions package.
- `functions/.env.example` - Documents non-secret Functions routing settings without project credentials.
- `functions/.gitignore` - Excludes Functions dependency folders, compiled output, and local environment files.
- `functions/package.json` - Defines Functions scripts, Node runtime, Firebase Admin/Functions dependencies, and TypeScript build gates.
- `functions/package-lock.json` - Locks the Functions dependency graph.
- `functions/tsconfig.dev.json` - Provides development-oriented TypeScript settings for Functions.
- `functions/tsconfig.json` - Configures TypeScript compilation for deployable Functions source.

## `functions/src/`

- `functions/src/generatedConfig.ts` - Generated Firebase configuration module consumed by Functions runtime code.
- `functions/src/index.ts` - Exports all callable Functions deployed by Firebase.
- `functions/src/shared.ts` - Re-exports shared workspace utilities for Functions imports.

## `functions/src/callables/`

- `functions/src/callables/admin.ts` - Implements admin-only callable mutations for volunteers, events, forum moderation, overlays, account actions, user-data cleanup, contact-message replies, and site content while keeping registered-user identity fields self-service.
- `functions/src/callables/auth.ts` - Implements account creation, username reservation/uniqueness, profile updates, email sync, and self-service account deletion callables.
- `functions/src/callables/clientError.ts` - Implements rate-limited remote client error logging.
- `functions/src/callables/documents.ts` - Implements document record creation, publishing (approved public only), moderation (rejection always unpublishes in Firestore and Storage), admin deletion, and owner self-service deletion callables.
- `functions/src/callables/events.ts` - Implements authenticated RSVP creation and cancellation callables.
- `functions/src/callables/eventImages.ts` - Admin-only callables that reserve event image storage slots, verify uploaded objects, edit captions/cover selection, and detach images.
- `functions/src/callables/eventComments.ts` - Callables for listing (batched), posting, editing, deleting, reporting, and moderating event discussion comments.
- `functions/src/callables/polls.ts` - Admin poll CRUD/status callables plus public poll listing, retrieval, server-side tallies, and duplicate-proof vote casting.
- `functions/src/callables/mailingList.ts` - Admin-only mailing-list CSV export callable with formula-injection-safe escaping.
- `functions/src/callables/notifications.ts` - Member notification preference and push-token callables, plus admin digest email settings, status, and test-email callables (the Brevo SMTP key stays in Secret Manager).
- `functions/src/callables/forum.ts` - Implements forum post, reply, vote, and report callables with private report records and per-user reported-state tracking.
- `functions/src/callables/public.ts` - Implements public volunteer signup, mailing-list subscription, and signed-in profile message callables.

## `functions/src/lib/`

- `functions/src/lib/firebaseAdmin.ts` - Initializes Firebase Admin Auth, Firestore, and Storage clients.
- `functions/src/lib/guards.ts` - Provides auth, admin, App Check, and client IP guards for callable Functions.
- `functions/src/lib/ids.ts` - Generates lowercase alphanumeric ids used for event image object names.
- `functions/src/lib/mailer.ts` - Loads admin email settings and sends Brevo SMTP mail with the `BREVO_SMTP_KEY` secret (rendered locally under the emulator).
- `functions/src/lib/notify.ts` - Looks up member preferences and subscribers, sends FCM push (pruning dead tokens), queues digest lines, and dedupes announcements.
- `functions/src/lib/options.ts` - Defines shared callable Function runtime options, CORS allowlist, and production App Check enforcement.
- `functions/src/lib/rateLimiter.ts` - Provides Firestore-backed rate limiting for callable endpoints.
- `functions/src/lib/userData.ts` - Deletes or anonymizes user-owned Firestore, forum report metadata, and Storage data from trusted server code.

## `functions/src/triggers/`

- `functions/src/triggers/eventMediaCleanup.ts` - Firestore trigger that deletes orphaned event images from Storage when an admin removes them, and clears the whole event folder when an event is deleted.
- `functions/src/triggers/notifications.ts` - Announces approved forum posts, new forum replies, and new events to opted-in members, and sends the daily digest email at 7 PM Central.

## `app/`

- `app/.gitignore` - Excludes app-local logs, env files, dependency folders, build output, Firebase caches, and test reports.
- `app/.env.example` - Documents public Firebase client settings and safe local defaults without real values.
- `app/README.md` - Documents app-specific preview and behavior notes and links to root setup guidance.
- `app/eslint.config.js` - Configures ESLint for JavaScript, TypeScript, React Hooks, globals, and Vite React Refresh rules.
- `app/index.html` - Provides the Vite HTML shell and mounts `src/main.tsx` into `#root`.
- `app/package.json` - Defines app scripts, runtime dependencies, dev dependencies, and build/test commands.
- `app/playwright.config.ts` - Configures Playwright's test directory, serialized workers, trace capture, and configurable local base URL.
- `app/tsconfig.json` - Configures TypeScript for app source, tests, and config files.
- `app/vite.config.ts` - Configures Vite React/Tailwind plugins, initial-vendor chunking, and production minification without sourcemaps.
- `app/vitest.config.ts` - Configures jsdom Vitest tests, React aliases, setup files, exclusions, and coverage.
- `app/vitest.rules.config.ts` - Configures Node-based Vitest execution for Firebase rules tests.

## `app/public/`

- `app/public/icons/` - WatershedCrew app icon (SVG favicon, 192/512 PNG, maskable, Apple touch icon, and notification badge).
- `app/public/manifest.webmanifest` - Installable-app manifest used for Add to Home Screen and iPhone/iPad web push.
- `app/public/sw.js` - Push-only service worker that shows notifications and opens their same-site link; it caches nothing.
- `app/public/icons.svg` - Public SVG icon asset copied into production builds.

## `app/scripts/`

- `app/scripts/verify-production-build.mjs` - Fails the build if emitted JS/CSS assets include sourcemaps or do not look minified.
- `app/scripts/run-e2e.mjs` - Builds Functions and lets `firebase emulators:exec` own the complete E2E service lifecycle so Java emulator processes cannot be orphaned.
- `app/scripts/run-e2e-suite.mjs` - Starts Vite on an explicit strict port, waits for readiness, runs Playwright, and shuts Vite down before Firebase cleans up its emulators.

## `app/src/`

- `app/src/App.css` - App-specific stylesheet retained from the React UI.
- `app/src/App.tsx` - Wraps the app in `AppProvider` and switches between user and admin shells.
- `app/src/firebase.ts` - Initializes Firebase App, Auth, Firestore, Storage, Functions, reCAPTCHA-backed App Check, Analytics, and emulator wiring.
- `app/src/index.css` - Global Tailwind/CSS entrypoint and shared visual styling.
- `app/src/main.tsx` - Creates the React root, installs global error logging, and renders the app under `StrictMode`.
- `app/src/vite-env.d.ts` - Provides Vite client TypeScript declarations.

## `app/src/context/`

- `app/src/context/AppContext.tsx` - Central provider for auth state, callable-backed app workflows, forum report dialog state, global backend progress, forms, modal state, and derived counts.

## `app/src/hooks/`

- `app/src/hooks/useAdminData.ts` - Subscribes admins to users, RSVPs, error logs, volunteers, documents, mailing list entries, profile messages, forum reports, overlay uploads, and event-comment reports.
- `app/src/hooks/useAuth.ts` - Tracks Firebase Auth state and loads the current user's Firestore profile, reported-content map, and admin status.
- `app/src/hooks/useRoute.ts` - History-backed route state and navigation helper for the conventional `/events`, `/polls`, and `/admin/*` routes.
- `app/src/hooks/useLocalStorageState.ts` - Persists React state to `localStorage` with guarded parsing and write failures.
- `app/src/hooks/usePublicData.ts` - Subscribes to events, published documents, and (for non-admins) status/published-filtered forum posts and overlays, while admins receive the full moderation-ready collections.
- `app/src/hooks/useSiteContent.ts` - Subscribes to editable public site content such as mission, goals, and about-me copy.
- `app/src/hooks/useUserData.ts` - Subscribes a signed-in user to their RSVPs and their own contact-message thread (including admin replies).

## `app/src/libs/`

- `app/src/libs/callables.ts` - Defines typed-ish Firebase callable wrappers and shared callable error-message handling for client code.

## `app/src/router/`

- `app/src/router/routes.ts` - Parses and builds the conventional application routes and maps them to pages and admin tabs.

## `app/src/services/`

- `app/src/services/accountCleanup.ts` - Compatibility wrapper that delegates admin user-data cleanup to callable Functions.
- `app/src/services/accountErrors.ts` - Defines typed account-management errors and user-safe messages.
- `app/src/services/accountService.ts` - Handles password reset, email change, profile updates, password changes, deletion, and email sync.
- `app/src/services/eventComments.ts` - Callable-backed wrappers for listing, posting, editing, deleting, reporting, and moderating event comments.
- `app/src/services/eventImages.ts` - Client image pipeline: validation, upload ticket, resumable upload with progress, thumbnail, and callable-confirmed attachment plus caption/cover/delete helpers.
- `app/src/services/mailingListExport.ts` - Requests the admin CSV export callable and turns the response into a browser download.
- `app/src/services/notifications.ts` - Detects push support (including iPhone Home Screen installs), registers/unregisters this browser with FCM, and loads/saves member notification preferences.
- `app/src/services/emailDelivery.ts` - Admin wrappers for digest email settings and the test email, safe for the desktop app to reuse.
- `app/src/services/polls.ts` - Callable-backed poll listing, retrieval, results, voting, and admin poll management wrappers.
- `app/src/services/storageUrls.ts` - Resolves and caches download URLs from trusted Storage paths at render time.
- `app/src/services/forumAnonymization.ts` - Compatibility wrapper that delegates forum anonymization to callable Functions.
- `app/src/services/overlayApprovalService.ts` - Compatibility wrapper around overlay approval, rejection, deletion, and publish-state callables.

## `app/src/types/`

- `app/src/types/overlayUpload.ts` - Defines the Firestore-backed overlay upload data shape used by admin overlay workflows.

## `app/src/utils/`

- `app/src/utils/crashReporting.ts` - Crash/error reporting shim that routes handled failures to the `logClientError` callable (Crashlytics has no Web SDK).
- `app/src/utils/eventImageList.ts` - Normalizes the stored event image array and resolves the cover image.
- `app/src/utils/geojson.ts` - Re-exports shared GeoJSON sanitization for app imports.
- `app/src/utils/participant.ts` - Creates and stores the browser participant id used to keep guest poll voting to one vote per person.
- `app/src/utils/logError.ts` - Sends client error events through the remote logging callable.
- `app/src/utils/overlayLegend.ts` - Builds grouped overlay legend data for map overlay display.
- `app/src/utils/safeExternalPlantUrls.ts` - Allows only trusted plant-reference URLs to leave the app.
- `app/src/utils/sanitize.ts` - Re-exports shared sanitizers for app imports.
- `app/src/utils/thumbnail.ts` - Generates compressed thumbnails for image and PDF uploads.

## `app/src/components/`

- `app/src/components/DocumentViewer.tsx` - Fetches Firebase Storage blobs and previews or downloads published documents.
- `app/src/components/ErrorBoundary.tsx` - Catches render errors, logs them, and shows a recoverable fallback UI.
- `app/src/components/htmlEscape.ts` - Re-exports shared HTML escaping for component imports.
- `app/src/components/Map.tsx` - Renders Leaflet maps, sanitized overlays, labels, patterns, and popups.
- `app/src/components/mapSafe.ts` - Re-exports shared map safety helpers for component imports.
- `app/src/components/OverlayPanel.tsx` - Displays overlay group toggles and legend swatches for map layers.

## `app/src/components/admin/`

- `app/src/components/admin/AdminContent.tsx` - Lets admins edit public mission/goals/about content and upload site profile imagery with backend progress feedback.
- `app/src/components/admin/AdminDashboard.tsx` - Shows admin summary counts, recent profile messages with inline admin reply controls, and dashboard entry points.
- `app/src/components/admin/AdminDocuments.tsx` - Lets admins upload, publish/unpublish, preview, reject, approve, and delete documents, and surfaces moderation failures.
- `app/src/components/admin/AdminEvents.tsx` - Lists events, opens create/edit/delete flows, and exposes per-event image management, comment moderation, and comment reports.
- `app/src/components/admin/AdminForum.tsx` - Lets admins moderate forum posts, replies, report reasons, flags, votes, and user context.
- `app/src/components/admin/AdminMailing.tsx` - Shows mailing-list subscribers with subscription dates/status, an empty-state message, and a formula-safe CSV export with success/failure feedback.
- `app/src/components/admin/AdminEmailSettings.tsx` - Admin daily-digest settings: verified sender address/name, on/off switch, SMTP-configured status, last run, and a test email.
- `app/src/components/admin/AdminEventImages.tsx` - Admin event image manager with validation, upload progress, captions, cover selection, deletion, and empty/failure states.
- `app/src/components/admin/AdminOverlays.tsx` - Lets admins import, preview, approve, reject, toggle, and delete GeoJSON overlay groups.
- `app/src/components/admin/AdminPolls.tsx` - Admin poll console for creating, editing, publishing, closing, archiving, and deleting polls.
- `app/src/components/admin/AdminUsers.tsx` - Lists all registered users in a searchable directory and opens a user's profile for account/profile management.
- `app/src/components/admin/AdminView.tsx` - Provides the admin shell, tabs (including the Users directory), account menu, dashboard routing, and shared admin modals.
- `app/src/components/admin/AdminVolunteers.tsx` - Lets admins review, edit, remove, and inspect volunteers.
- `app/src/components/admin/OverlayPreviewModal.tsx` - Previews sanitized overlay upload geometry and metadata before admin approval.

## `app/src/components/events/`

- `app/src/components/events/EventCard.tsx` - Event card with cover thumbnail, photo gallery disclosure, RSVP/map actions, and the embedded comment thread.
- `app/src/components/events/EventComments.tsx` - Callable-backed, keyboard/screen-reader accessible event discussion thread with batched loading, anonymous posting, edit/delete, reporting, and moderation.
- `app/src/components/events/EventImageGallery.tsx` - Accessible image gallery with captions, thumbnails, and arrow-key navigation.
- `app/src/components/events/ReportCommentDialog.tsx` - Report dialog for event comments following the forum reporting conventions.

## `app/src/components/polls/`

- `app/src/components/polls/PollCard.tsx` - Poll voting card with open/upcoming/closed/voted states, server-fetched results, and error handling.

## `app/src/components/modals/`

- `app/src/components/modals/AuthModal.tsx` - Handles sign-in and account creation forms.
- `app/src/components/modals/ChangeEmailModal.tsx` - Handles verified email-change requests with current-password confirmation and backend progress feedback.
- `app/src/components/modals/ChangePasswordModal.tsx` - Handles password changes with reauthentication and backend progress feedback.
- `app/src/components/modals/DeleteAccountModal.tsx` - Handles account deletion confirmation, password reauthentication, and backend progress feedback.
- `app/src/components/modals/EventFormModal.tsx` - Handles admin event creation/editing with optional map preview and the per-event image manager once the event exists.
- `app/src/components/modals/EventMapModal.tsx` - Shows a selected event map with overlay controls.
- `app/src/components/modals/ImportOverlayModal.tsx` - Handles admin overlay import/upload form UI.
- `app/src/components/modals/NewPostModal.tsx` - Handles forum post creation.
- `app/src/components/modals/ReportContentModal.tsx` - Collects signed-in user report reasons/details for forum posts and replies.
- `app/src/components/modals/RsvpModal.tsx` - Handles event RSVP submission.
- `app/src/components/modals/UserProfileModal.tsx` - Lets admins inspect read-only profile details, toggle moderation, send password resets, anonymize forum activity, and delete user data.

## `app/src/components/shared/`

- `app/src/components/shared/AccountMenu.tsx` - Shows the signed-in greeting, account, admin, and sign-out controls.
- `app/src/components/shared/BackendProgressOverlay.tsx` - Blocks interaction and shows a spinner/message while Firebase backend work is in progress.
- `app/src/components/shared/Markdown.tsx` - Renders GitHub-flavored markdown without raw HTML.
- `app/src/components/shared/MarkdownEditor.tsx` - Provides markdown editing controls and preview mode.
- `app/src/components/shared/OverlaySwatch.tsx` - Renders compact overlay color/pattern swatches.
- `app/src/components/shared/StorageImage.tsx` - Renders an image from a trusted Storage path with loading and failure states.
- `app/src/components/shared/TabBadge.tsx` - Displays compact counts on navigation tabs.
- `app/src/components/shared/VoteButtons.tsx` - Renders upvote and downvote controls for posts and replies.

## `app/src/components/user/`

- `app/src/components/user/AboutMe.tsx` - Renders editable about-me content in card or inline variants.
- `app/src/components/user/AccountSettings.tsx` - Provides user-facing account settings for email, password, profile, deletion, and backend progress-backed account actions.
- `app/src/components/user/NotificationSettings.tsx` - Profile card for turning push on per device and choosing push/daily-email per topic.
- `app/src/components/user/UserView.tsx` - Provides the volunteer shell, route-driven page switching (including Events and Polls), auth/profile actions, and shared user/report modals.

## `app/src/components/user/pages/`

- `app/src/components/user/pages/EventsPage.tsx` - `/events` list of volunteer events rendered as event cards.
- `app/src/components/user/pages/EventDetailPage.tsx` - `/events/:eventId` detail view with gallery, comments, and any linked polls.
- `app/src/components/user/pages/PollsPage.tsx` - `/polls` list of published polls with load/empty/error states.
- `app/src/components/user/pages/PollDetailPage.tsx` - `/polls/:pollId` single poll view with its linked event.
- `app/src/components/user/pages/CookiePage.tsx` - Displays the cookie policy page.
- `app/src/components/user/pages/DocumentsPage.tsx` - Lists published documents and opens the document viewer.
- `app/src/components/user/pages/ForumPage.tsx` - Displays forum posts, replies, voting, per-user report status, report entry points, and new-post entry points.
- `app/src/components/user/pages/HomePage.tsx` - Renders the home page with mission content, map overlays, FAQ, and signup calls to action.
- `app/src/components/user/pages/PlantsPage.tsx` - Shows invasive plant guidance and guarded external reference links.
- `app/src/components/user/pages/PrivacyPage.tsx` - Displays the privacy policy page, including profile-message contact disclosure.
- `app/src/components/user/pages/ProfilePage.tsx` - Shows and edits the signed-in user's profile, RSVPs, documents (with self-service deletion and confirmation), comments, account settings, and a contact-message thread that displays admin replies.

## `app/tests/`

- `app/tests/setup.ts` - Installs jest-dom matchers, cleanup behavior, browser API mocks, and shared test setup.

## `app/tests/e2e/`

- `app/tests/e2e/forum-admin-delete.spec.ts` - Runs an MFA admin deleting a reported thread through the admin panel while a member is replying to it, and verifies the member's recovery path, server cleanup, audit log, and non-admin denial.
- `app/tests/e2e/forum-live-thread.spec.ts` - Verifies an open thread and reply draft survive live replies, votes, reports, moderation, other threads changing, focus changes, and network loss, then a thread removal.
- `app/tests/e2e/callable-functions.spec.ts` - Exercises callable Functions against Firebase emulators for public, auth, username uniqueness, forum reports, document, admin, forum, and overlay workflows.
- `app/tests/e2e/volunteer-journey.spec.ts` - Runs Playwright visitor and signed-in volunteer journeys against local Firebase emulators.

## `app/tests/integration/`

- `app/tests/integration/homePage.test.tsx` - Verifies public home-page rendering, signup flows, validation, and context-backed submission behavior.
- `app/tests/integration/markdownRender.test.tsx` - Verifies markdown rendering safety and external-link attributes.
- `app/tests/integration/newPost.test.tsx` - Tests forum post creation behavior and Create Post submission copy through context and modal UI.
- `app/tests/integration/recovery.test.tsx` - Tests graceful UI recovery when callable-backed submissions fail.
- `app/tests/integration/userFlows.test.tsx` - Exercises visitor navigation, plant URL guards, signup, auth, event/forum reporting, document, profile, backend progress, and signed-in greeting flows.

## `app/tests/rules/`

- `app/tests/rules/firestore.rules.test.ts` - Tests Firestore rules now that writes, username reservations, and forum report records are owned by callable Functions.
- `app/tests/rules/overlayUploads.rules.test.ts` - Tests overlay upload read access and direct-write denial.
- `app/tests/rules/storage.rules.test.ts` - Tests Storage rules for document uploads, document reads, metadata publishing, and site profile images.

## `app/tests/unit/`

- `app/tests/unit/adminDocuments.test.tsx` - Unit tests that AdminDocuments surfaces document moderation failures to admins.
- `app/tests/unit/adminMessaging.test.tsx` - Unit tests the admin dashboard reply controls for member contact messages, including success and failure paths.
- `app/tests/unit/adminUsers.test.tsx` - Unit tests the admin registered-user directory search and profile navigation.
- `app/tests/unit/csvSafe.test.ts` - Unit tests CSV formula-injection escaping, quoting, mailing-list rows, and export file names.
- `app/tests/unit/eventMediaAndPolls.test.ts` - Unit tests event image type/size/path rules, comment validation and anonymity labels, and poll option/window/result-visibility rules.
- `app/tests/unit/forumListener.test.tsx` - Unit tests the forum listener's cache versus server-confirmed state and its retry after a failed listener.
- `app/tests/unit/forumAnonymization.test.ts` - Unit tests forum anonymization update-shape behavior.
- `app/tests/unit/geojson.test.ts` - Unit tests GeoJSON sanitization and property pruning.
- `app/tests/unit/htmlEscape.test.ts` - Unit tests HTML escaping and attribute breakout defense.
- `app/tests/unit/mapSafe.test.ts` - Unit tests map color, number, label, and image URL safety helpers.
- `app/tests/unit/notifications.test.ts` - Unit tests notification preferences, reply recipients, message wording, link safety, and digest email escaping.
- `app/tests/unit/notificationSettings.test.tsx` - Unit tests the profile notification card's saving, rollback, device enablement, iPhone guidance, and verification gating.
- `app/tests/unit/adminEmailSettings.test.tsx` - Unit tests the admin digest settings (no password field, save, test email, admin-only).
- `app/tests/unit/overlayApprovalService.test.ts` - Unit tests callable-backed overlay approval service wrappers.
- `app/tests/unit/sanitize.test.ts` - Unit tests input limits, sanitizers, malicious-pattern detection, markdown safety, and site-content shape.

## `doc/`

- `doc/2026-07-events-polls-mailing-list.md` - Write-up of the event images, event comments, polls, mailing-list export, and routing work plus ancillary findings.
- `doc/2026-10-forum-thread-reliability.md` - Write-up of the forum thread routing, loading, reply, and removal fixes, plus open follow-up findings.
