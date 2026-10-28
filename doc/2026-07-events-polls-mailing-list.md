# Events media, event discussion, polls, mailing-list export, and routing

_Implementation write-up for the pre-soft-launch feature round._

This document describes what was built, where it lives, the security model behind
each feature, and the ancillary findings that came out of the work.

---

## 1. Conventional routes

The app previously kept the visible screen in React state only, so every page
shared a single URL. Routing is now history-based and URL-driven.

| Route | Screen |
| --- | --- |
| `/` | Home |
| `/events` | Events list |
| `/events/:eventId` | Event detail (gallery, comments, linked polls) |
| `/polls` | Published polls |
| `/polls/:pollId` | Single poll |
| `/forum/:postId` | Forum thread (legacy `/forum?post=<id>` links redirect here) |
| `/forum`, `/documents`, `/plants`, `/profile`, `/privacy`, `/cookies` | Existing pages |
| `/admin/events` | Admin events + image manager + comment moderation |
| `/admin/polls` | Admin poll console |
| `/admin/mailing-list` | Admin mailing list + CSV export |
| `/admin/<tab>` | The remaining admin tabs (`dashboard`, `content`, `users`, `volunteers`, `overlays`, `documents`, `forum`) |

Implementation:

- `app/src/router/routes.ts` - `parseRoute()` / `pathForPage()` / `pathForAdminTab()`,
  including a legacy alias so the old `calendar` page id still resolves to `/events`.
- `app/src/hooks/useRoute.ts` - `history.pushState` + `popstate` state, no new dependency.
- `app/src/context/AppContext.tsx` - `view`, `page`, and `adminTab` are now derived from
  the route; `setPage`, `setView`, `setAdminTab`, `goToEvent`, and `goToPoll` navigate.

Firebase Hosting already rewrites `**` to `/index.html`, so deep links survive a
hard refresh. Admin routes render the admin shell only when the account actually
carries the `admin` claim (`App.tsx`), and signing out redirects back to `/`.

---

## 2. Event images

### Data model

Images live on the event document (`events/{eventId}`):

```jsonc
{
  "images": [
    {
      "id": "j7fk29dl3msa0z1x8pqr",     // lowercase alphanumeric, server generated
      "storagePath": "events/{eventId}/{imageId}.jpg",
      "thumbnailPath": "events/{eventId}/{imageId}_thumb.jpg",
      "contentType": "image/jpeg",
      "caption": "Volunteers at the outfall",
      "size": 482113,                    // verified from the stored object
      "width": 1600, "height": 1200,
      "order": 0,
      "uploadedAt": "<Timestamp>"
    }
  ],
  "coverImageId": "j7fk29dl3msa0z1x8pqr",
  "imageCount": 1
}
```

Only **trusted scope paths** are stored - never download URLs. The browser
resolves a short-lived URL at render time through
`app/src/services/storageUrls.ts` (cached per path), so rotating a token or
changing rules cannot leave stale, publicly guessable URLs in Firestore.

Storage layout matches the existing conventions: `events/{eventId}/{imageId}.{extension}`
(the card thumbnail uses the same folder with the `_thumb.jpg` suffix).

### Upload pipeline (admin only)

1. **Client gate** - `validateEventImageFile()` (`shared/src/eventMedia.ts`) rejects
   anything that is not `image/jpeg`, `image/png`, or `image/webp`, or larger than
   **5 MB**, before a byte is uploaded.
2. **Server ticket** - `createEventImageUploadTicket` (admin-only callable) checks the
   event exists, the per-event limit (12), the type, and the size, then returns the
   reserved `storagePath`. Clients never invent their own paths.
3. **Resumable upload** with progress - `uploadBytesResumable` drives the percentage in
   the admin UI (`app/src/services/eventImages.ts`).
4. **Thumbnail** - the existing `makeThumbnail()` helper produces a small JPEG for the
   event card. A thumbnail failure is non-fatal (the card falls back to the full image)
   and is still reported to the error log.
5. **Confirmation** - `attachEventImage` re-reads the object from the bucket and records
   the *actual* size and content type; a mismatch (or oversize object) deletes the object
   and fails the call. Only then is the image written to the event document.

### Editing after publication

`updateEventImage` (caption + cover selection) and `deleteEventImage` are separate
admin callables, so images can be added, re-captioned, re-covered, or removed at
any time after the event is published. The admin manager is reachable from
`/admin/events` ("Images") and from inside the event edit modal.

