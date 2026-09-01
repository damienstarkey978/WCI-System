import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AuthProvider } from "@/components/auth-provider";
import { ServiceWorkerCleanup } from "@/components/service-worker-cleanup";
import { ThemeScript } from "@/components/settings/ThemeScript";
import { FunUiScript } from "@/components/settings/FunUiScript";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
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
