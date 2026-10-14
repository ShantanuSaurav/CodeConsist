# CodeConsist notifications

## Activate Android push

The PC API owns users, messages, reminders and delivery history. Firebase Cloud
Messaging transports messages to Android; Firebase Authentication is not needed
and the existing Google/GitHub/email sign-in implementation stays in place.

1. Open https://console.firebase.google.com/ and select the new notifications
   project **codeconsist-c53b9** (project number **25441385101**). The existing
   Google Cloud OAuth project continues handling sign-in independently.
2. This project's Android app is registered for **com.codeconsist.codeconsist**.
   Its Android configuration was verified and installed on 14 October 2026.
3. Download its `google-services.json` to:
   `C:\Users\KIIT0001\Desktop\CodeConsistApplication\CodeConsist\androidApp\google-services.json`.
   This is Android configuration, not the OAuth client JSON previously downloaded.
4. Project settings → Cloud Messaging: confirm Firebase Cloud Messaging API (V1)
   is enabled. Use Project settings → Service accounts → Generate new private key.
   Save the service-account file to:
   `C:\Users\KIIT0001\Desktop\Devlingo-merged\server\data\firebase-service-account.json`.
   This private file stays on the PC and is excluded from Git. Never put it in
   Android resources or share it in a screenshot. Its service account needs
   permission to send FCM messages in this project.
5. Add to the website/server `.env`:

   ```dotenv
   GOOGLE_APPLICATION_CREDENTIALS=C:/Users/KIIT0001/Desktop/Devlingo-merged/server/data/firebase-service-account.json
   ```

6. Restart the PC API using the normal server controls. Keep `ops/up.ps1` running
   the API and tunnel. Queues survive restarts. No reminder scheduler runs while
   the PC is switched off; messages expire for push after 24 hours, avoiding a
   blast of old reminders when the service resumes.
7. Sync and run the app from Android Studio. No Android build has been run by
   Codex for this change. Sign in, then open **You → Settings → Notifications →
   Allow notifications**. Grant the Android permission.
8. Open **Admin → Notifications**. Refresh status and confirm an active device.
   Send a harmless message to your own learner account first. Check foreground,
   background, tap navigation, quiet hours, opt-out and sign-out on your phone.

The Google Services plugin is declared at the project root (4.5.0) and applied
in androidApp. The app uses Firebase BoM 35.0.0 and firebase-messaging. Its
`google-services.json` is installed and is required when syncing/building this
app. The server service-account key must come from **codeconsist-c53b9**, matching
this Android configuration. No Android compilation was performed by Codex.

Google account verification blocks must be resolved through Google's existing
device verification or https://accounts.google.com/signin/recovery. An existing
authorized project owner can also configure the project from their own account.

References: [Android setup](https://firebase.google.com/docs/android/setup),
[Android messaging and permission](https://firebase.google.com/docs/cloud-messaging/android/get-started),
[server authorization](https://firebase.google.com/docs/cloud-messaging/send/v1-api).

## Current setup status � 14 October 2026

The matching CodeConsist service-account key is installed in the PC-only data
folder and GOOGLE_APPLICATION_CREDENTIALS is set. Google authorization and an
FCM validation-only request both succeeded; no real notification was sent.
The running PC API was restarted and its admin notification endpoint reports
Firebase configured, nine automation rules and zero registered push devices.
The public ngrok health check also passed. The remaining activation step is to
run the updated Android app in Android Studio, sign in and allow notifications.
An Android build and physical background-delivery test are still pending.

## Admin controls

Write a title and body, choose a single learner or everyone, choose the app page
to open and review the preview before sending. History records per-user messages
and transport results. **Accepted** means FCM accepted the request, not that the
phone displayed it. The inbox is retained for 30 days, capped globally at 20,000
records and at 100 returned messages per learner.

All automatic rules start off. The admin can enable each rule, change its title,
body and destination, and set its send hour. Templates support `{name}`, `{streak}`,
`{remaining}`, `{target}`, `{count}` and `{expiry}` where relevant. Changes apply
to future messages. Disabling a rule stops its outstanding push deliveries too.

Available rules:

- Live streak with no qualifying activity today.
- Unfinished daily goal from the existing habits engine.
- Weekly lesson target (Monday through Sunday), editable target and reminder day.
- Return after an editable number of days away.
- Newly published questions; enabling the rule establishes a baseline so the
  existing question bank is not announced as new.
- Reviews due, using the existing review session planner and accessible bank.
- New certificates issued after the rule was enabled.
- Expiring/expired dated subscriptions. **The current billing catalog contains
  lifetime purchases, not recurring subscriptions. These two rules remain
  inactive for existing products.** Supporting subscription sales, renewals and
  entitlement expiry is a separate billing change; no expiry is invented for
  a lifetime licence.

The scheduler runs once a minute while the PC API is running. It evaluates local
calendar days in the learner's configured time zone and caps automatic reminders
at three per learner per day. Learners control all notifications, learning
reminders and announcements separately. Quiet hours default to 22:00–08:00;
equal start/end hours disable quiet hours.

## Delivery and account isolation

The durable queue is persisted before sending. Transient failures back off;
unregistered tokens are removed. Messages have stable ids and the Android client
deduplicates recent received ids. FCM transport is at-least-once, not an
exactly-once guarantee. Android may delay delivery; force-stopping the app or
blocking notifications can prevent it until the app is reopened.

Devices register using the learner's authenticated session. Registration replaces
the old account on the same installation/token. Before delivery the API checks
session expiry, revocation and token version. Signing out clears local recipient
state and tray notifications immediately and attempts server unregister. Data
messages are displayed only when the recipient matches the locally signed-in
account; private text is hidden on the lock screen. Notification links are limited
to app destinations. No FCM tokens or service-account secrets appear in admin
responses. Account deletion removes notification/device/preference records.

Android is the push target in this implementation. Web-browser push and iOS/APNs
are not configured. The PC hosts the admin console and delivery service.

## Checks

Server tests use in-memory stores and a fake transport; they do not send messages
to real users. Android source/module checks do not replace a compiled build and
physical background-delivery testing, which remain pending Firebase setup and
the owner's Android Studio run.
