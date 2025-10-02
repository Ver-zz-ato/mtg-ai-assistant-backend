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
export const metadata: Metadata = {
  title: "ManaTap AI",
  description: "Chat-first MTG assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Providers>
          <AnalyticsProvider />
          <PromoBar />
          <MaintenanceBanner />
          <ErrorBoundary>
            <Header />
            <main className="flex-1">{children}</main>
          </ErrorBoundary>
          <CookieBanner />
          <FeedbackFab />
          <footer className="border-t border-gray-800 py-6 text-sm text-gray-400">
            <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center gap-4 justify-between">
<div>© 2025 ManaTap AI</div>
              <nav className="flex gap-4 items-center flex-wrap">
                {(() => { const FooterLinks = require('@/components/FooterLinks').default; return <FooterLinks />; })()}
              </nav>
            </div>
          </footer>
          <SupportWidgets />
        </Providers>
      </body>
    </html>
  );
}
