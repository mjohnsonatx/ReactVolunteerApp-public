# Member notifications: browser push and deferred daily email digest

Members can opt in, per topic, to **push notifications** in their browser (Chrome, Edge, Firefox, Safari; Android; iPhone/iPad after **Add to Home Screen**). The daily digest email code is present, but member email controls and live email delivery are deferred until the sender setup is complete.

Topics: replies in threads the member started or replied in, new forum posts, and new volunteer events. Everything is off by default. Members manage push under **Profile → Notifications**.

For real-service preview testing, use the separate development project described in [DEVELOPMENT_FIREBASE.md](DEVELOPMENT_FIREBASE.md). Its email delivery stays disabled until its Brevo SMTP key and login are configured; browser push does not depend on email delivery.

## Cost

- Push goes through Firebase Cloud Messaging, which has no per-message charge.
- Three new Functions run on the Blaze plan's free invocation allowance at this site's volume.
- Brevo's free transactional plan currently allows 300 email sends per day. The digest stops at 250 emails per run to leave room for test messages, and holds the rest until the next day. The sender domain and Cloud DNS have separate costs.

## How it works

| Piece | Where |
| --- | --- |
| Topics, defaults, message and digest wording | `shared/src/notifications.ts` |
| Preferences, push-token, and admin email callables | `functions/src/callables/notifications.ts` |
| Forum/event triggers and the 7 PM digest | `functions/src/triggers/notifications.ts` |
| Push delivery, digest queue, dedupe markers | `functions/src/lib/notify.ts` |
| Transactional ownership and expired-worker checks | `functions/src/lib/notificationLease.ts` |
| Brevo SMTP and the `BREVO_SMTP_KEY` secret | `functions/src/lib/mailer.ts` |
| Member settings card | `app/src/components/user/NotificationSettings.tsx` |
| Admin digest settings (Mailing tab) | `app/src/components/admin/AdminEmailSettings.tsx` |
| Push-only service worker, install manifest, icons | `app/public/sw.js`, `app/public/manifest.webmanifest`, `app/public/icons/` |

- A reply notifies the thread starter and earlier repliers, never the replier. Anonymous authors are resolved server-side through `forumAuthors`, and the message shows only the public anonymous label.
- Replies from moderated members announce when an admin approves them. Posts announce when they first become approved, and `notificationDispatches` stops a re-approved post from being announced twice.
- Dispatch ownership is acquired in a Firestore transaction. Failed dispatches release their claim, and the forum/event triggers retry failures. Completed dispatches stay deduplicated; a crashed worker's claim can be reclaimed after ten minutes. The forum/event triggers and daily digest have a 540-second execution limit, shorter than the lease; `verify:runtime-identities` checks this boundary and the retry settings.
- A digest queue item and its delivery receipt commit in the same transaction. Retrying a partially completed dispatch cannot duplicate items or recreate ones already consumed by a digest. Acknowledged push tokens also retain receipts, so partial FCM failures retry only the remaining tokens.
- The daily digest takes a transactional lock before reading its queue. Overlapping runs skip sending; exceptions release the lock, and abandoned locks expire. Queue removal checks ownership in its transaction so an expired worker cannot delete another worker's work.
- Firestore rules deny all client access to `notificationSettings`, `notificationTokens`, `notificationDigestItems`, `notificationDispatches`, and `notificationConfig`. Clients go through the callables.
- The notification Functions run as the dedicated `tsv-notify` service account. Only it should read `BREVO_SMTP_KEY`, and only `sendDailyDigest`, `getEmailDeliverySettings`, and `sendTestEmail` bind that secret when email delivery is enabled. `npm run verify:runtime-identities` enforces the binding inventory.
- Signing out turns off push on that browser. Deleting an account removes the member's settings, push registrations, and queued digest lines.

### Delivery boundary and regression tests

Firestore ownership, receipts, and queue writes are atomic. Brevo SMTP and FCM are external services and cannot participate in those transactions: if a provider accepts a message and the process dies before recording the acknowledgement, a retry may send it again. This is not an exactly-once delivery guarantee. A failed digest retains its items for the next daily run; no automatic SMTP retry is configured. Delivery receipts contain hashed recipient identifiers and expire with the dispatch TTL policy.

`npm run test:e2e` includes `app/tests/e2e/notification-delivery.spec.ts`. These regression tests use real emulator transactions and replace only FCM/SMTP delivery. They cover overlapping dispatch/digest workers, failure recovery, expired-owner fencing, partial queue/FCM completion, consumed-item deduplication, and opt-out behavior.

## Why the Brevo SMTP key is not entered in the admin panel

The Brevo SMTP key can send mail for the account. If the panel accepted it, the key would pass through browsers and be stored in Firestore, where database exports, backups, and any future rules mistake could expose it. Instead it belongs in Google Secret Manager, readable only by `tsv-notify`.

The admin panel manages everything else:

- the sender address
- the sender name
- the on/off switch
- whether the SMTP login and key are configured (never their values)
- the last run result
- a **Send me a test email** button

## One-time setup

Do these in order. Domain/DNS and Brevo setup need their respective account owners; the final admin step needs an MFA administrator.

1. **Authenticate the sender domain.** In Brevo, add `tillerystreetvolunteers.org` under **Settings → Senders, Domains, IPs → Domains**. Add the exact ownership, DKIM, and DMARC records Brevo displays to the domain's Cloud DNS zone. Wait until Brevo reports the domain authenticated. Then create `no-reply@tillerystreetvolunteers.org` as a sender. Brevo [automatically verifies senders on an authenticated domain](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email).

