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