### Storage janitor

`functions/src/triggers/eventMediaCleanup.ts` (`cleanupEventImages`,
`onDocumentWritten('events/{eventId}')`):

- diffs the image paths before/after each write and deletes any object that no longer
  has a record (covers "removed from the admin panel" and replacements);
- deletes the entire `events/{eventId}/` prefix when the event document is deleted.

### Public rendering

- Event cards show a **thumbnail of the cover image** (`EventCard.tsx`).
- One or more images open an accessible **gallery** with per-image captions,
  arrow-key navigation, thumbnail strip, and a live region announcing the position
  (`EventImageGallery.tsx`).
- `StorageImage.tsx` renders loading, error ("Image unavailable"), and ready states.

### Status, failure, and crash reporting

The admin manager reports `validating -> uploading (n%) -> processing -> saving -> done`,
an explicit empty state ("No images yet..."), the per-event limit state, and inline
failures. Every failure path calls `recordCrash()`
(`app/src/utils/crashReporting.ts`).

> **Crashlytics note:** Firebase Crashlytics has **no Web SDK** (Android/iOS/Unity only).
> `recordCrash()` is a single-file shim that routes the same signal into the existing
> `logClientError` callable -> `errorLogs` collection (admin-readable, already surfaced in
> the admin dashboard). Swapping in a real Crashlytics/Sentry transport later is a
> one-file change.

---

## 3. Event comments (the "little forum" per event)

### Data model

`eventComments/{commentId}`:

```jsonc
{
  "eventId": "...", "body": "...",
  "authorId": "<uid>", "authorName": "Jane", "authorUserName": "jane-d",
  "anonymous": true,                 // display choice only
  "status": "approved | pending | removed",
  "flagged": false, "reportCount": 0,
  "edited": false, "editedAt": null,
  "createdAt": "<Timestamp>", "updatedAt": "<Timestamp>"
}
```

`eventCommentReports/{commentId}_{reporterUid}` mirrors the existing `forumReports`
shape (reason, label, details, reporter identity, excerpt, target author, status).

### Callables (`functions/src/callables/eventComments.ts`)

| Callable | Who | Notes |
| --- | --- | --- |
| `listEventComments` | anyone | Batched: `limit` (default 10, max 25) + `cursor`; non-admins only ever receive `approved` comments plus their own pending one |
| `submitEventComment` | signed-in | Sanitized, malicious-pattern checked, rate limited (20/h); moderated users post as `pending` |
| `editEventComment` | author | Sets `edited`, `editedAt`, `updatedAt` |
| `deleteEventComment` | author or admin | Also deletes the related report records |
| `reportEventComment` | signed-in | Flag -> dialog -> report record, one per person, cannot report your own |
| `moderateEventComment` | admin | `approve` / `remove` |

### Anonymity

A comment posted anonymously is returned to the public with
`authorLabel: "Anonymous member"` and **no** name fields. Admin callers get
`authorId`, `authorName`, and `authorUserName` in the same payload, and the admin UI
shows an "anonymous, really posted by X" badge. Because Firestore rules deny direct
reads of `eventComments` to non-admins, the anonymity cannot be bypassed by querying
the collection.

### UI

`app/src/components/events/EventComments.tsx` is embedded in each event card as a
disclosure ("Questions & comments (n)") and rendered inline on the event detail page.

- Signed-in members get the composer with an explicit "Post anonymously" checkbox and a
  character counter; visitors get a "Sign in to join the conversation" button.
- Authors can edit and delete their own comments; edited comments show "(edited)".
- Reporting reuses the forum convention: a small flag button opens
  `ReportCommentDialog` (reason select + details + errors); once reported the button
  reads "Reported" and is disabled.
- Batches load 10 at a time with a "Load more comments" button.
- Status/failure states: loading, empty, submit error, row-level errors, moderation
  notice ("awaiting moderator review"), and a visually hidden `role="status"` live region.
- Accessibility: labelled controls, `aria-expanded`/`aria-controls` on the disclosure,
  `role="alert"` for errors, `<time>` elements, semantic list markup, and keyboard-only
  operation throughout.

---

## 4. Polls

### Data model

`polls/{pollId}`:

