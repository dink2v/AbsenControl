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

type Role = "Manager" | "Owner" | "Admin";
type AccessState = "checking" | "signed-out" | "allowed" | "denied" | "setup";
type EmployeeRecord = { id: string; uid: string; name: string; email: string; department: string; position: string; role: string; status: string; managerRefs: string[]; managerName: string };

const roleDescriptions: Record<Role, string> = {
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
  const [accessProfile, setAccessProfile] = useState<Record<string, unknown>>({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({ employees: "—", present: "—", pending: "—", review: "—" });
  const [statsLoading, setStatsLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("Dashboard");
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [attendanceRows, setAttendanceRows] = useState<{id:string;name:string;date:string;checkIn:string;checkOut:string;status:string}[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));

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
        // Avoid leaving the full-screen access checker spinning forever if Firestore
        // cannot complete the access-profile read (for example, network/rules issues).
        const adminDoc = await Promise.race([
          getDoc(doc(db, "controlAdmins", currentUser.uid)),
          new Promise<never>((_, reject) =>
            window.setTimeout(
              () => reject(new Error("ACCESS_CHECK_TIMEOUT")),
              12000,
            ),
          ),
        ]);
        const data = adminDoc.data();
        // Only these three roles may access the web admin panel.
        // Normalize case so "MANAGER" and "Manager" are treated consistently.
        const roleByKey: Record<string, Role> = {
          admin: "Admin",
          manager: "Manager",
          owner: "Owner",
        };
        const verifiedRole = roleByKey[String(data?.role ?? "").trim().toLowerCase()];
        if (adminDoc.exists() && data?.active === true && verifiedRole) {
          setAccessProfile(data ?? {});
          setRole(verifiedRole);
          setAccess("allowed");
        } else {
          setRole(null);
          setAccessProfile({});
          setAccess("denied");
          await signOut(currentAuth);
        }
      } catch {
        setRole(null);
        setAccessProfile({});
        setAccess("denied");
        setError("Tidak bisa memverifikasi hak akses. Periksa koneksi dan aturan Firestore.");
        await signOut(currentAuth);
      }
    });
  }, []);

  useEffect(() => {
    if (access !== "allowed" || !user || !db) return;
    const currentDb = db;
    let cancelled = false;
    const loadDashboardStats = async () => {
      setStatsLoading(true);
      try {
        const [usersSnapshot, attendanceSnapshot, requestsSnapshot] = await Promise.all([
          getDocs(collection(currentDb, "users")),
          getDocs(collection(currentDb, "attendance")),
          getDocs(collection(currentDb, "pengajuan")),
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

  useEffect(() => {
    if (access !== "allowed" || !user || !db || activeSection !== "Data Karyawan") return;
    const currentDb = db;
    let cancelled = false;
    const loadEmployees = async () => {
      setEmployeesLoading(true);
      setError("");
      try {
        const snapshot = await getDocs(collection(currentDb, "users"));
        const rows = snapshot.docs.map((item) => {
          const data = item.data();
          const pick = (...keys: string[]) => {
            for (const key of keys) {
              const value = data[key];
              if (typeof value === "string" && value.trim()) return value.trim();
            }
            return "";
          };
          const managerRefs = [
            "managerId", "managerUid", "managerUserId", "managerEmail", "manager_id",
            "atasanId", "idAtasan", "atasanUid", "atasanEmail", "reportsTo",
            "supervisorId", "supervisorUid", "leaderId", "managerName", "namaAtasan",
            "atasan", "supervisorName",
          ].map((key) => data[key]).filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim().toLowerCase());
          return {
            id: item.id,
            uid: pick("uid", "userId", "authUid", "firebaseUid") || item.id,
            name: pick("nama", "name", "namaLengkap", "fullName", "displayName") || "Tanpa nama",
            email: pick("email", "emailAddress").toLowerCase(),
            department: pick("departemen", "department", "divisi", "division"),
            position: pick("jabatan", "position", "jobTitle", "title"),
            role: pick("role", "peran") || "Karyawan",
            status: pick("status", "statusAkun", "accountStatus") || "Aktif",
            managerRefs,
            managerName: pick("managerName", "namaAtasan", "atasan", "supervisorName"),
          };
        }).sort((a, b) => a.name.localeCompare(b.name, "id"));
        if (!cancelled) setEmployees(rows);
      } catch {
        if (!cancelled) {
          setEmployees([]);
          setError("Data karyawan belum bisa dibaca. Pastikan akun admin diizinkan membaca koleksi users pada Firestore Security Rules.");
        }
      } finally {
        if (!cancelled) setEmployeesLoading(false);
      }
    };
    void loadEmployees();
    return () => { cancelled = true; };
  }, [access, user, activeSection]);

  useEffect(() => {
    if (access !== "allowed" || !user || !db || activeSection !== "Absensi") return;
    const currentDb = db;
    let cancelled = false;
    const loadAttendance = async () => {
      setAttendanceLoading(true);
      setError("");
      try {
        const snapshot = await getDocs(collection(currentDb, "attendance"));
        const rows = snapshot.docs.map((item) => {
          const data = item.data();
          const pick = (...keys: string[]) => {
            for (const key of keys) {
              const value = data[key];
              if (typeof value === "string" && value.trim()) return value.trim();
            }
            return "";
          };
          return {
            id: item.id,
            name: pick("nama", "name", "namaLengkap", "fullName") || "Tanpa nama",
            date: pick("tanggal", "date", "attendanceDate"),
            checkIn: pick("jamMasuk", "checkIn", "waktuMasuk", "clockIn"),
            checkOut: pick("jamPulang", "checkOut", "waktuPulang", "clockOut"),
            status: pick("status") || "Tidak diketahui",
          };
        }).sort((a, b) => b.date.localeCompare(a.date, "id") || a.name.localeCompare(b.name, "id"));
        if (!cancelled) setAttendanceRows(rows);
      } catch {
        if (!cancelled) {
          setAttendanceRows([]);
          setError("Data absensi belum bisa dibaca. Pastikan akun admin diizinkan membaca koleksi attendance pada Firestore Security Rules.");
        }
      } finally {
        if (!cancelled) setAttendanceLoading(false);
      }
    };
    void loadAttendance();
    return () => { cancelled = true; };
  }, [access, user, activeSection]);

  const profileRefs = [
    user?.uid,
    user?.email,
    ...["employeeId", "userId", "uid", "authUid", "firebaseUid", "email", "employeeEmail", "karyawanId", "idKaryawan"].map((key) => accessProfile[key]).filter((value): value is string => typeof value === "string"),
  ].filter((value): value is string => Boolean(value)).map((value) => value.trim().toLowerCase());

  const managerEmployee = employees.find((employee) =>
    profileRefs.includes(employee.id.toLowerCase()) ||
    profileRefs.includes(employee.uid.toLowerCase()) ||
    (employee.email && profileRefs.includes(employee.email))
  );
  const managerIdentityFound = role !== "Manager" || Boolean(managerEmployee);

  const visibleEmployees = role !== "Manager"
    ? employees
    : (() => {
        if (!managerEmployee) return [];
        const included = new Set<string>([managerEmployee.id]);
        const parentTokens = (employee: EmployeeRecord) => [
          employee.id, employee.uid, employee.email, employee.name,
        ].filter(Boolean).map((value) => value.toLowerCase());
        let changed = true;
        while (changed) {
          changed = false;
          for (const employee of employees) {
            if (included.has(employee.id)) continue;
            const parentMatches = employee.managerRefs.some((ref) =>
              Array.from(included).some((includedId) => {
                const parent = employees.find((candidate) => candidate.id === includedId);
                return parent ? parentTokens(parent).includes(ref) : false;
              })
            );
            if (parentMatches) {
              included.add(employee.id);
              changed = true;
            }
          }
        }
        return employees.filter((employee) => included.has(employee.id) && employee.id !== managerEmployee.id);
      })();

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
            <button className={activeSection === item.title ? "nav-item active" : "nav-item"} key={item.title} type="button" onClick={() => { setActiveSection(item.title); setError(""); }}>
              <span className="nav-icon">{item.icon}</span><span>{item.title}</span>{index === 0 && <span className="active-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom"><div className="online-indicator" /> Firebase connected <span className="version">v0.1</span></div>
      </aside>
      <section className="dashboard-main">
        <header className="topbar">
          <div><p className="eyebrow">RUANG KERJA</p><h1>{activeSection}</h1></div>
          <div className="account-area"><div className="avatar">{(user.email?.[0] || "A").toUpperCase()}</div><div className="account-copy"><strong>{user.email}</strong><span>{role}</span></div><button className="logout-button" onClick={handleLogout} type="button">Keluar</button></div>
        </header>
        {error && <div className="inline-notice" role="status">{error}<button type="button" onClick={() => setError("")} aria-label="Tutup pesan">×</button></div>}
        {activeSection === "Dashboard" && <div className="welcome-row"><div><h2>Selamat datang 👋</h2><p>Berikut ruang kerja ABSEN CONTROL untuk hari ini.</p></div><div className="date-chip">{new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date())}</div></div>}
        {activeSection === "Data Karyawan" ? <section className="content-card employees-panel">
          <div className="section-heading"><div><h3>Data Karyawan</h3><p>Data langsung dari koleksi <code>users</code> di Firestore.</p></div><span className="module-count">{employees.length} karyawan</span></div>
          <div className="employee-toolbar"><input aria-label="Cari karyawan" placeholder="Cari nama, email, divisi…" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} /><button type="button" className="logout-button" onClick={() => setEmployeeSearch("")}>Reset pencarian</button></div>
          {employeesLoading ? <p className="employee-state">Memuat data karyawan dari Firestore…</p> : <div className="employee-table-wrap"><table className="employee-table"><thead><tr><th>Nama</th><th>Email</th><th>Jabatan / Divisi</th><th>Role</th><th>Status</th></tr></thead><tbody>
            {visibleEmployees.filter((employee) => [employee.name, employee.email, employee.department, employee.position, employee.role, employee.status].some((value) => value.toLowerCase().includes(employeeSearch.toLowerCase().trim()))).map((employee) => <tr key={employee.id}><td><strong>{employee.name}</strong><small>ID: {employee.id}</small></td><td>{employee.email || "—"}</td><td>{[employee.position, employee.department].filter(Boolean).join(" · ") || "—"}</td><td>{employee.role}</td><td><span className="employee-status">{employee.status}</span></td></tr>)}
          </tbody></table>
          {visibleEmployees.length === 0 && !employeesLoading && <p className="employee-state">{role === "Manager" && !managerIdentityFound ? "Akun Manager belum bisa dicocokkan dengan data karyawan. Hubungkan email/UID akun ke dokumen users agar hierarki tim dapat ditampilkan." : "Belum ada karyawan dalam cakupan akses ini."}</p>}
          {visibleEmployees.length > 0 && visibleEmployees.filter((employee) => [employee.name, employee.email, employee.department, employee.position, employee.role, employee.status].some((value) => value.toLowerCase().includes(employeeSearch.toLowerCase().trim()))).length === 0 && <p className="employee-state">Tidak ada karyawan yang cocok dengan pencarian.</p>}
          </div>}
          {role === "Manager" && <p className="small-note">Akses Manager dibatasi ke seluruh hierarki bawahan langsung dan tidak langsung. Hubungan tim dibaca dari field atasan/manager pada dokumen karyawan.</p>}
          <p className="small-note">Tampilan ini hanya membaca data. Tambah, edit, dan hapus karyawan akan dibuat setelah format field di koleksi users dikonfirmasi.</p>
        </section> : activeSection === "Absensi" ? <section className="content-card employees-panel">
          <div className="section-heading"><div><h3>Rekap Absensi</h3><p>Data langsung dari koleksi <code>attendance</code> di Firestore.</p></div><span className="module-count">{attendanceRows.length} catatan</span></div>
          <div className="employee-toolbar attendance-toolbar"><input aria-label="Cari absensi" placeholder="Cari nama, status, atau ID…" value={attendanceSearch} onChange={(event) => setAttendanceSearch(event.target.value)} /><label className="attendance-date-label">Tanggal <input aria-label="Filter tanggal absensi" type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></label><button type="button" className="logout-button" onClick={() => { setAttendanceSearch(""); setAttendanceDate(""); }}>Reset filter</button></div>
          {attendanceLoading ? <p className="employee-state">Memuat catatan absensi dari Firestore…</p> : <div className="employee-table-wrap"><table className="employee-table"><thead><tr><th>Tanggal</th><th>Nama</th><th>Jam Masuk</th><th>Jam Pulang</th><th>Status</th><th>ID Dokumen</th></tr></thead><tbody>
            {attendanceRows.filter((item) => (!attendanceDate || item.date === attendanceDate) && [item.name, item.status, item.id].some((value) => value.toLowerCase().includes(attendanceSearch.toLowerCase().trim()))).map((item) => <tr key={item.id}><td>{item.date || "—"}</td><td><strong>{item.name}</strong></td><td>{item.checkIn || "—"}</td><td>{item.checkOut || "—"}</td><td><span className="employee-status">{item.status}</span></td><td><small>{item.id}</small></td></tr>)}
          </tbody></table>
          {attendanceRows.length === 0 && !attendanceLoading && <p className="employee-state">Belum ada catatan pada koleksi <code>attendance</code>.</p>}
          {attendanceRows.length > 0 && attendanceRows.filter((item) => (!attendanceDate || item.date === attendanceDate) && [item.name, item.status, item.id].some((value) => value.toLowerCase().includes(attendanceSearch.toLowerCase().trim()))).length === 0 && <p className="employee-state">Tidak ada catatan absensi yang cocok dengan filter.</p>}
          </div>}
          <p className="small-note">Modul ini hanya membaca data absensi. Fitur koreksi atau perubahan catatan akan dibuat setelah aturan dan struktur data dikonfirmasi.</p>
        </section> : activeSection === "Dashboard" ? <>
        <section className="summary-grid" aria-label="Ringkasan">
          <article className="summary-card"><div className="summary-top"><span>Total Karyawan</span><span className="summary-icon blue">♙</span></div><strong>{stats.employees}</strong><p>{statsLoading ? "Memuat data karyawan…" : "Data dari Firestore"}</p></article>
          <article className="summary-card"><div className="summary-top"><span>Hadir Hari Ini</span><span className="summary-icon green">✓</span></div><strong>{stats.present}</strong><p>{statsLoading ? "Memuat data absensi…" : "Kehadiran pada hari ini"}</p></article>
          <article className="summary-card"><div className="summary-top"><span>Pengajuan Pending</span><span className="summary-icon amber">◷</span></div><strong>{stats.pending}</strong><p>{statsLoading ? "Memuat data pengajuan…" : "Pengajuan berstatus menunggu"}</p></article>
          <article className="summary-card"><div className="summary-top"><span>Perlu Ditinjau</span><span className="summary-icon purple">▤</span></div><strong>{stats.review}</strong><p>{statsLoading ? "Memuat ringkasan…" : "Pengajuan yang perlu ditinjau"}</p></article>
        </section>
        <section className="content-grid">
          <article className="content-card main-card"><div className="section-heading"><div><h3>Modul pengelolaan</h3><p>Ruang kerja utama sesuai hak akses akun.</p></div><span className="module-count">06 modul</span></div><div className="module-grid">{menuItems.slice(1).map((item) => <button className="module-tile" key={item.title} type="button" onClick={() => { setActiveSection(item.title); setError(""); }}><span className="module-icon">{item.icon}</span><strong>{item.title}</strong><span>{item.description}</span><span className="tile-arrow">↗</span></button>)}</div></article>
          <aside className="content-card access-card"><div className="section-heading"><div><h3>Akses akun</h3><p>Role yang aktif saat ini.</p></div></div><div className="role-emblem">♙</div><span className="role-pill">{role}</span><h4>{role === "Admin" ? "Administrator sistem" : role}</h4><p className="muted">{roleDescriptions[role]}</p><div className="access-divider" /><div className="access-status"><span className="secure-dot" /> Akun terverifikasi</div><p className="small-note">Hak akses diverifikasi melalui dokumen controlAdmins di Firestore.</p></aside>
        </section>
        </> : <section className="content-card employees-panel"><div className="section-heading"><div><h3>{activeSection}</h3><p>Modul ini belum dihubungkan ke koleksi data terkait.</p></div></div><p className="employee-state">Kita lanjutkan setelah struktur data modul ini dikonfirmasi. Bagian Data Karyawan sudah membaca koleksi <code>users</code>.</p></section>}
        <footer className="dashboard-footer">ABSEN CONTROL <span>·</span> Panel internal manajemen absensi</footer>
      </section>
    </main>
  );
}