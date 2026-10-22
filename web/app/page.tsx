"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { auth, db, firebaseConfigured } from "@/lib/firebase";

type Role = "HRD" | "Manager" | "Owner" | "Admin";
type AccessState = "checking" | "signed-out" | "allowed" | "denied" | "setup";

const roleDescriptions: Record<Role, string> = {
  HRD: "Pengelolaan karyawan, absensi, dan pengajuan",
  Manager: "Pemantauan tim dan pengajuan sesuai wewenang",
  Owner: "Ringkasan operasional dan laporan perusahaan",
  Admin: "Akses penuh untuk pengaturan sistem dan akun",
};

const menuItems = [
  { icon: "▦", title: "Dashboard", description: "Ringkasan operasional" },
  { icon: "♙", title: "Data Karyawan", description: "Daftar dan informasi karyawan" },
  { icon: "◷", title: "Absensi", description: "Rekap kehadiran karyawan" },
  { icon: "▤", title: "Pengajuan", description: "Izin, cuti, dan koreksi absensi" },
  { icon: "▥", title: "Laporan", description: "Rekap dan laporan kehadiran" },
  { icon: "⚙", title: "Pengaturan", description: "Akun, role, dan konfigurasi sistem" },
];

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<AccessState>("checking");
  const [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({ employees: "—", present: "—", pending: "—", review: "—" });
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (!auth) {
      setAccess("setup");
      return;
    }
    const currentAuth = auth;
    return onAuthStateChanged(currentAuth, async (currentUser) => {
      setUser(currentUser);
      setError("");
      if (!currentUser || !db) {
        setRole(null);
        setAccess("signed-out");
        return;
      }
      setAccess("checking");
      try {
        const adminDoc = await getDoc(doc(db, "controlAdmins", currentUser.uid));
        const data = adminDoc.data();
        const allowedRoles: Role[] = ["HRD", "Manager", "Owner", "Admin"];
        if (adminDoc.exists() && data?.active === true && allowedRoles.includes(data?.role)) {
          setRole(data.role as Role);
          setAccess("allowed");
        } else {
          setRole(null);
          setAccess("denied");
          await signOut(currentAuth);
        }
      } catch {
        setRole(null);
        setAccess("denied");
        setError("Tidak bisa memverifikasi hak akses. Periksa koneksi dan aturan Firestore.");
        await signOut(currentAuth);
      }
    });
  }, []);

  useEffect(() => {
    if (access !== "allowed" || !user || !db) return;
    let cancelled = false;
    const loadDashboardStats = async () => {
      setStatsLoading(true);
      try {
        const [usersSnapshot, attendanceSnapshot, requestsSnapshot] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "attendance")),
          getDocs(collection(db, "pengajuan")),
        ]);
        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jakarta",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        const presentToday = attendanceSnapshot.docs.filter((item) => {
          const data = item.data();
          return data.tanggal === today && String(data.status ?? "").toLowerCase() === "hadir";
        }).length;
        const pendingRequests = requestsSnapshot.docs.filter((item) => {
          const status = String(item.data().status ?? "").toLowerCase();
          return status === "menunggu" || status === "pending" || status === "menunggu persetujuan";
        }).length;
        if (!cancelled) {
          setStats({
            employees: String(usersSnapshot.size),
            present: String(presentToday),
            pending: String(pendingRequests),
            review: String(pendingRequests),
          });
          setError("");
        }
      } catch {
        if (!cancelled) {
          setStats({ employees: "—", present: "—", pending: "—", review: "—" });
          setError("Data dashboard belum bisa dibaca. Periksa Firestore Security Rules untuk akun admin.");
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    };
    void loadDashboardStats();
    return () => { cancelled = true; };
  }, [access, user]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    setBusy(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (cause: unknown) {
      const code =
        typeof cause === "object" && cause !== null && "code" in cause
          ? String((cause as { code?: unknown }).code ?? "")
          : "";

      if (code === "auth/invalid-email") {
        setError("Format email tidak valid. Periksa kembali alamat email kamu.");
      } else if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/user-not-found"
      ) {
        setError("Email atau kata sandi salah. Periksa kembali lalu coba lagi.");
      } else if (code === "auth/too-many-requests") {
        setError("Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.");
      } else if (code === "auth/network-request-failed") {
        setError("Koneksi internet bermasalah. Periksa koneksi lalu coba lagi.");
      } else if (code === "auth/user-disabled") {
        setError("Akun ini dinonaktifkan. Hubungi Admin.");
      } else {
        setError("Login belum berhasil. Periksa koneksi dan data akun, lalu coba lagi.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (auth) await signOut(auth);
    setRole(null);
    setAccess("signed-out");
  }

  if (access === "checking") {
    return <main className="center-screen"><div className="loader" /><p>Memeriksa akses ABSEN CONTROL…</p></main>;
  }

  if (access === "setup") {
    return (
      <main className="center-screen">
        <section className="setup-card">
          <div className="brand-mark">AC</div>
          <p className="eyebrow">PERSIAPAN WEB</p>
          <h1>Hubungkan Firebase</h1>
          <p className="muted">Fondasi web sudah disiapkan. Salin <code>.env.example</code> menjadi <code>.env.local</code>, lalu isi konfigurasi aplikasi Web dari Firebase Console.</p>
          <p className="small-note">Gunakan konfigurasi aplikasi Web Firebase untuk project <strong>absensi-karyawan-2b712</strong>. Jangan gunakan App ID Android sebagai App ID web.</p>
        </section>
      </main>
    );
  }

  if (access !== "allowed" || !user || !role) {
    return (
      <main className="login-layout">
        <section className="login-brand-panel">
          <div className="brand-lockup"><div className="brand-mark">AC</div><span>ABSEN<span className="brand-light">CONTROL</span></span></div>
          <div className="brand-copy">
            <p className="eyebrow">ATTENDANCE MANAGEMENT</p>
            <h1>Kontrol operasional,<br /><span>dalam satu tempat.</span></h1>
            <p>Panel internal untuk memantau absensi, mengelola karyawan, dan menjaga alur kerja tetap teratur.</p>
          </div>
          <div className="brand-footer">INTERNAL MANAGEMENT SYSTEM · v0.1</div>
        </section>
        <section className="login-panel">
          <form className="login-form" onSubmit={handleLogin}>
            <div className="mobile-brand"><div className="brand-mark">AC</div><strong>ABSEN CONTROL</strong></div>
            <p className="eyebrow">SELAMAT DATANG KEMBALI</p>
            <h2>Masuk ke akun</h2>
            <p className="muted">Gunakan akun resmi pengelola ABSEN CONTROL.</p>
            {error && <div className="alert" role="alert">{error}</div>}
            {access === "denied" && !error && <div className="alert" role="alert">Akun ini belum memiliki role aktif di ABSEN CONTROL. Hubungi Admin.</div>}
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" placeholder="nama@perusahaan.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <label htmlFor="password">Kata sandi</label>
            <input id="password" type="password" autoComplete="current-password" placeholder="Masukkan kata sandi" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Memproses…" : "Masuk ke dashboard"} <span aria-hidden="true">→</span></button>
            <p className="form-footnote"><span className="secure-dot" /> Akses khusus HRD, Manager, Owner, dan Admin</p>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-layout">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark">AC</div><span>ABSEN<span className="brand-light">CONTROL</span></span></div>
        <p className="nav-caption">MENU UTAMA</p>
        <nav className="nav-list" aria-label="Menu utama">
          {menuItems.map((item, index) => (
            <button className={index === 0 ? "nav-item active" : "nav-item"} key={item.title} type="button" onClick={() => index !== 0 && setError("Modul ini akan diaktifkan bertahap setelah struktur data disepakati.")}>
              <span className="nav-icon">{item.icon}</span><span>{item.title}</span>{index === 0 && <span className="active-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom"><div className="online-indicator" /> Firebase connected <span className="version">v0.1</span></div>
      </aside>
      <section className="dashboard-main">
        <header className="topbar">
          <div><p className="eyebrow">OVERVIEW</p><h1>Dashboard</h1></div>
          <div className="account-area"><div className="avatar">{(user.email?.[0] || "A").toUpperCase()}</div><div className="account-copy"><strong>{user.email}</strong><span>{role}</span></div><button className="logout-button" onClick={handleLogout} type="button">Keluar</button></div>
        </header>
        {error && <div className="inline-notice" role="status">{error}<button type="button" onClick={() => setError("")} aria-label="Tutup pesan">×</button></div>}
        <div className="welcome-row"><div><h2>Selamat datang 👋</h2><p>Berikut ruang kerja ABSEN CONTROL untuk hari ini.</p></div><div className="date-chip">{new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date())}</div></div>
        <section className="summary-grid" aria-label="Ringkasan">
          <article className="summary-card"><div className="summary-top"><span>Total Karyawan</span><span className="summary-icon blue">♙</span></div><strong>{stats.employees}</strong><p>{statsLoading ? "Memuat data karyawan…" : "Data dari Firestore"}</p></article>
          <article className="summary-card"><div className="summary-top"><span>Hadir Hari Ini</span><span className="summary-icon green">✓</span></div><strong>{stats.present}</strong><p>{statsLoading ? "Memuat data absensi…" : "Kehadiran pada hari ini"}</p></article>
          <article className="summary-card"><div className="summary-top"><span>Pengajuan Pending</span><span className="summary-icon amber">◷</span></div><strong>{stats.pending}</strong><p>{statsLoading ? "Memuat data pengajuan…" : "Pengajuan berstatus menunggu"}</p></article>
          <article className="summary-card"><div className="summary-top"><span>Perlu Ditinjau</span><span className="summary-icon purple">▤</span></div><strong>{stats.review}</strong><p>{statsLoading ? "Memuat ringkasan…" : "Pengajuan yang perlu ditinjau"}</p></article>
        </section>
        <section className="content-grid">
          <article className="content-card main-card"><div className="section-heading"><div><h3>Modul pengelolaan</h3><p>Ruang kerja utama sesuai hak akses akun.</p></div><span className="module-count">06 modul</span></div><div className="module-grid">{menuItems.slice(1).map((item) => <button className="module-tile" key={item.title} type="button" onClick={() => setError(item.title + " belum terhubung ke data nyata. Kita bangun setelah struktur data dikonfirmasi.")}><span className="module-icon">{item.icon}</span><strong>{item.title}</strong><span>{item.description}</span><span className="tile-arrow">↗</span></button>)}</div></article>
          <aside className="content-card access-card"><div className="section-heading"><div><h3>Akses akun</h3><p>Role yang aktif saat ini.</p></div></div><div className="role-emblem">♙</div><span className="role-pill">{role}</span><h4>{role === "Admin" ? "Administrator sistem" : role}</h4><p className="muted">{roleDescriptions[role]}</p><div className="access-divider" /><div className="access-status"><span className="secure-dot" /> Akun terverifikasi</div><p className="small-note">Hak akses diverifikasi melalui dokumen controlAdmins di Firestore.</p></aside>
        </section>
        <footer className="dashboard-footer">ABSEN CONTROL <span>·</span> Panel internal manajemen absensi</footer>
      </section>
    </main>
  );
}