```jsonc
{
  "question": "...", "description": "...", "notes": "...",
  "options": [{ "id": "saturday", "label": "Saturday", "order": 0 }],   // 2..15
  "votingMode": "single | multiple | ranked",
  "maxRankedChoices": null,             // ranked: integer 1..number of options
  "status": "draft | published | closed | archived",
  "audience": "members | guests | anyone",
  "resultVisibility": "beforeVote | afterVote | afterClose | adminOnly",
  "resultAudience": "public | members",
  "allowVoteChange": false,
  "showParticipation": true,
  "privateVotes": true,
  "opensAt": null, "closesAt": null,
  "eventId": "",                       // optional link to an event
  "tallies": { "saturday": 12 }, "totalVotes": 12,
  "createdAt": "...", "updatedAt": "...", "publishedAt": "...", "closedAt": "...", "archivedAt": "..."
}
```

`pollVotes/{pollId}__{voterKey}` - the document id **is** the duplicate guard:

```jsonc
{
  "pollId": "...", "userId": "<uid or hashed guest key>", "voterKey": "u:<uid> | g:<hash>",
  "voterType": "member | guest", "optionId": "saturday", // first choice, for legacy clients
  "optionIds": ["saturday"],            // selected options, in preference order for ranked polls
  "anonymousVoter": false, "privateVote": true,
  "createdAt": "...", "updatedAt": "...", "changeCount": 0
}
```

Polls without `votingMode` remain single-choice. Existing ballots containing only
`optionId` remain readable and can be changed when the poll permits it.

**Voting methods and results**

- **Single choice**: exactly one option, worth one vote.
- **Select all that work**: any nonempty subset of options, each worth one vote.
  Percentages use the number of respondents, so their sum can exceed 100%.
- **Rank up to K choices**: one through K distinct options, ordered by preference.
  First choice earns K points, second K−1, and so on; unranked options earn zero.
  Partial ballots use the same fixed K. Results sort by points and show equal scores
  as ties, without choosing an arbitrary winner.

`totalVotes` always counts respondents, not selections or points. `tallies` stores
selection counts for single/multiple polls and points for ranked polls.

**The voter key used to enforce one ballot per poll per member or guest browser**

- Signed-in members: `u:<firebase uid>`.
- Guests: `g:` + `sha256(POLL_VOTE_SALT + ':' + pollId + ':' + participantId)` truncated to
  32 hex chars. `participantId` is a random browser-local value
  (`app/src/utils/participant.ts`); the raw value is never stored, and the per-poll salt
  means the same browser cannot be correlated across polls from the stored records.

### Callables (`functions/src/callables/polls.ts`)

Admin: `savePoll` (create/edit), `setPollStatus` (draft/publish/close/archive),
`deletePoll` (removes vote records in Firestore-safe batches), `listAdminPolls`,
`listPollVotes`.

Public: `listPolls`, `getPoll`, `getPollResults`, `listPublicPollVotes`,
`castPollVote`.

### Server-side enforcement

- **Options**: 2-15, sanitized, deduplicated ids, malicious-pattern checked on the raw
  input (so an injected payload is rejected instead of quietly stripped).
- **Open/close**: `pollWindowState()` combines `status`, `opensAt`, and `closesAt` and is
  re-evaluated **inside the vote transaction**, so a poll that closes mid-request rejects.
- **Ballot validation**: all submitted `optionIds` must belong to the poll. Empty,
  duplicate, unknown, and over-limit choices are rejected. The server applies the
  voting method and K inside the transaction, without trusting client-supplied scores.
- **Duplicates and counter manipulation**: the deterministic vote id plus a Firestore
  transaction means a second vote either fails (`already-exists`) or replaces the
  entire ballot when `allowVoteChange` is on. Replacement subtracts the previous
  ballot's contributions and adds the new ones atomically without increasing the
  respondent count. Retrying the same ballot is a no-op when changes are enabled.
  Poll edits also use transactions, so an organizer save cannot overwrite concurrent
  vote totals. Clients cannot write `polls` or `pollVotes` at all.
- **Auth/audience toggle**: `members`, `guests`, or `anyone`; `castPollVote` additionally
  calls `requireAppCheck()` so even guest votes must carry a valid App Check token
  (App Check is enforced platform-wide by `callableOptions` outside the emulator).
