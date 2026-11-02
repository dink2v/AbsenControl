import { createRemoteJWKSet, jwtVerify } from "jose";

const FIREBASE_PROJECT_ID = "absensi-karyawan-2b712";
const ALLOWED_ORIGIN = "https://dink2v.github.io";
const FIREBASE_AUTH_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

function response(body, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "vary": "Origin",
    },
  });
}

function b64url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\\+/g, "-").replace(/\\//g, "_");
}

async function googleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3500,
  }));
  const unsigned = header + "." + claim;
  const pem = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\s/g, "");
  const keyBytes = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned),
  );
  const assertion = unsigned + "." + b64url(new Uint8Array(signature));
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error("Gagal memperoleh token layanan Google.");
  }
  return tokenData.access_token;
}

async function firestoreGet(accessToken, collection, uid) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(uid)}`;
  const result = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (result.status === 404) return null;
  if (!result.ok) throw new Error(`Firestore read gagal (${result.status}).`);
  return result.json();
}

async function firestoreDelete(accessToken, collection, uid) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(uid)}`;
  const result = await fetch(url, { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` } });
  if (!result.ok && result.status !== 404) throw new Error(`Firestore delete gagal pada ${collection} (${result.status}).`);
}

function fieldString(document, key) {
  const value = document?.fields?.[key];
  return value?.stringValue ?? "";
}

function fieldBoolean(document, key) {
  return document?.fields?.[key]?.booleanValue === true;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": ALLOWED_ORIGIN,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-max-age": "86400",
          "vary": "Origin",
        },
      });
    }
    if (origin !== ALLOWED_ORIGIN) return response({ error: "Origin tidak diizinkan." }, 403);
    if (request.method !== "POST") return response({ error: "Method tidak diizinkan." }, 405);

    try {
      const authorization = request.headers.get("Authorization") || "";
      const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!idToken) return response({ error: "Sesi login tidak ditemukan." }, 401);

      const verified = await jwtVerify(idToken, FIREBASE_JWKS, {
        issuer: FIREBASE_AUTH_ISSUER,
        audience: FIREBASE_PROJECT_ID,
      });
      const callerUid = verified.payload.sub;
      if (typeof callerUid !== "string" || !callerUid) {
        return response({ error: "Token pengguna tidak valid." }, 401);
      }

      const body = await request.json();
      const targetUid = typeof body?.uid === "string" ? body.uid.trim() : "";
      const profileId = typeof body?.profileId === "string" ? body.profileId.trim() : targetUid;
      if (!targetUid || targetUid.length > 128 || !profileId || profileId.length > 1500) {
        return response({ error: "UID karyawan tidak valid." }, 400);
      }
      if (targetUid === callerUid) {
        return response({ error: "Akun yang sedang digunakan tidak boleh dihapus." }, 400);
      }

      const serviceAccountText = env.FIREBASE_SERVICE_ACCOUNT;
      if (!serviceAccountText) return response({ error: "Backend belum dikonfigurasi." }, 503);
      const serviceAccount = JSON.parse(serviceAccountText);
      const accessToken = await googleAccessToken(serviceAccount);

      const callerAdmin = await firestoreGet(accessToken, "controlAdmins", callerUid);
      const callerRole = fieldString(callerAdmin, "role").trim().toLowerCase();
      if (!callerAdmin || !fieldBoolean(callerAdmin, "active") || !["admin", "owner"].includes(callerRole)) {
        return response({ error: "Hanya Admin/Owner aktif yang boleh menghapus akun." }, 403);
      }

      const [targetProfile, targetAdmin] = await Promise.all([
        firestoreGet(accessToken, "users", profileId),
        firestoreGet(accessToken, "controlAdmins", targetUid),
      ]);
      if (!targetProfile) return response({ error: "Profil karyawan tidak ditemukan." }, 404);
      const targetRole = (fieldString(targetProfile, "role") || fieldString(targetAdmin, "role")).trim().toLowerCase();
      if (targetRole === "owner") return response({ error: "Akun Owner tidak boleh dihapus." }, 403);
      const status = (
        fieldString(targetProfile, "status") ||
        fieldString(targetProfile, "statusAkun") ||
        fieldString(targetProfile, "accountStatus")
      ).trim().toLowerCase();
      if (status !== "nonaktif") {
        return response({ error: "Nonaktifkan akun karyawan terlebih dahulu." }, 409);
      }
      if (targetAdmin && fieldBoolean(targetAdmin, "active")) {
        return response({ error: "Akses Admin masih aktif. Nonaktifkan terlebih dahulu." }, 409);
      }

      // Delete only identity/access documents. Attendance, requests and chat are untouched.
      await firestoreDelete(accessToken, "users", profileId);
      if (targetAdmin) await firestoreDelete(accessToken, "controlAdmins", targetUid);

      const authDelete = await fetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/accounts:delete`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ localId: targetUid }),
        },
      );
      if (!authDelete.ok) {
        const detail = await authDelete.json().catch(() => ({}));
        return response({
          success: false,
          profileDeleted: true,
          authenticationDeleted: false,
          error: detail?.error?.message || "Profil terhapus, tetapi penghapusan Authentication gagal.",
        }, 502);
      }

      return response({
        success: true,
        profileDeleted: true,
        authenticationDeleted: true,
        historyPreserved: true,
      });
    } catch (error) {
      if (error?.code === "ERR_JWT_INVALID" || error?.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") {
        return response({ error: "Sesi login tidak valid. Silakan login ulang." }, 401);
      }
      return response({ error: error instanceof Error ? error.message : "Terjadi kesalahan server." }, 500);
    }
  },
};
