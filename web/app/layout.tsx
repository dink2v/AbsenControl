import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ABSEN CONTROL",
  description: "Panel kontrol absensi dan operasional karyawan.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}