2. **Prepare SMTP access.** Under **Brevo → Settings → SMTP & API**, copy the SMTP **login** and generate an SMTP **key** (not an API key). Put the login in the Functions environment as `BREVO_SMTP_LOGIN`; it is not the no-reply sender address. Keep the key out of the repository, chat, browser settings, and Firestore. Brevo may require [transactional sending activation](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP) for a new account.

3. **Store the project-specific secret and review its access.** Each Firebase project needs its own `BREVO_SMTP_KEY` secret. Grant only that project's `tsv-notify` runtime identity `roles/secretmanager.secretAccessor` on that secret; the deployment identity may need metadata-only `roles/secretmanager.viewer`. These are persistent IAM changes and should be reviewed before applying. Never copy a production key into dev automatically. The backend deployment fails if it binds a missing secret.

4. **Deploy the dev backend first.** Copy `functions/.env.example` to the ignored `functions/.env.tillerystreettrail-dev` file. Keep `WATERSHED_EMAIL_ENABLED=false` there until the dev secret exists. Set `BREVO_SMTP_LOGIN`, then set the flag to `true` and deploy the dev Functions. Keep production email disabled until its own Brevo secret and `BREVO_SMTP_LOGIN` are ready; set the same flag to enable its secret binding. The existing push VAPID key is separate from SMTP. Never commit a project-specific Functions env file.

5. **Send a test, then enable the digest.** Open **Admin → Mailing → Daily digest email** on dev, save `no-reply@tillerystreetvolunteers.org` as the verified sender, and choose **Send me a test email**. Confirm inbox receipt and Brevo's transaction log. Only then check **Send the daily digest** and save. Repeat for production after the dev flow works.

6. **Optional cleanup policies.** Each digest run already deletes digest lines older than three days. TTL policies also clear dedupe markers automatically:

   ```bash
   gcloud firestore fields ttls update expireAt --collection-group=notificationDigestItems --enable-ttl --project=tillerystreettrail
   gcloud firestore fields ttls update expireAt --collection-group=notificationDispatches --enable-ttl --project=tillerystreettrail
   ```

## Rotating the Brevo SMTP key

1. Generate a new SMTP key in Brevo and update the project's `BREVO_SMTP_KEY` secret.
2. Keep the same SMTP login unless Brevo changes it.
3. Redeploy `sendDailyDigest`, `getEmailDeliverySettings`, and `sendTestEmail` (deployed Functions keep the secret version they were deployed with).
4. Confirm a test message, then revoke the old SMTP key in Brevo.

## Member instructions

- **Computer or Android:** Profile → Notifications → **Turn on**, accept the browser prompt, then tick the topics to push.
- **iPhone/iPad (iOS 16.4+):** in Safari tap **Share → Add to Home Screen**, open WatershedCrew from the Home Screen, sign in, then **Turn on** in Profile → Notifications.
Daily email choices are currently hidden from members.

## Manual testing

### Local emulator preview

Run `npm run preview:local` and open the URL printed as **LOCAL TEST PREVIEW**. Keep that process running. It builds the app and Functions together, uses disposable demo data, and automatically verifies new test accounts. Use fake email addresses and test passwords.

- Open **Profile → Notifications**. New accounts should start with every topic off. Change one topic, wait for **Saved**, and reload to confirm it persists.
- Push reports that it is unavailable in emulator mode. Member email choices are hidden; the backend digest queue can still be exercised by the notification E2E tests.
- Forum and event triggers can queue digest items in the emulator, but the browser cannot read that server-only queue directly. Inspect `notificationDigestItems` through emulator admin tooling, or use the notification E2E tests to check delivery counts and retry behavior.
- This preview does **not** deliver real push or Brevo messages. The local mailer renders messages without sending them, and the daily schedule does not run automatically in the emulator.

### Real push delivery

Use two verified test members in separate normal browser profiles: **A** receives notifications and **B** creates activity. Use an MFA administrator for event creation and moderation.

1. As A, open **Profile → Notifications**, choose **Turn on**, allow browser notifications, and enable one **Push** topic at a time. Reload to check persistence. For iPhone/iPad, use the installed Home Screen app.
2. Test each topic with a clearly named item:
   - **Replies to my forum threads:** A starts a thread; B replies. A should receive one alert. A's own reply should not notify A.
   - **New forum posts:** B publishes a post. A should receive one alert; B's own post should not notify B for this topic.
   - **New volunteer events:** the administrator creates an event. A should receive one alert. Editing that existing event should not create another new-event alert.
3. Repeat with A's site tab closed but the browser running. Check the leaf-and-creek icon, click the notification, and confirm it opens the intended thread or event. Dismiss each alert before the next check: alerts for the same topic and link share a notification tag and may replace one another.
4. Turn a topic off and create another matching item. Expect no alert for that topic. Also verify that pending moderated posts/replies alert only after approval, and that signing out stops push on that browser.

After the one-time Brevo setup and member email controls are enabled, test the administrator's **Send me a test email** action and a member's 7 PM Central digest separately. Those live email checks are deferred for now.

The transactional race/retry checks belong in `npm run test:e2e`; manual clicks cannot reliably reproduce those timing windows. The external-provider acknowledgement limitation described above still applies.

## Troubleshooting

- **"Brevo rejected the SMTP login or key"**: use the SMTP login and SMTP key from Brevo's SMTP & API page, not the sender address or an API key. Check whether Brevo has activated transactional sending.
- **The admin panel says Brevo SMTP is not configured**: the deployed Functions are missing `BREVO_SMTP_LOGIN` or a nonempty `BREVO_SMTP_KEY`. Correct the missing setting and redeploy the three Functions that bind the secret.
- **Push button missing**: `VITE_FIREBASE_VAPID_KEY` was not set when Hosting was built, or the browser blocks notifications for the site.
