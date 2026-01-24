import { NOINDEX } from "@/lib/noindex";
import type { Metadata } from "next";
import AdminGuard from "@/components/AdminGuard";

export const metadata: Metadata = NOINDEX;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}