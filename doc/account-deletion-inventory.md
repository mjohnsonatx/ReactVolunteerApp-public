# Account deletion inventory

The `deleteAccountData` service in `functions/src/lib/userData.ts` is called by both `deleteOwnAccountData` and `adminDeleteUserData`. It locks the profile first, performs cleanup, then deletes Firebase Authentication and the profile. A failed cleanup leaves the profile locked for a retry.

| Location | Identifier or personal data | Deletion behavior |
| --- | --- | --- |
| Firebase Authentication; `users`, `userNames` | UID, email, names, claims | Delete after other cleanup |
| `forumPosts`, `forumPendingReplies` | Author UID, name, user name, authored text | Replace identity and authored text with deletion labels |
| `forumReports` | Reporter or target UID, names, email, excerpts, details | Delete reporter reports; anonymize target reports |
| `eventComments`, `eventCommentReports` | Author, reporter, target, moderator identity and text | Delete authored comments and associated reports; remove moderator identifiers |
| `pollVotes` | Member UID, voter key, ballot | Delete member vote record; retain aggregate poll totals |
| `polls` | Creator and updater UID | Remove UID fields |
| `rsvps`, `profileMessages` | UID, names, email, submitted text | Delete |
| `documents`, upload tickets, upload quotas, `documents/{uid}/` Storage objects | UID, names, email, files | Delete records and every object under the user's Storage prefix, including orphan uploads |
| `mailingList`, `volunteers` | Matching account email and submitted contact details | Delete matching records |
| `errorLogs`, `rateLimits` | UID and linked diagnostic or throttle data | Delete UID-linked logs and rate-limit keys |
| `overlayUploads` | Uploader UID or email, reviewer UID | Delete uploader records; remove reviewer UID fields |
| `siteContent/main` | Last updater UID | Remove UID field |

Guest poll identifiers and unauthenticated volunteer or mailing-list submissions cannot always be attributed to an account UID. A member may request help identifying and deleting those independent records. Provider logs and backups are outside this Firestore cleanup and follow their configured retention policies; verify those settings before public launch.

When adding a collection, Storage path, or external processor containing a UID, email, or user name, update this inventory, the shared service, and its emulator tests together.
