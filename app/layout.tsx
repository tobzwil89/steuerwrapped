import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steuer Wrapped 2026 | Dein Jahr in Steuern & Abgaben",
  description:
    "Finde heraus, wie viel Steuern und Abgaben du 2026 zahlst – Spotify Wrapped Style. Kostenlos, anonym, direkt im Browser.",
  openGraph: {
    title: "Steuer Wrapped 2026",
    description:
      "Dein Jahr in Steuern & Abgaben – Spotify Wrapped Style. Kostenlos & anonym.",
    type: "website",
    locale: "de_DE",
  },
  twitter: {
    card: "summary_large_image",
    title: "Steuer Wrapped 2026",
    description: "Finde heraus, wie viel Steuern und Abgaben du 2026 zahlst.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
