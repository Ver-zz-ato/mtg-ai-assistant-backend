'use client';

import { useState } from 'react';
import { capture } from '@/lib/ph';

interface ShareButtonProps {
  url: string;
  title?: string;
  description?: string;
  className?: string;
  type?: 'deck' | 'profile' | 'collection';
  isPublic?: boolean;
  onMakePublic?: () => void;
  compact?: boolean;
}

export default function ShareButton({ 
  url, 
  title = 'Check this out!', 
  description = '',
  className = '',
  type = 'deck',
  isPublic = true,
  onMakePublic,
  compact = false
}: ShareButtonProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [copiedRecently, setCopiedRecently] = useState(false);

  const handleCopy = async () => {
    try {
      if (!isPublic && onMakePublic) {
        const makePublic = confirm(`This ${type} is private. Make it public to generate a shareable link?`);
        if (makePublic) {
          onMakePublic();
          return;
        }
        return;
      }

      await navigator.clipboard.writeText(url);
      setCopiedRecently(true);
      
      // Track the share
      try {
        capture('content_shared', {
          content_type: type,
          share_method: 'copy_link',
          content_url: url
        });
      } catch {}

      // Show success feedback
      try {
        const { toast } = await import('@/lib/toast-client');
        toast('Link copied to clipboard!', 'success');
      } catch {}

      setTimeout(() => setCopiedRecently(false), 2000);
      setShowOptions(false);
    } catch (error) {
      console.error('Failed to copy:', error);
      try {
        const { toastError } = await import('@/lib/toast-client');
        toastError('Failed to copy link');
      } catch {
        alert('Could not copy link');
      }
    }
  };

  const handleNativeShare = async () => {
    try {
      if ('share' in navigator) {
        await (navigator as any).share({
          title,
          text: description,
          url
        });

        // Track native share
        try {
          capture('content_shared', {
            content_type: type,
            share_method: 'native_share',
            content_url: url
          });
        } catch {}
      }
    } catch (error) {
      // User cancelled or share failed, fall back to copy
      handleCopy();
    }
    setShowOptions(false);
  };

  const handleExternalShare = (platform: string) => {
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);
    const encodedDesc = encodeURIComponent(description);

    const platforms = {
      twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      reddit: `https://reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
      discord: '', // Discord doesn't have a direct share URL, will copy instead
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    };

    // Track external share attempt
    try {
      capture('content_shared', {
        content_type: type,
        share_method: platform,
        content_url: url
      });
    } catch {}

    if (platform === 'discord') {
      // For Discord, copy a formatted message
      const discordMessage = `${title}\n${url}${description ? '\n' + description : ''}`;
      navigator.clipboard.writeText(discordMessage).then(() => {
        try {
          import('@/lib/toast-client').then(({ toast }) => {
            toast('Discord message copied! Paste it in your server.', 'success');
          });
        } catch {}
      });
    } else {
      window.open(platforms[platform as keyof typeof platforms], '_blank', 'width=600,height=400');
    }
    setShowOptions(false);
  };

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1 ${copiedRecently ? 'text-green-400' : ''} ${className}`}
        >
          {copiedRecently ? (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
              Share
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowOptions(!showOptions)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium transition-colors ${className}`}
      >
        {copiedRecently ? (
          <>
            <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
            </svg>
            Share {type}
          </>
        )}
      </button>

      {showOptions && (
        <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-48">
          <div className="p-2">
            <div className="text-xs text-gray-600 mb-2 px-2">Share this {type}:</div>
            
            <button
              onClick={handleCopy}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              Copy link
            </button>

            {'share' in navigator && (
              <button
                onClick={handleNativeShare}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Share via device
              </button>
            )}

            <hr className="my-2" />
            
            <button
              onClick={() => handleExternalShare('discord')}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
            >
              <div className="w-4 h-4 bg-indigo-600 rounded"></div>
              Copy for Discord
            </button>

            <button
              onClick={() => handleExternalShare('reddit')}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
            >
              <div className="w-4 h-4 bg-orange-600 rounded"></div>
              Post to Reddit
            </button>

            <button
              onClick={() => handleExternalShare('twitter')}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
            >
              <div className="w-4 h-4 bg-blue-400 rounded"></div>
              Share on Twitter
            </button>
          </div>
        </div>
      )}

      {showOptions && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowOptions(false)}
        />
      )}
    </div>
  );
}