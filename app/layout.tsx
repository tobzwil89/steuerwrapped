import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steuer Wrapped 2026 | Dein Jahr in Steuern & Abgaben",
  description: "Finde heraus, wie viel Steuern und Abgaben du 2026 zahlst – Spotify Wrapped Style. Kostenlos, anonym, direkt im Browser.",
  keywords: "Steuer, Steuern Deutschland, Abgaben, Steuerrechner, Tax Wrapped, Bundeshaushalt",
  openGraph: {
    title: "Steuer Wrapped 2026",
    description: "Dein Jahr in Steuern & Abgaben – interaktiv visualisiert",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Steuer Wrapped 2026",
    description: "Wie viel Steuern zahlst du wirklich?",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
