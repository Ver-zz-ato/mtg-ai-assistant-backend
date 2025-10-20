'use client';

import { useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { trackSignupStarted, trackSignupCompleted } from '@/lib/analytics-enhanced';

export default function InlineSignUpForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const supabase = createBrowserSupabaseClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset errors
    setEmailError('');
    setPasswordError('');
    
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    
    // Validate password
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      trackSignupStarted('email', 'inline_form');
      
      const { error } = await supabase.auth.signUp({ 
        email, 
        password 
      });
      
      if (error) {
        setPasswordError(error.message);
        return;
      }
      
      trackSignupCompleted('email');
      setSuccess(true);
      
      // Reload page after a short delay to show success state
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (e: any) {
      setPasswordError(e?.message || 'Sign up failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="bg-gradient-to-r from-emerald-600 to-blue-600 rounded-2xl p-8 text-center text-white">
        <div className="text-5xl mb-4">🎉</div>
        <h3 className="text-2xl font-bold mb-2">Welcome to ManaTap AI!</h3>
        <p className="text-blue-100">Check your email to confirm your account.</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-2xl p-8">
      <h3 className="text-2xl font-bold text-white mb-2 text-center">
        Ready to Get Started?
      </h3>
      <p className="text-blue-100 text-center mb-6">
        Create your free account in seconds
      </p>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError('');
            }}
            placeholder="your@email.com"
            className={`w-full bg-white/10 backdrop-blur text-white border ${
              emailError ? 'border-red-400' : 'border-white/30'
            } rounded-lg px-4 py-3 placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50`}
            autoComplete="email"
            required
          />
          {emailError && (
            <div className="text-xs text-red-200 mt-1">{emailError}</div>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError('');
            }}
            placeholder="Min 8 characters"
            className={`w-full bg-white/10 backdrop-blur text-white border ${
              passwordError ? 'border-red-400' : 'border-white/30'
            } rounded-lg px-4 py-3 placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50`}
            autoComplete="new-password"
            minLength={8}
            required
          />
          {passwordError && (
            <div className="text-xs text-red-200 mt-1">{passwordError}</div>
          )}
          
          {password.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className={`text-xs flex items-center gap-1.5 ${
                password.length >= 8 ? 'text-emerald-200' : 'text-white/60'
              }`}>
                <span>{password.length >= 8 ? '✓' : '○'}</span>
                <span>At least 8 characters</span>
              </div>
            </div>
          )}
        </div>
        
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-white text-blue-600 py-3 px-6 rounded-lg font-bold text-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Creating Account...' : 'Create Free Account'}
        </button>
        
        <p className="text-xs text-center text-white/80">
          By signing up, you agree to our{' '}
          <a href="/terms" className="underline hover:text-white">
            Terms of Service
          </a>
        </p>
      </form>
    </div>
  );
}

