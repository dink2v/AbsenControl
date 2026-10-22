# ABSEN CONTROL

**Panel pengelolaan absensi dan operasional karyawan dalam satu tempat.**

ABSEN CONTROL adalah proyek web admin untuk membantu pengelola memantau kehadiran, data karyawan, dan pengajuan karyawan. Aplikasi menggunakan Firebase Authentication untuk login serta Cloud Firestore untuk membaca data.

<p align="center">

  **[🚀 Buka Web App ABSEN CONTROL](https://dink2v.github.io/AbsenControl/)**

</p>

> **Status:** Dalam pengembangan. Web app memerlukan akun pengelola yang terdaftar dan memiliki role aktif untuk masuk ke dashboard.

## Fitur

### Sudah tersedia pada web
- Login pengelola menggunakan email dan kata sandi Firebase.
- Pemeriksaan akses melalui dokumen `controlAdmins`, role, dan status akun aktif.
- Ringkasan dashboard yang terhubung ke Firestore:
  - Total data karyawan dari koleksi `users`.
  - Kehadiran hari ini dari koleksi `attendance`.
  - Pengajuan berstatus menunggu dari koleksi `pengajuan`.
- Logout dari dashboard.

### Dalam pengembangan
- Daftar dan detail data karyawan.
- Rekap absensi dan laporan.
- Pemeriksaan serta pengelolaan pengajuan.
- Pengaturan akun dan role.
- Kotak masuk chat admin dengan karyawan.

*Catatan: menu yang terlihat di antarmuka belum tentu seluruh fungsinya aktif. Fitur akan ditandai siap setelah implementasi dan pengujian selesai.*

## Teknologi

- Next.js, React, dan TypeScript
- Firebase Authentication
- Cloud Firestore
- GitHub Pages

## Repository

- **ABSEN CONTROL (admin):** repository ini.
- **Absensi Karyawan:** aplikasi karyawan berada di repository terpisah, [dink2v/AbsensiKaryawan](https://github.com/dink2v/AbsensiKaryawan).

Kedua aplikasi direncanakan menggunakan project Firebase yang sama dengan pengaturan akses yang sesuai.

## Keamanan

- Jangan memasukkan kata sandi, private key, service-account JSON, atau rahasia lain ke repository.
- Akses admin diperiksa melalui dokumen `controlAdmins/{uid}` dengan role yang diizinkan dan `active: true`.
- Pemeriksaan akses di sisi web bukan pengganti **Firestore Security Rules**. Aturan database harus membatasi akses ke data dan tindakan admin secara independen.
- Perubahan aturan keamanan produksi harus diuji sebelum digunakan.

## Status pengembangan

Web app sudah berhasil melalui proses build dan deploy GitHub Pages. Tahap berikutnya adalah memastikan data dashboard tampil dengan benar dan mengembangkan fitur admin lainnya secara bertahap.

---

Dikembangkan untuk proyek **ABSEN CONTROL**.
