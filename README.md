# ABSEN CONTROL

A separate Android app project for administrators of the employee attendance system.

## Project status

The initial Firebase email/password login screen and Firestore admin allowlist check have been added to the working branch. This is still **not a finished or production-ready APK**; an Android build and end-to-end test have not been run.

## Architecture

- Repository: `dink2v/AbsenControl` (admin app)
- Existing employee app remains in `dink2v/AbsensiKaryawan`
- Both apps are intended to use the existing Firebase project, with separate access rules.
- Admin authorization uses a trusted Firestore allowlist collection named `controlAdmins`. Client apps must never be allowed to grant themselves admin access.

## Android app setup

- Package/application ID: `com.dink2v.absencontrol`
- Minimum Android SDK: 26
- Java/Kotlin target: 17
- UI: Jetpack Compose
- Firebase Authentication and Cloud Firestore dependencies are included.

### Firebase configuration

1. Register an Android app in the existing Firebase project with exactly `com.dink2v.absencontrol`.
2. Put that app's `google-services.json` at `app/google-services.json`.
3. Enable Email/Password in Firebase Authentication.
4. Create or choose the admin account in Firebase Authentication.
5. In Firestore, create a document at `controlAdmins/{uid}`, replacing `{uid}` with that account's exact Authentication UID. Add the field `active` with Boolean value `true`.
6. Do not let ordinary client apps create or modify `controlAdmins` documents. Verify Firestore Security Rules before testing; if the app cannot read the allowlist document, it will deny access.

Use the Firebase Console or another trusted admin process to create the allowlist document. Do not paste passwords, service-account JSON files, private keys, or other secrets into the repository or chat.

## Current login behavior

- Signs in with Firebase Authentication Email/Password.
- Reads `controlAdmins/{uid}` after sign-in.
- Allows the app to show its temporary admin landing screen if the document exists and `active` is not explicitly `false`.
- Signs out and denies entry if the document is missing or the allowlist check fails.
- Includes a logout button.

This client-side check is an initial UI gate, not a complete security boundary. Firestore Security Rules must independently protect all admin-only data and actions.

## Planned implementation

1. Build and test the login flow on Android.
2. Add the real admin overview.
3. Add chat inbox and replies compatible with `chatRooms/{staffUid}/messages`.
4. Add attendance and request review tools.
5. Audit security rules and perform end-to-end testing before distributing an APK.

No production Firebase rules have been deployed by this repository.
