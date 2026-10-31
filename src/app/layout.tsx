import type { Metadata } from "next";
import { Geist_Mono, Inter, Space_Grotesk } from "next/font/google";
import localFont from "next/font/local";

import { AuthProvider } from "@/components/auth-provider";
import { ServiceWorkerCleanup } from "@/components/service-worker-cleanup";
import { ThemeScript } from "@/components/settings/ThemeScript";
import { FunUiScript } from "@/components/settings/FunUiScript";

import "./globals.css";

/** The redesign's body copy face (BUILD_SPEC.md) — replaces Geist Sans, which
 *  nothing actually rendered with (body pinned to plain Arial before this). */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

/** The redesign's headline/display face, for h1-h3 and anything marked .display
 *  (see globals.css) — the rounder, more graphic sibling to Inter's body text. */
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

/** Still used for job/cost-code prefixes and IDs via Tailwind's font-mono utility —
 *  unrelated to the redesign, kept as-is. */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Fun-UI display face (Jarvis mascot theme). Vendored as next/font/local so CI
 *  builds never hit Google Fonts' intermittent /l/font?kit= responses that break
 *  Turbopack with "next/font/google queries have exactly one entry"
 *  (vercel/next.js#99114). Source: Google Fonts Fredoka v17 latin woff2 for
 *  weights 500–700 (variable font file). */
const fredoka = localFont({
  src: "../fonts/Fredoka-latin.woff2",
  variable: "--font-fredoka",
  weight: "500 700",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WCI OS",
  description: "Construction management for World Construction Inc",
  // Was set only on /field's own layout, from when that was the only section meant to
  // be installed as a home-screen app — every section is now, so this is site-wide.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "WCI OS" },
};

/**
 * App-wide default for every route's Server Actions (a route can still set its own,
 * shorter maxDuration to override this). The AI drafting actions — estimate/change
 * order/lead proposal drafting, which call Opus 5 with up to a 16k-token ceiling and
 * sometimes photos — can legitimately run well past a serverless platform's default
 * ~10s function timeout; without this they get killed mid-call, which surfaces to the
 * browser as a generic "An unexpected response was received from the server" error
 * instead of a real one. Both Netlify's and Vercel's Next.js runtimes read this
 * route-segment config to size the underlying function's timeout, up to whatever the
 * hosting plan allows.
 */
export const maxDuration = 120;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthProvider>
      <html
        lang="en"
        className={`${inter.variable} ${spaceGrotesk.variable} ${geistMono.variable} ${fredoka.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <ThemeScript />
        <FunUiScript />
        <body className="min-h-full flex flex-col bg-background text-foreground">
          <ServiceWorkerCleanup />
          {children}
        </body>
      </html>
    </AuthProvider>
  );
}
