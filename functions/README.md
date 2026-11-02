# Firebase account deletion function

This trusted Cloud Function deletes an employee account from Firebase Authentication and removes only `users/{uid}` and `controlAdmins/{uid}`. Attendance, request, and complaint history are intentionally retained.

## Deploy

From the repository root, with Firebase CLI installed and the correct project selected:

```sh
cd functions
npm install
cd ..
firebase use absensi-karyawan-2b712
firebase deploy --only functions:deleteEmployeeAccount
```

The deployer must have permission to deploy Cloud Functions. The Firebase project may need the Blaze billing plan and Cloud Functions APIs enabled.

The callable validates the caller's Firebase ID token and requires an active `controlAdmins/{callerUid}` document with role `Admin` or `Owner`. The target Owner account cannot be deleted through this function. Never place service-account private keys in the web client or Git repository.


## UID migration for duplicate accounts (Owner-only)

The `migrateAccountUid` callable makes a **preview by default** and is not run automatically. It requires an active Owner session and a destination UID that already exists in Firebase Authentication.

- Deploy both callables:
  ```sh
  firebase deploy --only functions:deleteEmployeeAccount,functions:migrateAccountUid
  ```
- Call `migrateAccountUid({ oldUid, newUid })` first to preview the affected Firestore document paths. Review the result and create a Firestore backup/export before applying anything.
- Only after verifying the preview, call `migrateAccountUid({ oldUid, newUid, confirm: true })` to replace exact old-UID string values in Firestore documents/subcollections and merge `users/{oldUid}` / `controlAdmins/{oldUid}` into the new UID documents. Existing fields at the new UID take precedence on conflicts.
- The function does **not** delete the old Firebase Authentication account. Verify login, roles, approvals, attendance, and complaint/request history first; handle the old Auth account separately.
- This is a broad database migration. Test with non-production duplicate accounts first. Keep a backup and do not run it if the preview contains unrelated records. Document IDs other than `users/{uid}` and `controlAdmins/{uid}` are not renamed; only UID values inside document data are updated.

Never commit service-account private keys to the repository.