- **Abuse/rate limiting**: 30 votes/hour per voter key, 10/hour per poll/IP,
  60/hour per IP across polls, plus generous read limits on list/get/results callables.
- **Result visibility**: `canSeeResults()` (shared) is applied server-side; tallies are
  omitted from the payload entirely when they are not allowed to be seen. Editing options,
  voting method, or K is blocked once votes exist, which protects historical tallies.
- **Everything admin-only**: create/edit/publish/close/archive/delete and private-vote
  inspection all require the `admin` claim. Organizer notes are stripped from every
  non-admin response.

### Member / non-member experience

`/polls` and `/polls/:pollId` list published (and recently closed) polls with clear
states - **open**, **opens soon** (with the date), **closed**, **you voted**,
**members only**, and the participation count when the poll allows it.
Single-choice voting uses radios; multiple and ranked voting use checkboxes. Ranked
ballots have an ordered selection list with labelled up/down buttons and a K limit.
Each result has a `role="meter"` bar, with points shown for ranked polls.
**Totals always come from `listPolls` / `getPoll` / `getPollResults`** - the client never
computes or reads them from Firestore. Polls linked to an event also appear on that
event's detail page.

Admin console (`/admin/polls`): create/edit with voting method, ranking limit,
description, notes, opening/closing
dates, audience, result visibility, result audience, "allow answer changes",
"show participation", "keep votes private", and an optional linked event.

When individual vote privacy is disabled, the poll warns voters and exposes a
callable-backed response roster only after that viewer may see results. Signed-in
members are shown by display name; guest identifiers and all UIDs remain hidden. Votes
cast while privacy was enabled stay private if the setting later changes.

### Manual availability-poll check

1. Create a poll with three dates, choose **Select all that work**, enable answer
   changes, and publish. Select two dates as a voter: both should receive one vote,
   and participation should show one response. Replace the selection and confirm
   the old choice is removed while participation stays at one.
2. Create another poll with **Rank up to K choices**, set K to 2, and publish.
   Select two dates, move the second to first place, and submit. Results should give
   the first date 2 points and the second 1. Reload to confirm the saved order.
   Submit just one date to confirm partial rankings are accepted and still earn 2 points.
3. Respond from a second browser/account and verify the combined points and any ties.
   Check that results and public responses follow the chosen visibility/privacy settings.
   Once responses exist, the admin editor must disable options, voting method, and K.

---

## 5. Mailing list export

`exportMailingListCsv` (admin-only callable, rate limited) returns:

```jsonc
{ "csv": "...", "filename": "watershedcrew-mailing-list-2026-07-10.csv",
  "count": 42, "generatedAt": "2026-07-10T18:22:00.000Z", "truncated": false }
```

- Columns: **Email**, **Subscription Date** (ISO 8601), **Status** (`subscribed` /
  `unsubscribed` / stored value).
- **Formula-injection defense** (`shared/src/csvSafe.ts`): any field starting with
  `=`, `+`, `-`, `@`, TAB, CR, or LF is prefixed with `'`; C0 control characters are
  stripped; every cell is quoted and inner quotes doubled, so a payload cannot break out
  of its cell either.
- **Predictable file names**: `watershedcrew-mailing-list-YYYY-MM-DD.csv` - repeatable and
  sortable.
- The admin tab shows subscriber rows in a real table, an explicit empty-list message,
  and success ("Exported N subscribers to <file>") or failure feedback.
- Non-admins cannot reach any of it: the callable requires the admin claim, the
  `mailingList` collection is admin-read-only in the rules, and the admin shell only
  renders for admin accounts.

Unit tests: `app/tests/unit/csvSafe.test.ts` covers the trigger characters, quote
escaping, cell breakout, header row, and file naming.

---

## 6. Security rules and indexes

### Storage (`firebase_rules/storage.rules`)

```
match /events/{eventId}/{fileName} {
  allow read: if true;
  allow create, update: if isAdmin()
                        && isEventImageName(fileName)      // [a-z0-9]{6,40}(_thumb)?.(jpg|jpeg|png|webp)
                        && request.resource.size <= 5 * 1024 * 1024
                        && contentType matches image/jpeg|image/png|image/webp;
  allow delete: if isAdmin();
}
```

The 5 MB cap and the type allow-list exist in three places (client, callable, rules)
and are all fed by the same shared constants.

### Firestore (`firebase_rules/firestore.rules`)

