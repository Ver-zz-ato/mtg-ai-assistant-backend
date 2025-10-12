'use client';

import React, { useState, useEffect } from 'react';
import { capture } from '@/lib/ph';

interface PrivacyDataToggleProps {
  className?: string;
}

export default function PrivacyDataToggle({ className = '' }: PrivacyDataToggleProps) {
  const [dataShareEnabled, setDataShareEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [showLearnMore, setShowLearnMore] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadPrivacySettings();
  }, []);

  const loadPrivacySettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/profile/privacy');
      const data = await response.json();
      
      if (data.ok) {
        setDataShareEnabled(data.data_share_enabled);
      } else {
        setError(data.error || 'Failed to load privacy settings');
      }
    } catch (err) {
      setError('Failed to load privacy settings');
      console.error('Privacy settings load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (newValue: boolean) => {
    try {
      setSaving(true);
      setError('');
      
      const response = await fetch('/api/profile/privacy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data_share_enabled: newValue
        })
      });

      const data = await response.json();
      
      if (data.ok) {
        setDataShareEnabled(data.data_share_enabled);
        
        // Show toast confirmation
        showToast('Preference saved.');
      } else {
        setError(data.error || 'Failed to save privacy setting');
      }
    } catch (err) {
      setError('Failed to save privacy setting');
      console.error('Privacy toggle error:', err);
    } finally {
      setSaving(false);
    }
  };

  const showToast = (message: string) => {
    // Simple toast implementation - you might want to replace with your app's toast system
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 3000);
  };

  const openLearnMore = () => {
    setShowLearnMore(true);
    try {
      capture('privacy_learn_more_opened');
    } catch (err) {
      console.warn('Failed to capture learn more event:', err);
    }
  };

  const closeLearnMore = () => {
    setShowLearnMore(false);
  };

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-6 bg-neutral-700 rounded w-3/4"></div>
        <div className="h-4 bg-neutral-700 rounded w-full mt-2"></div>
      </div>
    );
  }

  return (
    <>
      <div className={`space-y-3 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <label 
                htmlFor="data-share-toggle"
                className="text-sm font-medium cursor-pointer"
              >
                Help improve ManaTap with anonymized data
              </label>
              <button
                onClick={openLearnMore}
                className="text-blue-400 hover:text-blue-300 text-xs underline decoration-dotted focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 rounded"
                aria-label="Learn more about data sharing"
              >
                Learn more
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Allow your deck and collection activity to contribute to aggregate stats and AI accuracy. 
              Your private content remains private.
            </p>
          </div>
          <div className="ml-4">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                id="data-share-toggle"
                type="checkbox"
                className="sr-only"
                checked={dataShareEnabled}
                disabled={saving}
                onChange={(e) => handleToggle(e.target.checked)}
              />
              <div className={`
                w-11 h-6 rounded-full transition-colors duration-200 ease-in-out
                ${dataShareEnabled 
                  ? 'bg-emerald-600' 
                  : 'bg-neutral-600'
                }
                ${saving ? 'opacity-50' : ''}
              `}>
                <div className={`
                  w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ease-in-out
                  ${dataShareEnabled ? 'translate-x-5' : 'translate-x-0.5'}
                  mt-0.5
                `} />
              </div>
            </label>
          </div>
        </div>
        
        {error && (
          <div className="text-red-400 text-xs bg-red-900/20 border border-red-800 rounded px-2 py-1">
            {error}
          </div>
        )}
      </div>

      {/* Learn More Modal */}
      {showLearnMore && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 rounded-lg max-w-lg w-full border border-neutral-700">
            <div className="p-4 border-b border-neutral-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Data Sharing & Privacy</h3>
                <button
                  onClick={closeLearnMore}
                  className="text-neutral-400 hover:text-white text-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-800 rounded"
                  aria-label="Close modal"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="p-4 space-y-4 text-sm">
              <div>
                <h4 className="font-medium text-emerald-400 mb-2">What we collect when enabled:</h4>
                <ul className="space-y-1 text-gray-300 text-xs ml-4">
                  <li>• Anonymized deck composition and card usage patterns</li>
                  <li>• Collection inventory for meta-analysis (card names/quantities only)</li>
                  <li>• Format preferences and deck performance metrics</li>
                  <li>• Aggregated user interaction patterns with our AI</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium text-blue-400 mb-2">What we never collect:</h4>
                <ul className="space-y-1 text-gray-300 text-xs ml-4">
                  <li>• Personal information (email, username, real name)</li>
                  <li>• Private deck names or descriptions you haven't shared</li>
                  <li>• Individual chat conversations or messages</li>
                  <li>• Financial or payment information</li>
                  <li>• Location or device information</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium text-purple-400 mb-2">How this helps:</h4>
                <ul className="space-y-1 text-gray-300 text-xs ml-4">
                  <li>• Improve AI deck suggestions and card recommendations</li>
                  <li>• Provide better meta-game insights and trends</li>
                  <li>• Enhance our database of card synergies and combos</li>
                  <li>• Develop new features based on actual usage patterns</li>
                </ul>
              </div>
              
              <div className="bg-neutral-900 rounded p-3 text-xs text-gray-400">
                <strong>Essential telemetry continues:</strong> We still collect anonymous error logs, 
                uptime metrics, and stability data to keep ManaTap running smoothly. This setting only 
                affects optional data used for product improvements and AI training.
              </div>
            </div>
            
            <div className="p-4 border-t border-neutral-700 text-right">
              <button
                onClick={closeLearnMore}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-800"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}