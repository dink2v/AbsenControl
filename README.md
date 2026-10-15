# ABSEN CONTROL

A separate Android app project for administrators of the employee attendance system.

## Project status

This is the initial Android/Jetpack Compose scaffold. It is **not a finished or production-ready APK** yet.

## Architecture

- Repository: `dink2v/AbsenControl` (admin app)
- Existing employee app remains in `dink2v/AbsensiKaryawan`
- Both apps are intended to use the existing Firebase project, with separate access rules.
- Admin authorization will use a trusted Firestore allowlist collection named `controlAdmins`; the app must never let a client grant itself admin access.

## Android app setup

- Package/application ID: `com.dink2v.absencontrol`
- Minimum Android SDK: 26
- Java/Kotlin target: 17
- UI: Jetpack Compose
- Firebase Auth and Firestore dependencies are included.

### Before connecting Firebase

1. In Firebase Console, register a **new Android app** using exactly `com.dink2v.absencontrol` in the existing Firebase project.
2. Download its `google-services.json` and place it at `app/google-services.json` locally. This file is ignored by Git.
3. Add the Google Services Gradle plugin and verify the configuration/build before implementing Firebase calls.
4. Enable the required sign-in provider in Firebase Authentication.
5. Create the trusted `controlAdmins/{uid}` documents from a trusted admin process/console. Client apps must not be allowed to create or modify these records.

Do not put service-account JSON files, private keys, passwords, or other secrets in this repository.

## Planned implementation

1. Firebase Authentication login and allowlist authorization.
2. Admin overview.
3. Chat inbox and replies compatible with the existing `chatRooms/{staffUid}/messages` schema.
4. Attendance and request review tools.
5. Security-rule and end-to-end testing before distributing an APK.

No production Firebase rules have been deployed by this repository. The initial screen is only a scaffold and has not been verified by an Android build in this change.
