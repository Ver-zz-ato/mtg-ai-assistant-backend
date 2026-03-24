import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Email confirmed · ManaTap',
  description: 'Your email address has been verified.',
};

export default function AuthConfirmedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
