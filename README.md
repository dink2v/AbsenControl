# ABSEN CONTROL

**Panel pengelolaan absensi dan operasional karyawan dalam satu tempat.**

ABSEN CONTROL adalah proyek web admin untuk membantu pengelola memantau kehadiran, data karyawan, dan pengajuan karyawan. Web app menggunakan Firebase Authentication untuk login serta Cloud Firestore untuk membaca data.

<p align="center">

  **[Buka Web App ABSEN CONTROL](https://dink2v.github.io/AbsenControl/)**

</p>

> Web app saat ini masih dalam tahap pengembangan. Akses dashboard memerlukan akun pengelola yang sudah terdaftar dan memiliki role aktif.

## Fitur

### Tersedia pada web saat ini
- Login pengelola menggunakan email dan kata sandi Firebase.
- Pemeriksaan akses berdasarkan dokumen `controlAdmins`, role, dan status aktif.
- Dashboard ringkasan yang membaca data dari Firestore:
  - Total data karyawan dari koleksi `users`.
  - Kehadiran hari ini dari koleksi `attendance`.
  - Pengajuan berstatus menunggu dari koleksi `pengajuan`.
- Logout dari dashboard.

### Bagian dashboard yang sedang dikembangkan
- Data karyawan dan detail profil.
- Rekap absensi dan laporan.
- Pemeriksaan serta pengelolaan pengajuan.
- Pengaturan akun dan role.
- Kotak masuk chat admin dengan karyawan.

Menu yang ditampilkan pada antarmuka belum berarti seluruh fiturnya sudah aktif. Fitur akan ditandai siap setelah implementasi dan pengujian selesai.

## Teknologi

- Next.js dan React
- TypeScript
- Firebase Authentication
- Cloud Firestore
- GitHub Pages untuk publikasi web

## Repository terkait

- **ABSEN CONTROL (admin):** repository ini.
- **Absensi Karyawan:** aplikasi karyawan berada di repository terpisah, `dink2v/AbsensiKaryawan`.

Kedua aplikasi direncanakan menggunakan project Firebase yang sama dengan akses dan aturan keamanan yang sesuai.

## Keamanan

- Jangan masukkan kata sandi, private key, service-account JSON, atau rahasia lain ke repository.
- Akses admin diperiksa melalui dokumen `controlAdmins/{uid}` dengan role yang diizinkan dan `active: true`.
- Pemeriksaan di sisi web bukan pengganti Firestore Security Rules. Aturan Firestore harus tetap membatasi akses ke data dan tindakan admin.
- Jangan mengaktifkan atau mengubah aturan keamanan produksi tanpa pengujian.

## Status proyek

Web app sudah berhasil melalui proses build dan deploy GitHub Pages. Pengembangan berikutnya berfokus pada verifikasi pembacaan data dashboard, lalu implementasi fitur admin lainnya secara bertahap.

---

Dikembangkan untuk proyek **ABSEN CONTROL**.
