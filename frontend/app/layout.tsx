// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Header from "../components/Header";

export const metadata: Metadata = {
  title: "MTG Coach",
  description: "Chat-first MTG assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-gray-950 text-gray-100">
        <Header />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-800 py-6 text-sm text-gray-400">
          <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center gap-4 justify-between">
            <div>© 2025 MTG Coach</div>
            <nav className="flex gap-4">
              <a className="hover:text-gray-200" href="#">About</a>
              <a className="hover:text-gray-200" href="#">Patreon</a>
              <a className="hover:text-gray-200" href="#">Terms</a>
              <a className="hover:text-gray-200" href="#">Privacy</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
