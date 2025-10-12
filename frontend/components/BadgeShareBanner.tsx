'use client';

import React, { useRef, useState } from 'react';
import { capture } from '@/lib/ph';

interface BadgeInfo {
  key: string;
  label: string;
  emoji: string;
  desc: string;
  tier?: string;
  pro_at_unlock?: boolean;
}

interface BadgeShareBannerProps {
  badge: BadgeInfo;
  username?: string;
  deckName?: string;
  format?: string;
  onClose: () => void;
}

export default function BadgeShareBanner({ 
  badge, 
  username, 
  deckName, 
  format, 
  onClose 
}: BadgeShareBannerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateBanner = async (): Promise<string> => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('Canvas not available');

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    // Set canvas size (good for social media)
    canvas.width = 800;
    canvas.height = 400;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#1f2937'); // gray-800
    gradient.addColorStop(1, '#111827'); // gray-900
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Pro foil effect if applicable
    if (badge.pro_at_unlock) {
      const foilGradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width / 2
      );
      foilGradient.addColorStop(0, 'rgba(251, 191, 36, 0.1)'); // amber-400 with opacity
      foilGradient.addColorStop(1, 'rgba(251, 191, 36, 0.05)'); // more subtle at edges
      ctx.fillStyle = foilGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Foil border
      ctx.strokeStyle = '#fbbf24'; // amber-400
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    }

    // ManaTap AI branding (top left)
    ctx.fillStyle = '#9ca3af'; // gray-400
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    ctx.fillText('ManaTap AI', 40, 50);

    // Badge emoji (large, centered)
    ctx.font = '120px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    const emojiX = canvas.width / 2;
    const emojiY = 180;
    ctx.fillText(badge.emoji, emojiX, emojiY);

    // Badge title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(badge.label, canvas.width / 2, 240);

    // Badge description
    ctx.fillStyle = '#d1d5db'; // gray-300
    ctx.font = '20px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(badge.desc, canvas.width / 2, 270);

    // Username and context (bottom)
    if (username) {
      ctx.fillStyle = '#10b981'; // emerald-500
      ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Earned by ${username}`, canvas.width / 2, 320);
    }

    // Additional context (deck/format)
    if (deckName || format) {
      ctx.fillStyle = '#6b7280'; // gray-500
      ctx.font = '18px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const contextText = [deckName, format].filter(Boolean).join(' • ');
      ctx.fillText(contextText, canvas.width / 2, 350);
    }

    // Date (bottom right)
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    ctx.fillStyle = '#6b7280'; // gray-500
    ctx.font = '16px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(date, canvas.width - 40, canvas.height - 30);

    return canvas.toDataURL('image/png', 0.9);
  };

  const handleDownloadPNG = async () => {
    try {
      setIsGenerating(true);
      
      const dataURL = await generateBanner();
      
      // Create download link
      const link = document.createElement('a');
      link.download = `manatap-badge-${badge.key}-${username || 'user'}.png`;
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Track event
      try {
        capture('badge_share_action', {
          badge_id: badge.key,
          action: 'download_png'
        });
      } catch (err) {
        console.warn('Failed to capture download PNG event:', err);
      }

    } catch (error) {
      console.error('Error generating PNG:', error);
      alert('Failed to generate PNG. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyImage = async () => {
    try {
      setIsGenerating(true);
      
      const dataURL = await generateBanner();
      
      // Convert data URL to blob
      const response = await fetch(dataURL);
      const blob = await response.blob();
      
      // Copy to clipboard
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob
          })
        ]);
        
        // Show success feedback
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm';
        toast.textContent = 'Badge image copied to clipboard!';
        document.body.appendChild(toast);
        
        setTimeout(() => {
          if (document.body.contains(toast)) {
            document.body.removeChild(toast);
          }
        }, 3000);
      } else {
        throw new Error('Clipboard API not available');
      }

      // Track event
      try {
        capture('badge_share_action', {
          badge_id: badge.key,
          action: 'copy_image'
        });
      } catch (err) {
        console.warn('Failed to capture copy image event:', err);
      }

    } catch (error) {
      console.error('Error copying image:', error);
      alert('Failed to copy image. Your browser may not support this feature. Try downloading instead.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      // Generate shareable link (you might want to implement a dedicated sharing endpoint)
      const shareableLink = `${window.location.origin}/profile/${username}?badge=${badge.key}`;
      
      await navigator.clipboard.writeText(shareableLink);
      
      // Show success feedback
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm';
      toast.textContent = 'Profile link copied to clipboard!';
      document.body.appendChild(toast);
      
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 3000);

      // Track event
      try {
        capture('badge_share_action', {
          badge_id: badge.key,
          action: 'copy_link'
        });
      } catch (err) {
        console.warn('Failed to capture copy link event:', err);
      }

    } catch (error) {
      console.error('Error copying link:', error);
      alert('Failed to copy link to clipboard.');
    }
  };

  return (
    <>
      {/* Modal Backdrop */}
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-neutral-800 rounded-lg max-w-2xl w-full border border-neutral-700 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="p-4 border-b border-neutral-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Share Your Badge</h3>
              <button
                onClick={onClose}
                className="text-neutral-400 hover:text-white text-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-800 rounded"
                aria-label="Close modal"
              >
                ×
              </button>
            </div>
          </div>
          
          {/* Content */}
          <div className="p-4 space-y-6">
            {/* Preview */}
            <div>
              <div className="text-sm font-medium mb-3 text-gray-300">Preview</div>
              <div 
                className={`
                  relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg aspect-[2/1] flex items-center justify-center overflow-hidden
                  ${badge.pro_at_unlock ? 'ring-2 ring-amber-400/50' : ''}
                `}
              >
                {/* Pro foil effect */}
                {badge.pro_at_unlock && (
                  <div className="absolute inset-0 bg-gradient-radial from-amber-400/10 via-transparent to-amber-400/5 pointer-events-none" />
                )}
                
                {/* Content */}
                <div className="relative z-10 text-center px-8">
                  {/* Badge emoji */}
                  <div className="text-6xl mb-4">{badge.emoji}</div>
                  
                  {/* Badge info */}
                  <div className="text-2xl font-bold text-white mb-2">{badge.label}</div>
                  <div className="text-gray-300 text-sm mb-4">{badge.desc}</div>
                  
                  {/* User info */}
                  {username && (
                    <div className="text-emerald-400 font-semibold">Earned by {username}</div>
                  )}
                  {(deckName || format) && (
                    <div className="text-gray-500 text-xs mt-1">
                      {[deckName, format].filter(Boolean).join(' • ')}
                    </div>
                  )}
                </div>

                {/* Branding */}
                <div className="absolute top-4 left-4 text-gray-400 text-sm font-medium">
                  ManaTap AI
                </div>
                
                {/* Date */}
                <div className="absolute bottom-4 right-4 text-gray-500 text-xs">
                  {new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div>
              <div className="text-sm font-medium mb-3 text-gray-300">Share Options</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={handleCopyImage}
                  disabled={isGenerating}
                  className={`
                    px-4 py-3 rounded-lg border text-sm font-medium transition-colors
                    ${isGenerating 
                      ? 'bg-neutral-700 border-neutral-600 text-neutral-500 cursor-not-allowed' 
                      : 'bg-neutral-700 border-neutral-600 text-white hover:bg-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-800'
                    }
                  `}
                >
                  {isGenerating ? 'Generating...' : 'Copy Image'}
                </button>
                
                <button
                  onClick={handleDownloadPNG}
                  disabled={isGenerating}
                  className={`
                    px-4 py-3 rounded-lg border text-sm font-medium transition-colors
                    ${isGenerating 
                      ? 'bg-neutral-700 border-neutral-600 text-neutral-500 cursor-not-allowed' 
                      : 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-800'
                    }
                  `}
                >
                  {isGenerating ? 'Generating...' : 'Download PNG'}
                </button>
                
                <button
                  onClick={handleCopyLink}
                  className="px-4 py-3 bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-800"
                >
                  Copy Profile Link
                </button>
              </div>
            </div>

            {/* Info */}
            <div className="text-xs text-gray-500 bg-neutral-900/50 rounded-lg p-3">
              <p className="mb-1">
                <strong>Tip:</strong> Share your achievement on social media or with friends! 
                {badge.pro_at_unlock && ' Your Pro status adds a special golden foil effect.'}
              </p>
              <p>
                The image includes your username and the date you earned this badge.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden canvas for image generation */}
      <canvas 
        ref={canvasRef} 
        style={{ display: 'none' }} 
        width={800} 
        height={400}
      />
    </>
  );
}