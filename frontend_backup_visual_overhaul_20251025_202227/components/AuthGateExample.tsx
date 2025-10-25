'use client';

/**
 * Example usage of AuthGate component
 * 
 * This file demonstrates how to use the AuthGate component
 * to protect features that require authentication.
 */

import { useState } from 'react';
import AuthGate from './AuthGate';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export default function AuthGateExample() {
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Check auth status
  const checkAuth = async () => {
    const supabase = createBrowserSupabaseClient();
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
    
    if (!data.user) {
      setShowAuthGate(true);
    } else {
      alert('You are logged in! Auth gate not needed.');
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Auth Gate Demo</h2>
      <p className="mb-4 text-gray-600 dark:text-gray-400">
        Click the button below to test the Auth Gate. If you're not logged in,
        you'll see a friendly prompt to sign in.
      </p>
      
      <button
        onClick={checkAuth}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
      >
        Try Protected Feature
      </button>

      {showAuthGate && (
        <AuthGate
          message="Sign in to access deck analysis features"
          onSignIn={() => {
            setShowAuthGate(false);
            // In real usage, this would trigger the sign-in flow
            alert('Sign in triggered! In the real app, this would open the sign-in modal.');
          }}
        />
      )}

      {user && (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <p className="text-green-700 dark:text-green-300">
            ✅ You're logged in as: {user.email}
          </p>
        </div>
      )}
    </div>
  );
}

