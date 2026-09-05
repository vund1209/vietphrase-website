import type { Metadata } from "next";
import { Geist, Geist_Mono, Cormorant_Garamond, Crimson_Pro } from "next/font/google";
import "./globals.css";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { ToastProvider } from "@/components/ToastProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for the wordmark and page headings (see --font-display in
// globals.css) -- paired with Crimson Pro below per ui-ux-pro-max's "Book &
// Reading Tracker" typography recommendation.
const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-display",
  weight: ["500", "600", "700"],
  subsets: ["latin", "latin-ext", "vietnamese"],
});

// Serif face for chapter body text (see .prose-reading in globals.css) --
// has a dedicated "vietnamese" subset, unlike the Noto Serif it replaces.
const crimsonPro = Crimson_Pro({
  variable: "--font-reading",
  subsets: ["latin", "latin-ext", "vietnamese"],
});

export const metadata: Metadata = {
  title: "VietPhrase",
  description: "Chinese to Vietnamese novel translation, VietPhrase-style.",
};

// Sets the `.dark` class before paint (persisted choice > OS preference) so
// there's no flash of the wrong theme -- must run before hydration, hence a
// plain inline script rather than a useEffect in ThemeToggle.tsx.
const THEME_INIT_SCRIPT = `
(function () {
  var stored = localStorage.getItem("theme");
  var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} ${cormorantGaramond.variable} ${crimsonPro.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <AuthSessionProvider>
          <ToastProvider>
            <SiteHeader />
            {children}
          </ToastProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
