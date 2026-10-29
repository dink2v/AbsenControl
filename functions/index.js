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
    if (Object.getPrototypeOf(value) !== Object.prototype ||
        typeof value.toDate === "function" || typeof value.path === "string" ||
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
    const merged = replaceUidValues(mergeData(oldUserSnap.data(), newUserSnap.data()), oldUid, newUid).value;
    writes.push({ ref: newUserRef, data: merged, merge: true });
    writes.push({ ref: oldUserRef, delete: true });
  }
  if (oldAdminSnap.exists) {
    const merged = replaceUidValues(mergeData(oldAdminSnap.data(), newAdminSnap.data()), oldUid, newUid).value;
    writes.push({ ref: newAdminRef, data: merged, merge: true });
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


// Process an approval only for the currently assigned approver.
// The server rechecks the stage inside a Firestore transaction; the web UI is not trusted.
exports.decidePengajuanApproval = onCall({ region: "asia-southeast1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login diperlukan.");
  }

  const callerUid = request.auth.uid;
  const documentId = typeof request.data?.documentId === "string" ? request.data.documentId.trim() : "";
  const decision = typeof request.data?.decision === "string" ? request.data.decision.trim().toLowerCase() : "";
  if (!documentId || !["disetujui", "ditolak"].includes(decision)) {
    throw new HttpsError("invalid-argument", "ID pengajuan dan keputusan yang valid wajib diisi.");
  }

  const db = getFirestore();
  const accessSnap = await db.collection("controlAdmins").doc(callerUid).get();
  const callerRole = String(accessSnap.get("role") || "").trim().toLowerCase();
  const allowedRoles = ["supervisor", "manager", "hrd", "owner", "admin"];
  if (!accessSnap.exists || accessSnap.get("active") !== true || !allowedRoles.includes(callerRole)) {
    throw new HttpsError("permission-denied", "Akun tidak memiliki akses aktif ke panel.");
  }

  const requestRef = db.collection("pengajuan").doc(documentId);
  const userRef = (uid) => db.collection("users").doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) {
      throw new HttpsError("not-found", "Pengajuan tidak ditemukan.");
    }

    const data = requestSnap.data() || {};
    const status = String(data.status || "menunggu").trim().toLowerCase();
    const chain = Array.isArray(data.approvalChain) ? data.approvalChain.filter((uid) => typeof uid === "string") : [];
    const currentUid = typeof data.currentApproverUid === "string" ? data.currentApproverUid : "";
    if (data.approvalLocked === true || status !== "menunggu") {
      throw new HttpsError("failed-precondition", "Pengajuan sudah selesai atau tidak lagi menunggu persetujuan.");
    }
    if (!chain.length || !chain.includes(callerUid) || currentUid !== callerUid) {
      throw new HttpsError("permission-denied", "Anda bukan approver aktif pada tahap pengajuan ini.");
    }

    const nextIndex = chain.indexOf(callerUid) + 1;
    const nextUid = decision === "disetujui" ? (chain[nextIndex] || "") : "";
    const actorRef = userRef(callerUid);
    const actorSnap = await tx.get(actorRef);
    let actorData = actorSnap.exists ? actorSnap.data() : null;
    if (!actorData) {
      const actorQuery = await tx.get(db.collection("users").where("uid", "==", callerUid).limit(1));
      actorData = actorQuery.empty ? {} : actorQuery.docs[0].data();
    }

    let nextData = null;
    if (nextUid) {
      const nextSnap = await tx.get(userRef(nextUid));
      nextData = nextSnap.exists ? nextSnap.data() : null;
      if (!nextData) {
        const nextQuery = await tx.get(db.collection("users").where("uid", "==", nextUid).limit(1));
        nextData = nextQuery.empty ? null : nextQuery.docs[0].data();
      }
    }

    const actorName = String(actorData?.nama || request.auth.token.name || request.auth.token.email || "Approver");
    const actorPosition = String(actorData?.jabatan || "");
    const approvalStatuses = data.approvalStatuses && typeof data.approvalStatuses === "object"
      ? { ...data.approvalStatuses }
      : {};
    approvalStatuses[callerUid] = decision;

    const common = {
      approvalStatuses,
      approvedByUid: callerUid,
      approvedByName: actorName,
      approvedByJabatan: actorPosition,
      approvedAt: FieldValue.serverTimestamp(),
    };

    if (decision === "ditolak") {
      tx.update(requestRef, {
        ...common,
        status: "ditolak",
        approvalLocked: true,
        currentApproverUid: "",
        currentApproverName: "",
        currentApproverJabatan: "",
      });
      return { status: "ditolak", nextApproverUid: "" };
    }

    if (nextUid) {
      approvalStatuses[nextUid] = "menunggu";
      tx.update(requestRef, {
        ...common,
        status: "menunggu",
        approvalStatuses,
        currentApproverUid: nextUid,
        currentApproverName: String(nextData?.nama || nextData?.name || ""),
        currentApproverJabatan: String(nextData?.jabatan || ""),
        approvalLocked: false,
      });
      return { status: "menunggu", nextApproverUid: nextUid };
    }

    tx.update(requestRef, {
      ...common,
      status: "disetujui",
      approvalLocked: true,
      currentApproverUid: "",
      currentApproverName: "",
      currentApproverJabatan: "",
    });
    return { status: "disetujui", nextApproverUid: "" };
  });

  return { success: true, documentId, ...result };
});
