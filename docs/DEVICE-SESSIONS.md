# Signed-in devices

Learners can open website Settings > Your devices, or the native app's
You > Settings > Your devices. Each sign-in shows a device label, browser/app,
last activity, session status and a marker for the current device. A confirmation
precedes signing out one device or all devices (including the current one).
This does not delete progress or accounts. Offline controls remain visible and
disabled.

Administrators have the same single/all device controls in the learner's
Signed-in devices & browsers panel. These use the separate admin authentication
gate and write audit entries. Learners can only operate on their own sessions;
the API derives account identity from the verified token, never a supplied id.

Single-device logout retains a revocation record until the token expires.
Sign-out-all also increments the account token version so older, unreported
tokens are revoked. The server rejects the next request from a revoked session.
The website health cycle and app connection cycle check the account's session
while online, so the signed-in UI clears on a subsequent poll/foreground check.
Offline downloaded content can still be available according to existing app
behaviour; remote logout cannot erase an offline device's files.

The Android app reports Build.MANUFACTURER and Build.MODEL, without collecting
serial numbers, IMEI, phone numbers or hardware identifiers. The server resolves
model codes using Google's public supported-device catalog:
https://storage.googleapis.com/play_public/supported_devices.csv

The catalog was captured on 16 October 2026. Refresh it using
`python scripts/update-device-catalog.py`. It is server-only and adds no Android
app download weight. Ambiguous codes need a matching manufacturer; otherwise the
reported model code is retained instead of selecting an unrelated model.

Examples verified against the catalog: SM-A135F -> Samsung Galaxy A13;
SM-S921B -> Samsung Galaxy S24; SM-S928B -> Samsung Galaxy S24 Ultra.
Web browsers report operating system/browser and, when present in their user
agent, an Android model. Reduced browser user agents cannot reliably expose
exact Android or iPhone models or custom computer names. iPhone/iPad family names
are shown when known. Existing sessions acquire their new model labels when the
updated client next connects. Device labels are descriptive and are not trusted
as proof of account ownership.

The Android/iOS shared source was updated without running an Android compilation.
Run the updated Android app from Android Studio to supply its model information.
