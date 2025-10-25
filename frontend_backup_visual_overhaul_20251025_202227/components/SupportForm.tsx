'use client';

import { useState, useEffect } from 'react';
import { useProStatus } from '@/hooks/useProStatus';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export default function SupportForm() {
  const { isPro } = useProStatus();
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [userInfo, setUserInfo] = useState<{ email: string; pro: boolean } | null>(null);

  // Fetch user info on mount
  useEffect(() => {
    async function loadUserInfo() {
      const supabase = createBrowserSupabaseClient();
      // Use getSession() instead of getUser() - instant, no network hang
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      
      if (user) {
        console.log('🔍 Support Form - Checking Pro status for user:', user.id);
        
        // Check Pro status from profile table (authoritative source)
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('is_pro')
          .eq('id', user.id)
          .single();
        
        if (profileError) {
          console.error('❌ Support Form - Profile fetch error:', profileError);
        } else {
          console.log('✅ Support Form - Profile data:', profile);
        }
        
        // Check multiple sources for Pro status
        const isProFromProfile = profile?.is_pro === true;
        const isProFromMetadata = user?.user_metadata?.is_pro === true || user?.user_metadata?.pro === true;
        const isProUser = isProFromProfile || isProFromMetadata;
        
        console.log('🎯 Support Form - Pro status:', {
          fromProfile: isProFromProfile,
          fromMetadata: isProFromMetadata,
          final: isProUser
        });
        
        setUserInfo({
          email: user.email || '',
          pro: isProUser
        });
        setEmail(user.email || '');
        
        // Show Pro toast
        if (isProUser) {
          console.log('⭐ Showing Pro toast');
          setShowToast(true);
          setTimeout(() => setShowToast(false), 8000); // Increased to 8 seconds
        }
      } else {
        console.log('❌ Support Form - No user found');
      }
    }
    
    loadUserInfo();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Get browser info
      const browserInfo = {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        screenResolution: `${window.screen.width}x${window.screen.height}`
      };

      // Construct mailto link with all info
      const proEmail = userInfo?.pro ? 'prosupport@manatap.ai' : 'davy@manatap.ai';
      const emailSubject = encodeURIComponent(subject || 'Support Request');
      const emailBody = encodeURIComponent(
        `${message}\n\n` +
        `---\n` +
        `User Info:\n` +
        `Email: ${email}\n` +
        `Pro Status: ${userInfo?.pro ? 'Yes ⭐' : 'No'}\n` +
        `Browser: ${browserInfo.userAgent}\n` +
        `Language: ${browserInfo.language}\n` +
        `Platform: ${browserInfo.platform}\n` +
        `Screen: ${browserInfo.screenResolution}`
      );

      window.location.href = `mailto:${proEmail}?subject=${emailSubject}&body=${emailBody}`;
    } catch (error) {
      console.error('Error opening email:', error);
      alert('Failed to open email client. Please email us directly at ' + 
            (userInfo?.pro ? 'prosupport@manatap.ai' : 'davy@manatap.ai'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Pro Toast */}
      {showToast && userInfo?.pro && (
        <div className="mb-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl p-4 shadow-lg animate-slideDown">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⭐</span>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Pro Priority Support</h3>
              <p className="text-sm text-blue-100">
                As a Pro member, your support requests receive priority handling and we aim to respond within 24 hours.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Contact Support
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Your Email {userInfo?.pro && <span className="text-purple-400 ml-1">⭐ Pro</span>}
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="w-full px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
              placeholder="your@email.com"
            />
          </div>

          {/* Subject */}
          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Subject
            </label>
            <input
              type="text"
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
              placeholder="Brief description of your issue"
            />
          </div>

          {/* Message */}
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Message
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={6}
              className="w-full px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white resize-none"
              placeholder="Please describe your issue or question in detail..."
            />
          </div>

          {/* Info Notice */}
          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
            <span className="font-medium">Note:</span> Your email, Pro status, and browser info will be automatically included to help us assist you better.
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-lg font-semibold transition-all ${
              userInfo?.pro
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white'
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Opening Email...' : userInfo?.pro ? '⭐ Send Priority Support Request' : '📧 Send Support Request'}
          </button>

          {/* Response Time */}
          <p className="text-sm text-center text-gray-500 dark:text-gray-400">
            {userInfo?.pro 
              ? '⚡ Pro Priority: We aim to respond within 24 hours'
              : 'We usually respond within 2 business days'
            }
          </p>
        </form>
      </div>
    </div>
  );
}

