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
import PWAProvider from "@/components/PWAProvider";
import FirstVisitTracker from "@/components/FirstVisitTracker";
import TrustFooter from "@/components/TrustFooter";
export const metadata: Metadata = {
  title: "ManaTap AI - MTG Deck Builder & Assistant",
  description: "Your intelligent Magic: The Gathering deck building assistant with AI chat, cost analysis, and budget optimization.",
  keywords: "MTG, Magic The Gathering, deck builder, AI assistant, card prices, budget analysis",
  authors: [{ name: "ManaTap AI" }],
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false, // Prevents zoom on input focus
  },
  themeColor: '#2563eb',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Providers>
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
          <PWAProvider />
          <TrustFooter />
          <SupportWidgets />
        </Providers>
      </body>
    </html>
  );
}
