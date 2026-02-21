import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import '@/styles/ph-toolbar-fix.css';
import Providers from "@/components/Providers";
import { AuthProvider } from "@/lib/auth-context"; // NEW: Push-based auth state management
import AnalyticsProvider from "@/components/AnalyticsProvider";
import AnalyticsIdentity from "@/components/AnalyticsIdentity";
import WorkflowAbandonOnRouteChange from "@/components/WorkflowAbandonOnRouteChange";
import SupportWidgets from "@/components/SupportWidgets";
import CookieConsentModal from "@/components/CookieConsentModal";
import { CookieConsentProvider } from "@/components/CookieConsentContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import MaintenanceBanner from "@/components/MaintenanceBanner";
import PromoBar from "@/components/PromoBar";
import FeedbackFab from "@/components/FeedbackFab";
// import PWAProvider from "@/components/PWAProvider"; // DISABLED: PWA not needed yet
import FirstVisitTracker from "@/components/FirstVisitTracker";
import AnalyticsAttribution from "@/components/AnalyticsAttribution";
import TrustFooter from "@/components/TrustFooter";
import UndoToast from "@/components/UndoToast";
import KeyboardShortcutsProvider from "@/components/KeyboardShortcutsProvider";
// import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration"; // DISABLED: PWA not needed yet
import ServiceWorkerCleanup from "@/components/ServiceWorkerCleanup"; // Temporary: cleans up old SW
import GuestExitWarning from "@/components/GuestExitWarning";
import IOSInstallPrompt from "@/components/iOSInstallPrompt";
import EmailVerificationReminder from "@/components/EmailVerificationReminder";
import TopLoadingBar from "@/components/TopLoadingBar";
import GlobalBackground from "@/components/GlobalBackground";
import SecureConnectionsGuard from "@/components/SecureConnectionsGuard";
import { ActiveUsersProvider } from "@/lib/active-users-context";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.manatap.ai"),
  title: "ManaTap AI - MTG Deck Builder & Assistant",
  description: "Your intelligent Magic: The Gathering deck building assistant with AI chat, cost analysis, and budget optimization.",
  keywords: "MTG, Magic The Gathering, deck builder, AI assistant, card prices, budget analysis",
  authors: [{ name: "ManaTap AI" }],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.manatap.ai",
    siteName: "ManaTap AI",
    title: "ManaTap AI - MTG Deck Builder & Assistant",
    description: "Your intelligent Magic: The Gathering deck building assistant with AI chat, cost analysis, and budget optimization.",
    images: [
      {
        url: "/manatap-og-image.png",
        width: 1200,
        height: 630,
        alt: "ManaTap AI - MTG Deck Builder",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ManaTap AI - MTG Deck Builder & Assistant",
    description: "Your intelligent Magic: The Gathering deck building assistant with AI chat, cost analysis, and budget optimization.",
    images: ["/manatap-og-image.png"],
  },
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
  maximumScale: 5, // Allow up to 5x zoom
  userScalable: true, // Enable zooming
  themeColor: '#2563eb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* PERFORMANCE: DNS prefetch & preconnect for third-party services */}
        <link rel="preconnect" href="https://cards.scryfall.io" />
        <link rel="dns-prefetch" href="https://cards.scryfall.io" />
        <link rel="preconnect" href="https://api.scryfall.com" />
        <link rel="dns-prefetch" href="https://api.scryfall.com" />
        <link rel="preconnect" href="https://eu.i.posthog.com" />
        <link rel="dns-prefetch" href="https://eu.i.posthog.com" />
      </head>
      <body className="min-h-screen flex flex-col">
        <GlobalBackground />
        <Providers>
          <CookieConsentProvider>
            <AuthProvider>
              <ActiveUsersProvider>
              <KeyboardShortcutsProvider>
                <SecureConnectionsGuard />
                <TopLoadingBar />
                <FirstVisitTracker />
                <AnalyticsAttribution />
                <AnalyticsProvider />
                <AnalyticsIdentity />
                <WorkflowAbandonOnRouteChange />
                <PromoBar />
                <MaintenanceBanner />
                <ErrorBoundary>
                  <Header />
                  <main className="flex-1 flex flex-col min-h-0">{children}</main>
                </ErrorBoundary>
                <CookieConsentModal />
                <FeedbackFab />
                {/* <PWAProvider /> */} {/* DISABLED: PWA not needed yet */}
                <TrustFooter />
                <SupportWidgets />
                <UndoToast />
                {/* <ServiceWorkerRegistration /> */} {/* DISABLED: PWA not needed yet */}
                {/* <ServiceWorkerCleanup /> */} {/* DISABLED: Conflicts with Sentry instrumentation */}
                <GuestExitWarning />
                {/* <IOSInstallPrompt /> */} {/* DISABLED: Remove install popup per user request */}
                <EmailVerificationReminder />
              </KeyboardShortcutsProvider>
              </ActiveUsersProvider>
            </AuthProvider>
          </CookieConsentProvider>
        </Providers>
      </body>
    </html>
  );
}
