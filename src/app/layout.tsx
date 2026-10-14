import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import { SyncAgent } from "@/features/sync/sync-agent";
import { Toaster } from "@/features/toast/toaster";
import { UpdateBanner } from "@/features/update/update-banner";
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
  applicationName: "Scout Vôlei",
  title: "Scout Vôlei",
  description: "Scout de vôlei offline-first (beach 2x2 e indoor 6x6).",
  appleWebApp: { capable: true, title: "Scout Vôlei", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f59e0b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Em dev o SW fica desligado para não servir código antigo do cache.
            reloadOnOnline desligado: a volta do Wi-Fi não pode recarregar o scout no meio do rali. */}
        <SerwistProvider
          swUrl="/serwist/sw.js"
          disable={process.env.NODE_ENV === "development"}
          reloadOnOnline={false}
        >
          <UpdateBanner />
          <SyncAgent />
          {children}
          <Toaster />
        </SerwistProvider>
      </body>
    </html>
  );
}