`eventComments`, `eventCommentReports`, `polls`, and `pollVotes` are **admin read,
nobody write** - all mutations and all member-facing reads go through callables. That
is what makes anonymous comments and pre-close poll results impossible to scrape.

### Composite indexes (`firestore.indexes.json`)

- `eventComments`: `eventId + status + createdAt desc`, `eventId + createdAt desc`,
  `eventId + authorId + status + createdAt desc`, `authorId + createdAt desc`
- `eventCommentReports`: `status + createdAt desc`, `commentId + createdAt desc`
- `polls`: `status + createdAt desc`, `eventId + status + createdAt desc`
- `pollVotes`: `pollId + createdAt desc`, `pollId + userId + updatedAt desc`,
  `pollId + privateVote + createdAt desc`, `pollId + optionId + createdAt desc`,
  `userId + createdAt desc`

---

## 7. Files added / changed (summary)

**Shared:** `eventMedia.ts`, `eventComments.ts`, `polls.ts`, `csvSafe.ts`, new `LIMITS`
entries.

**Functions:** `callables/eventImages.ts`, `callables/eventComments.ts`,
`callables/polls.ts`, `callables/mailingList.ts`, `triggers/eventMediaCleanup.ts`,
`lib/ids.ts`, `lib/guards.ts` (`requireAppCheck`), `index.ts` exports.

**App:** `router/routes.ts`, `hooks/useRoute.ts`, `services/{storageUrls,eventImages,
eventComments,polls,mailingListExport}.ts`, `utils/{crashReporting,participant,
eventImageList}.ts`, `components/shared/StorageImage.tsx`,
`components/events/{EventCard,EventComments,EventImageGallery,ReportCommentDialog}.tsx`,
`components/polls/PollCard.tsx`,
`components/user/pages/{EventsPage,EventDetailPage,PollsPage,PollDetailPage}.tsx`,
`components/admin/{AdminEventImages,AdminPolls}.tsx`, updated `AdminEvents`,
`AdminMailing`, `AdminView`, `UserView`, `EventFormModal`, `AppContext`, `useAdminData`,
`libs/callables.ts`, `utils/sanitize.ts` re-exports.
`components/user/pages/CalendarPage.tsx` was replaced by `EventsPage.tsx`.

**Rules/config:** `firebase_rules/storage.rules`, `firebase_rules/firestore.rules`,
`firestore.indexes.json`.

**CI/CD and harness:** `.github/workflows/{ci,release}.yml`,
`app/scripts/{run-e2e,run-e2e-suite}.mjs`, `app/playwright.config.ts`, and root
quality-gate scripts in `package.json`.

**Tests:** `app/tests/unit/csvSafe.test.ts` (formula injection),
`app/tests/unit/eventMediaAndPolls.test.ts`, new rules cases in
`app/tests/rules/{storage,firestore}.rules.test.ts`, plus resilience fixes in the
existing mocks (see findings).

---

## 8. Ancillary findings

1. **Crashlytics is not available on the web.** The request for "crashlytics logging" is
   implemented through the existing `logClientError` callable + `errorLogs` collection via
   `recordCrash()`. If mobile clients are ever added, that shim is where the real SDK
   plugs in.
2. **Firebase dependencies could not be updated in this environment.** There is no network
   access, and the installed versions already match the manifests exactly
   (`firebase 12.14.0`, `firebase-admin 13.10.0`, `firebase-functions 7.2.5`,
   `firebase-tools 15.19.1`, `@firebase/rules-unit-testing 5.0.1`). The ranges in
   `package.json` are caret ranges, so `npm update` on a networked machine will pick up
   patch/minor releases without any code change. Re-run `npm run ci`,
   `npm run test:rules`, and `npm run test:e2e` afterwards.
3. **CI/CD mirrors the form-focus-landing release gates.** `.github/workflows/ci.yml`
   runs locked installs, lint, type checking, coverage, builds, rules tests, and browser/
   callable integration tests for pushes and pull requests to `main`. Each GitHub runner
   owns its emulator ports, so it does not share Harbor's emulator process. Tagged
   `v*.*.*` builds repeat the gate before creating a GitHub release. The local E2E runner
   also makes Firebase own the Vite/Playwright child lifecycle, which prevents completed
   Playwright runs from leaving a Java emulator process bound to port 8080. Set
   `E2E_APP_PORT` when an existing local web server owns the default port 5173.
