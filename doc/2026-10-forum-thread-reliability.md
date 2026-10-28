# Forum thread reliability: routing, loading, replies, and removals

_Write-up of the October 2026 forum fixes and the follow-up findings that still need work._

Members reported that the forum URL and the visible discussion did not always
match, that threads vanished during navigation, that notification links opened
to "no discussion", that reply drafts disappeared while typing, and that the
page sometimes crashed mid-reply. This document records what was changed, how
it was verified, and what was found along the way but deliberately left for
later.

---

## 1. What changed

| Problem | Cause | Fix |
| --- | --- | --- |
| URL and open thread drift apart; threads reappear or vanish on Back/Forward/refresh | The open thread lived in React state only; the URL stayed `/forum` | `/forum/:postId` route is the source of truth (`router/routes.ts`, `AppContext.tsx`). Legacy `/forum?post=<id>` links are canonicalized by `useRoute`. Notification links now use `/forum/<id>`. |
| Notification link says the thread does not exist | The page showed "No posts yet" before the forum listener answered; a failed listener stayed dead for the session; an empty offline cache read as "missing" | `usePublicData` exposes `forumSynced` (server-confirmed, via `includeMetadataChanges`), `forumError`, and `retryForum`. `ForumPage` shows cached content immediately but only declares a thread missing, or the forum empty, after the server answers. |
| Page swapped for "Account unavailable" mid-reply | A transient profile read failure during a background token refresh (which a callable such as `submitReply` can trigger) cleared the signed-in user | `useAuth` keeps the profile already on screen for background refreshes; explicit retries still report errors. |
| Duplicate or half-written replies | Repeated Enter while sending; Enter confirming an IME composition | One in-flight reply at a time; IME Enter ignored. |
| Draft in thread B wiped after a reply in thread A finished sending | `handleReply` cleared the reply box unconditionally on completion | Completion removes only the sent text, and only in the thread it was sent from. Pending/failure notices are scoped to that thread. |
| Thread removed by a moderator while open | Page fell back silently | "This discussion has been removed" with focus moved to it and a **Back to forum** link. Links to threads that are already gone say "This discussion isn't available". Reply drafts and reply errors reset when leaving a thread, so they cannot resurface in the New Post dialog. |
| Admin forum icon buttons had no accessible names | Icon-only buttons | View/Approve/Delete post buttons are labelled, e.g. `Delete post: <title>`. |

### Verification

- Unit and integration (`npm run test:run --workspace app`): routes, listener sync/retry, auth refresh, thread removal, cross-thread reply completion, IME/double Enter.
- Emulator e2e (`npm run test:e2e --workspace app`, 53 tests):
  - `forum-admin-delete.spec.ts` — an MFA admin deletes a reported thread through the admin panel while a member is replying; covers the member's recovery path, non-admin denial, server cleanup (pending replies, anonymous author records, anonymous thread record), the audit log, and late replies being refused.
  - `forum-live-thread.spec.ts` — the open thread and draft survive live replies, votes, reports, reply removal, account deletion scrubs, other threads changing, focus changes, and a 12-second network outage; then the thread is removed.
  - `volunteer-journey.spec.ts` — thread URLs, legacy links, refresh, Back/Forward, nav links, missing threads, and a double-Enter reply.

Several fixes (token-refresh failure, offline cache, IME) came from code analysis
and were proven with unit tests, not reproduced against production. Watch the
`auth-listener` and `forum-listener` error logs after deploying.

---

## 2. Open findings

Ordered roughly by impact. None of these are addressed by this change.

### 2.1 Deleted content is still emailed in the daily digest — high

`notificationDigestItems` store the message title, body (a reply excerpt), and
link, and live up to three days (`functions/src/lib/notify.ts`, `queueDigest`).
`deleteForumPost` and `deleteForumReply` (`functions/src/callables/admin.ts`)
do not touch them, so a thread or reply removed by a moderator can still go out
in that night's digest email.

Suggested fix: on thread deletion, delete queued digest items whose `link` is
`/forum/<postId>` (also match the legacy `/forum?post=<postId>` form). For
reply deletion, store the `replyId` on reply digest items so they can be purged
individually. Add both to `forum-admin-delete.spec.ts`.

### 2.2 Reports survive deletion, including reporter PII — high

