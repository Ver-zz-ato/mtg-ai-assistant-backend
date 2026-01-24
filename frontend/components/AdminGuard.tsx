'use client';
import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

interface AdminGuardProps {
  children: React.ReactNode;
}

/**
 * Client-side admin guard component
 * Checks admin status via API and redirects non-admins
 */
export default function AdminGuard({ children }: AdminGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push('/');
      return;
    }

    // Check admin status via API
    (async () => {
      try {
        const res = await fetch('/api/admin/config', { cache: 'no-store' });
        const data = await res.json();
        if (data.ok && data.is_admin) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          router.push('/');
        }
      } catch (err) {
        console.error('Admin check failed:', err);
        setIsAdmin(false);
        router.push('/');
      } finally {
        setChecking(false);
      }
    })();
  }, [user, authLoading, router]);

  if (authLoading || checking || isAdmin === null) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-neutral-400">Checking admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-2">Access Denied</p>
          <p className="text-neutral-400">Admin access required</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
