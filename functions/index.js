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


// Replace only exact UID values in Firestore data; do not alter names, emails, or free text.
function replaceUidValues(value, oldUid, newUid) {
  if (value === oldUid) return { value: newUid, changed: true };
  if (Array.isArray(value)) {
    let changed = false;
    const result = value.map((item) => {
      const next = replaceUidValues(item, oldUid, newUid);
      changed ||= next.changed;
      return next.value;
    });
    return { value: result, changed };
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    // Preserve Firestore special values (timestamps, references, geopoints, bytes).
    if (typeof value.toDate === "function" || typeof value.path === "string" ||
        typeof value.latitude === "number" || typeof value.longitude === "number") {
      return { value, changed: false };
    }
    let changed = false;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      const next = replaceUidValues(item, oldUid, newUid);
      result[key] = next.value;
      changed ||= next.changed;
    }
    return { value: result, changed };
  }
  return { value, changed: false };
}

async function collectUidReferences(collectionRef, oldUid, results) {
  const snapshot = await collectionRef.get();
  for (const document of snapshot.docs) {
    const data = document.data();
    const replaced = replaceUidValues(data, oldUid, "__UID_MIGRATION_PREVIEW__");
    if (replaced.changed) results.push({ ref: document.ref, data });
    const subcollections = await document.ref.listCollections();
    for (const subcollection of subcollections) {
      await collectUidReferences(subcollection, oldUid, results);
    }
  }
}

exports.migrateAccountUid = onCall({ region: "asia-southeast1", timeoutSeconds: 540 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login diperlukan.");

  const oldUid = typeof request.data?.oldUid === "string" ? request.data.oldUid.trim() : "";
  const newUid = typeof request.data?.newUid === "string" ? request.data.newUid.trim() : "";
  const confirm = request.data?.confirm === true;

  if (!oldUid || !newUid || oldUid === newUid) {
    throw new HttpsError("invalid-argument", "UID lama dan UID baru yang berbeda wajib diisi.");
  }
  if (oldUid === request.auth.uid || newUid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "Jangan migrasikan UID sesi admin yang sedang digunakan.");
  }

  const db = getFirestore();
  const callerSnap = await db.collection("controlAdmins").doc(request.auth.uid).get();
  const callerRole = String(callerSnap.get("role") || "").trim().toUpperCase();
  if (!callerSnap.exists || callerSnap.get("active") !== true || callerRole !== "OWNER") {
    throw new HttpsError("permission-denied", "Migrasi UID hanya boleh dijalankan Owner aktif.");
  }

  try {
    await getAuth().getUser(newUid);
  } catch {
    throw new HttpsError("failed-precondition", "UID baru belum terdaftar di Firebase Authentication.");
  }

  const oldUserRef = db.collection("users").doc(oldUid);
  const newUserRef = db.collection("users").doc(newUid);
  const oldAdminRef = db.collection("controlAdmins").doc(oldUid);
  const newAdminRef = db.collection("controlAdmins").doc(newUid);
  const [oldUserSnap, newUserSnap, oldAdminSnap, newAdminSnap] = await Promise.all([
    oldUserRef.get(), newUserRef.get(), oldAdminRef.get(), newAdminRef.get(),
  ]);

  if (!oldUserSnap.exists && !oldAdminSnap.exists) {
    throw new HttpsError("not-found", "Tidak ditemukan profil atau akses untuk UID lama.");
  }

  // Scan every collection and subcollection; preview is the default and never writes.
  const references = [];
  for (const collection of await db.listCollections()) {
    await collectUidReferences(collection, oldUid, references);
  }
  const referencePaths = references.map((item) => item.ref.path);

  if (!confirm) {
    return {
      preview: true,
      oldUid,
      newUid,
      referenceDocuments: referencePaths.length,
      paths: referencePaths.slice(0, 100),
      pathsTruncated: referencePaths.length > 100,
      targetProfileExists: newUserSnap.exists,
      targetAdminAccessExists: newAdminSnap.exists,
      note: "Belum ada perubahan. Tinjau referensi dan cadangkan Firestore sebelum menjalankan confirm=true.",
    };
  }

  // Merge old identity data first and let existing new-UID fields win on conflicts.
  const mergeData = (oldData, newData) => ({ ...(oldData || {}), ...(newData || {}) });
  const writes = [];
  for (const item of references) {
    const replaced = replaceUidValues(item.data, oldUid, newUid);
    if (replaced.changed) writes.push({ ref: item.ref, data: replaced.value });
  }

  if (oldUserSnap.exists) {
    writes.push({ ref: newUserRef, data: mergeData(oldUserSnap.data(), newUserSnap.data()), merge: true });
    writes.push({ ref: oldUserRef, delete: true });
  }
  if (oldAdminSnap.exists) {
    writes.push({ ref: newAdminRef, data: mergeData(oldAdminSnap.data(), newAdminSnap.data()), merge: true });
    writes.push({ ref: oldAdminRef, delete: true });
  }

  // Firestore limits each batch to 500 operations; keep a safety margin.
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const write of writes.slice(i, i + 400)) {
      if (write.delete) batch.delete(write.ref);
      else batch.set(write.ref, write.data, { merge: Boolean(write.merge) });
    }
    await batch.commit();
  }

  return {
    success: true,
    oldUid,
    newUid,
    updatedReferenceDocuments: references.length,
    identityDocumentsMoved: Number(oldUserSnap.exists) + Number(oldAdminSnap.exists),
    authAccountDeleted: false,
    historyDocumentsDeleted: false,
    note: "Firestore references migrated. UID lama di Firebase Authentication tidak dihapus; verifikasi login dan riwayat sebelum tindakan lanjutan.",
  };
});
