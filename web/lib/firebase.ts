import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase Web configuration is public client configuration.
// Access control must be enforced by Firebase Authentication and Firestore Security Rules.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDcFG4lIxhCJshu1WH1I-JvJgsnGSZmu0Q",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "absensi-karyawan-2b712.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "absensi-karyawan-2b712",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "absensi-karyawan-2b712.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "313053109006",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:313053109006:web:658d56c4895d1ec564155f",
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
);

// Keep Firestore on the default Firebase app so existing database access is unchanged.
const app = firebaseConfigured
  ? getApps().some((item) => item.name === "[DEFAULT]")
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

// Use a named Firebase app for ABSEN CONTROL Authentication. Firebase Auth persistence
// is namespaced by app name, preventing sign-in/sign-out here from sharing the default
// app's stored session with the employee website on the same GitHub Pages origin.
const authApp = firebaseConfigured
  ? getApps().find((item) => item.name === "absen-control-web-auth") ??
    initializeApp(firebaseConfig, "absen-control-web-auth")
  : null;

export const auth = authApp ? getAuth(authApp) : null;
export const db = app ? getFirestore(app) : null;