`forumReports` keep up to 240 characters of the reported text plus the
reporter's name, username, and email (`flagContent` in
`functions/src/callables/forum.ts`). Deleting the thread or reply leaves these
documents in place, and the admin panel no longer shows them, so they are
retained indefinitely without anyone seeing them.

Decision needed: delete them with the content, or keep them for moderation
history with the excerpt and reporter details stripped. Either way, extend
`deleteForumPost`/`deleteForumReply` and the e2e test.

### 2.3 Other admins keep seeing a deleted thread — medium

`AdminForum.tsx` renders the moderation thread view from
`forumPosts.find(...) || adminViewThread`. Only the admin who clicked Delete has
`adminViewThread` cleared; any other admin with that thread open keeps seeing
the stale copy, including replies, and can act on it. Suggested fix: drop the
fallback and show the same "has been removed" state used on the member side.

### 2.4 Account switch in another tab carries a draft to the wrong account — medium

Firebase Auth shares one session per browser. Signing in as someone else in a
second tab makes the first tab briefly show the loading screen (the thread
"disappears"), then return signed in as the other account with the reply draft
still in the box. Sending it posts under the other account. Confirmed in an
exploratory Playwright run. Testers using two accounts in one browser will hit
this every time.

Suggested fix: clear reply drafts and the New Post form when the signed-in uid
changes, and explain why ("You signed in as @other in another tab").

### 2.5 Keystrokes typed while a reply is sending are dropped — medium

`runBackendTask` covers the page with the "Posting reply..." overlay and makes
it `inert`. Anything typed after pressing Enter, until the callable returns
(seconds on a Functions cold start), is silently discarded. Confirmed in a real
browser. Members experience this as "what I typed vanished".

Suggested fix: replies should not use the global blocking overlay. Show an
inline "Sending..." state, disable only the send button, keep the box editable,
and rely on the existing scoped completion logic to remove just the sent text.

### 2.6 Admin delete is one click and permanent — decision needed

The Delete post buttons delete immediately with no confirmation and no undo
(the audit log records it). Consider an in-page confirmation (browser
`confirm()` is not appropriate here) or a soft-delete with a short undo window.
If a soft-delete or "unpublish" state is ever added, update `ForumPage`: it
currently treats any open thread that disappears as "removed by a moderator"
because approved posts never return to moderation today.

### 2.7 Orphaned per-user markers after deletion — low

Users' `votes` and `reportedContent` maps keep keys for deleted posts and
replies. `castVote` on a reply that no longer exists still toggles the user's
vote key while changing nothing on the post. Harmless today; clean up when
touching vote or deletion code.

### 2.8 Delivered push notifications cannot be recalled — note

A push notification already on a device keeps the deleted thread's title and
excerpt. This cannot be withdrawn server-side; tapping it now lands on the
"isn't available" page. Document in the moderation guidance.

### 2.9 Forum unavailable when App Check blocks Firestore — watch

If App Check is enforced for Firestore in production (a console setting, not in
this repo), members whose reCAPTCHA is blocked (privacy extensions, some
networks) get a permanent listener error. The forum now shows a "Could not load
the forum" message with Try again instead of an empty page, but retries will
keep failing. Check the enforcement setting and the `forum-listener` error rate.

---

## 3. Test and tooling notes

### 3.1 `markdownRender.test.tsx` fails to load — pre-existing

The file fails with `auth/invalid-api-key` before running any test, on the
original commit as well. `Markdown` imports `AppLink`, which imports
`AppContext`, which initializes Firebase without the `VITE_FIREBASE_*`
variables the test environment lacks. Fix by mocking `../../src/firebase` (or
`AppLink`) in that test.

### 3.2 E2E on machines with an HTTP proxy and gcloud credentials

On a machine where `HTTPS_PROXY` points at a local proxy and
`~/.config/gcloud/application_default_credentials.json` exists, the Firebase CLI
hangs before starting the emulators. Its credential lookup asks the GCE metadata
server for a project ID through the proxy and never gets an answer.
`METADATA_SERVER_DETECTION=none` does not cover that request. This works:

```
GOOGLE_CLOUD_PROJECT=demo-watershed NO_PROXY=127.0.0.1,localhost,::1 npm run test:e2e --workspace app
```

Consider setting both variables in `app/scripts/run-e2e.mjs` for the emulator
child process, since the suite always uses the `demo-watershed` project.