4. **Test mocks were brittle.** `tests/integration/userFlows.test.tsx` enumerated every
   `lucide-react` icon and every callable export, so any new icon or callable broke
   unrelated suites. Both mocks are now `Proxy`-based and self-extending. `tests/setup.ts`
   also resets `window.location` to `/` after each test now that the app is URL-routed.
5. **`saveEvent` previously closed the modal on create.** Because images need an event id,
   creating an event now keeps the modal open on the newly created event ("Event created.
   You can add images below.").
6. **Poll option edits after voting are refused**, including relabeling an existing ID,
   rather than silently re-keying or changing the meaning of historical tallies. The
   admin is told to close the poll and create a new one.
7. **`sanitizePollOptions` originally truncated** an over-long option list instead of
   failing. It now keeps (a bounded number of) extras so `validatePoll` can return a real
   "at most 15 options" error.
8. **Rate limiting is Firestore-backed and therefore write-heavy.** The read-side callables
   (`listEventComments`, `listPolls`, `getPoll`, `getPollResults`) use generous limits
   (600/hour) to keep the cost sane for a small neighborhood group; if traffic grows, move
   those counters to memory/Redis or drop the read limits and rely on App Check.
9. **Guest poll voting is best-effort by design.** Clearing browser storage yields a new
   participant id. App Check, per-poll/IP and global-IP limits, and the audience toggle
   are the real defenses; polls that must be strictly one-per-person should use the
   "Signed-in members only" audience.
10. **`POLL_VOTE_SALT` should be set as a Functions environment secret** before launch. It
    defaults to a constant, which is fine for development but should be a real secret in
    production so guest vote keys cannot be recomputed offline.
11. **Event images are capped at 12 per event** (`EVENT_IMAGE_MAX_PER_EVENT`) to keep the
    event document well under the 1 MiB Firestore limit and the gallery usable. Adjust in
    `shared/src/eventMedia.ts` if the group needs more.
12. **No server-side image re-encoding.** Thumbnails are produced in the browser and the
    original bytes are stored as uploaded. If EXIF stripping or server-side resizing
    becomes a requirement, the natural place is a Storage `onFinalize` trigger next to the
    existing cleanup trigger (it needs an image library, which is not installable offline
    right now).
13. **`cors.json` does not list a production domain yet** (still tracked in `TODO.md`).
    Direct-from-browser Storage uploads and reads for event images will need the launch
    domain added there.
14. **`firestore.indexes.json` was git-ignored.** The manifest that `firebase.json`
    points at (`/firestore.indexes.json`) was excluded by `.gitignore`, so index changes
    would never have been reviewed or shipped with the repository. The ignore rule now has
    an explicit negation for that file, with a comment explaining why it is tracked.
15. **Comment pagination uses a `createdAt` cursor.** Two comments written in the same
    millisecond could theoretically straddle a page boundary. For a small neighborhood
    group this is fine; if the volume grows, switch the cursor to a
    `startAfter(createdAtSnapshot)` document cursor (or add a tiebreaker field) and extend
    the composite index accordingly.
16. **Public vote submissions require explicit opt-in.** The `privateVotes` toggle is
    stamped onto each vote. `listPublicPollVotes` returns only records originally cast as
    public, never exposes UIDs or guest keys, and applies the same result-visibility rules
    as the totals callable. The UI warns voters before submission and loads the roster on
    request.

---

## 9. Verification performed before merge

- `npm run ci` - passed config drift checks, lint, both TypeScript builds, production
  bundling/minification verification, and **190 unit/integration tests in 16 files**.
- `npm run test:rules` - **23 Firestore/Storage rules tests in 3 files passed**, including
  callable-owned collections, anonymous comment data, poll/vote privacy, event image
  types, admin-only writes, and the exact 5 MiB boundary.
- `npm run test:e2e` - **15 Playwright tests passed**, covering public and signed-in browser
  journeys plus real callable authorization and mutation flows. The callable suite now
  includes the event-comment anonymity/report/moderation lifecycle, poll publication and
  one-vote/result/privacy enforcement, scoped image upload tickets, and server-side CSV
  injection defense.
- Both GitHub workflow files parsed as valid YAML, and `git diff --check` reported no
  whitespace errors.
