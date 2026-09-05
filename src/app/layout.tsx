import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Serif } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import { AuthNav } from "@/components/AuthNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Serif face for chapter body text (see .prose-reading in globals.css) --
// "latin-ext" is required for Vietnamese diacritics beyond plain Latin.
const notoSerif = Noto_Serif({
  variable: "--font-reading",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "VietPhrase",
  description: "Chinese to Vietnamese novel translation, VietPhrase-style.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthSessionProvider>
          <header className="border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
            <nav className="mx-auto flex max-w-5xl items-center gap-4 text-sm">
              <Link href="/" className="font-semibold">
                VietPhrase
              </Link>
              <Link href="/translate">Dịch nhanh</Link>
              <Link href="/search">Tìm truyện</Link>
              <AuthNav />
            </nav>
          </header>
          {children}
        </AuthSessionProvider>
      </body>
    </html>
  );
}
