'use client';

import { track } from '@/lib/analytics/track';
import { useAuth } from '@/lib/auth-context';
import { useProStatus } from '@/hooks/useProStatus';

export default function TestTrackPage() {
  const { user } = useAuth();
  const { isPro } = useProStatus();

  const testClick = async () => {
    console.log('🧪 TEST: Button clicked, calling track()...');
    
    try {
      await track('ui_click', {
        area: 'test',
        action: 'button_click',
        test: true,
      }, {
        userId: user?.id || null,
        isPro: isPro || false,
      });
      
      console.log('🧪 TEST: track() call completed');
    } catch (error) {
      console.error('🧪 TEST: track() threw error:', error);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-4">Click Tracking Test</h1>
        <p className="text-gray-300 mb-6">
          Click the button below and check the console for tracking logs.
        </p>
        
        <button
          onClick={testClick}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold"
        >
          Test Track Event
        </button>

        <div className="mt-8 p-4 bg-gray-800 rounded-lg">
          <h2 className="text-lg font-semibold text-white mb-2">Debug Info:</h2>
          <pre className="text-xs text-gray-300">
            {JSON.stringify({
              user: user?.id || 'no user',
              isPro: isPro || false,
              timestamp: new Date().toISOString(),
            }, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

