'use client';
import { PrefsProvider } from '@/components/PrefsContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <PrefsProvider>{children}</PrefsProvider>;
}