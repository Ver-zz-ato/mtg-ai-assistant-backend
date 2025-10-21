import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import '@/styles/ph-toolbar-fix.css';
import Providers from "@/components/Providers";
import AnalyticsProvider from "@/components/AnalyticsProvider";
import SupportWidgets from "@/components/SupportWidgets";
import CookieBanner from "@/components/CookieBanner";
import ErrorBoundary from "@/components/ErrorBoundary";
import MaintenanceBanner from "@/components/MaintenanceBanner";
import PromoBar from "@/components/PromoBar";
import FeedbackFab from "@/components/FeedbackFab";
// import PWAProvider from "@/components/PWAProvider"; // DISABLED: PWA not needed yet
import FirstVisitTracker from "@/components/FirstVisitTracker";
import TrustFooter from "@/components/TrustFooter";
import UndoToast from "@/components/UndoToast";
import KeyboardShortcutsProvider from "@/components/KeyboardShortcutsProvider";
// import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration"; // DISABLED: PWA not needed yet
import ServiceWorkerCleanup from "@/components/ServiceWorkerCleanup"; // Temporary: cleans up old SW
import GuestExitWarning from "@/components/GuestExitWarning";
import IOSInstallPrompt from "@/components/iOSInstallPrompt";
import EmailVerificationReminder from "@/components/EmailVerificationReminder";
import TopLoadingBar from "@/components/TopLoadingBar";

export const metadata: Metadata = {
  metadataBase: new URL("https://manatap.ai"),
  title: "ManaTap AI - MTG Deck Builder & Assistant",
  description: "Your intelligent Magic: The Gathering deck building assistant with AI chat, cost analysis, and budget optimization.",
  keywords: "MTG, Magic The Gathering, deck builder, AI assistant, card prices, budget analysis",
  authors: [{ name: "ManaTap AI" }],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ManaTap AI',
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-64x64.png', sizes: '64x64', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#2563eb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Providers>
          <KeyboardShortcutsProvider>
            <TopLoadingBar />
            <FirstVisitTracker />
            <AnalyticsProvider />
            <PromoBar />
            <MaintenanceBanner />
            <ErrorBoundary>
              <Header />
              <main className="flex-1">{children}</main>
            </ErrorBoundary>
            <CookieBanner />
            <FeedbackFab />
            {/* <PWAProvider /> */} {/* DISABLED: PWA not needed yet */}
            <TrustFooter />
            <SupportWidgets />
            <UndoToast />
            {/* <ServiceWorkerRegistration /> */} {/* DISABLED: PWA not needed yet */}
            <ServiceWorkerCleanup /> {/* Temporary: removes old SW from users' browsers */}
            <GuestExitWarning />
            <IOSInstallPrompt />
            <EmailVerificationReminder />
          </KeyboardShortcutsProvider>
        </Providers>
      </body>
    </html>
  );
}
