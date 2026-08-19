import type { Metadata } from "next";
import { Marcellus, Inter } from "next/font/google";
import "./globals.css";

// Resonance brand heading face. Marcellus is single-weight (400).
const display = Marcellus({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Rumi",
  description: "Your personal brand operating system.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
