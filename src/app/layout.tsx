import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "VietPhrase",
  description: "Chinese to Vietnamese novel translation, VietPhrase-style.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthSessionProvider>
          <header className="border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
            <nav className="mx-auto flex max-w-5xl items-center gap-4 text-sm">
              <Link href="/" className="font-semibold">
                VietPhrase
              </Link>
              <Link href="/translate">Dịch nhanh</Link>
              <AuthNav />
            </nav>
          </header>
          {children}
        </AuthSessionProvider>
      </body>
    </html>
  );
}
