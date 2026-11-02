# ABSEN CONTROL account deletion Worker

This Worker is the server-side bridge used by the web app to delete an inactive employee's Firebase Authentication account without exposing a service-account key in the browser. It deletes only the employee identity documents:

- `users/{profileId}`
- `controlAdmins/{uid}` (only when the document exists and is already inactive)
- Firebase Authentication user `uid`

Attendance, requests, complaints and chat collections are not touched.

## One-time setup

1. Create a Cloudflare account and install Node.js on a computer.
2. In Google Cloud Console for Firebase project `absensi-karyawan-2b712`, create a dedicated service account for this Worker.
3. Grant it only these roles:
   - Firebase Authentication Admin (`roles/firebaseauth.admin`)
   - Cloud Datastore User (`roles/datastore.user`) for Firestore document read/delete.
4. Create a JSON key for that service account. Keep it private; never commit it, paste it into chat, or put it in the web app.
5. From this directory, run:

   ```sh
   npm install
   npx wrangler login
   npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
   ```

   When prompted for the secret, paste the complete JSON key file contents. Do not put the JSON key in `wrangler.toml`.

6. Deploy:

   ```sh
   npx wrangler deploy
   ```

7. Copy the deployed Worker URL (usually `https://absen-control-account-admin.<your-subdomain>.workers.dev`).

## Connect the GitHub Pages build

In GitHub repository Settings → Secrets and variables → Actions → New repository secret, add:

- Name: `NEXT_PUBLIC_ACCOUNT_DELETE_API`
- Value: the deployed Worker URL

The existing web workflow passes this URL into the static build. Push the web workflow change or run the Web deploy workflow manually after adding the secret.

## Security notes

- The Worker verifies Firebase ID tokens and checks the caller's active Admin/Owner record server-side.
- It refuses self-deletion, Owner deletion, active employee deletion, and deletion while target admin access remains active.
- The service-account key exists only as a Cloudflare Worker secret.
- If Firestore deletion succeeds but Authentication deletion fails, the API returns a partial-failure response so the administrator can investigate. The Worker never reports full success in that case.
- Test first with a dedicated inactive test employee. Do not test against the Owner or an account needed to administer the project.
