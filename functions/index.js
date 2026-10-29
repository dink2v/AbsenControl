const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();

exports.deleteEmployeeAccount = onCall({ region: "asia-southeast1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login diperlukan.");
  }

  const callerUid = request.auth.uid;
  const targetUid = typeof request.data?.uid === "string" ? request.data.uid.trim() : "";
  if (!targetUid) throw new HttpsError("invalid-argument", "UID target wajib diisi.");
  if (targetUid === callerUid) {
    throw new HttpsError("failed-precondition", "Akun yang sedang dipakai tidak boleh dihapus dari sesi ini.");
  }

  const db = getFirestore();
  const callerAdminRef = db.collection("controlAdmins").doc(callerUid);
  const callerAdminSnap = await callerAdminRef.get();
  const callerRole = String(callerAdminSnap.get("role") || "").trim().toUpperCase();
  const callerActive = callerAdminSnap.get("active") === true;
  if (!callerAdminSnap.exists || !callerActive || !["ADMIN", "OWNER"].includes(callerRole)) {
    throw new HttpsError("permission-denied", "Hanya Admin/Owner aktif yang boleh menghapus akun.");
  }

  const targetAdminRef = db.collection("controlAdmins").doc(targetUid);
  const targetAdminSnap = await targetAdminRef.get();
  if (targetAdminSnap.exists && ["OWNER"].includes(String(targetAdminSnap.get("role") || "").trim().toUpperCase())) {
    throw new HttpsError("failed-precondition", "Akun Owner tidak boleh dihapus dari menu karyawan.");
  }

  // Disable first, then remove only identity/access documents. Historical attendance,
  // requests and complaints are deliberately retained.
  try {
    await getAuth().updateUser(targetUid, { disabled: true });
  } catch (error) {
    if (error.code !== "auth/user-not-found") {
      throw new HttpsError("internal", "Gagal menonaktifkan akun Authentication.");
    }
  }

  try {
    await Promise.all([
      db.collection("users").doc(targetUid).delete(),
      targetAdminRef.delete(),
    ]);
    try {
      await getAuth().deleteUser(targetUid);
    } catch (error) {
      if (error.code !== "auth/user-not-found") {
        // Keep the account disabled if final deletion fails; its access record is gone.
        throw new HttpsError("internal", "Profil sudah dihapus, tetapi akun Authentication masih dinonaktifkan. Perlu pemeriksaan admin.");
      }
    }
    return { success: true, uid: targetUid, historyPreserved: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Gagal menghapus profil dan data akses.");
  }
});
