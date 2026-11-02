# ABSEN CONTROL Web

The first web foundation for the HRD, Manager, Owner, and Admin control panel. The Android project remains in `/app`; the existing employee app repository is not changed.

## Local setup

1. Install Node.js 20 or newer.
2. In this folder, copy `.env.example` to `.env.local`.
3. In Firebase Console, open project `absensi-karyawan-2b712`, register a **Web app**, and copy its web configuration values into `.env.local`. Do not use the Android app ID for `NEXT_PUBLIC_FIREBASE_APP_ID`.
4. In Firebase Authentication, enable Email/Password.
5. Install dependencies and start the app:

   ```bash
   npm install
   npm run dev
   ```

6. Open http://localhost:3000.

## Role document

The login flow requires a document at `controlAdmins/{uid}` with:

- `active`: Boolean `true`
- `role`: one of `Admin`, `Owner`, `HRD`, or `Manager`

For the initial administrator, assign `role: "Admin"` in the Firebase Console to the existing authorized UID. Do not let client-side apps create or modify role assignments. The current Firestore rule permits a signed-in user to read only their own `controlAdmins` document and denies client writes; preserve that boundary.

## Current scope

- Email/password sign-in
- Active allowlist and role check against Firestore
- Initial dashboard layout with placeholder metrics
- Navigation placeholders for employees, attendance, submissions, reports, and settings

The operational modules are not yet connected to live records. The role check in the UI is not a substitute for Firestore Security Rules; data access must also be enforced by backend rules before production use. Existing employee-app rules need a separate compatibility and security review before changes are deployed.