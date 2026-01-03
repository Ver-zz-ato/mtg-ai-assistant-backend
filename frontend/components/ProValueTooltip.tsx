'use client';

import { useState, useEffect, useRef } from 'react';
import { capture } from '@/lib/ph';

interface ProValueTooltipProps {
  trigger: React.ReactNode;
  featureName: string;
  benefits: string[];
  className?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export default function ProValueTooltip({
  trigger,
  featureName,
  benefits,
  className = '',
  placement = 'top',
  delay = 500
}: ProValueTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      // Calculate position
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const tooltipWidth = 320; // w-80 = 20rem = 320px
        const tooltipHeight = 300; // approximate height
        const spacing = 8;
        
        let top = rect.top;
        let left = rect.left;
        
        // Calculate position based on placement preference
        switch (placement) {
          case 'top':
            top = rect.top - tooltipHeight - spacing;
            left = rect.left + rect.width / 2 - tooltipWidth / 2;
            break;
          case 'bottom':
            top = rect.bottom + spacing;
            left = rect.left + rect.width / 2 - tooltipWidth / 2;
            break;
          case 'left':
            top = rect.top + rect.height / 2 - tooltipHeight / 2;
            left = rect.left - tooltipWidth - spacing;
            break;
          case 'right':
            top = rect.top + rect.height / 2 - tooltipHeight / 2;
            left = rect.right + spacing;
            break;
        }
        
        // Ensure tooltip stays within viewport
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (left + tooltipWidth > viewportWidth - 16) {
          left = viewportWidth - tooltipWidth - 16;
        }
        if (left < 16) {
          left = 16;
        }
        if (top + tooltipHeight > viewportHeight - 16) {
          top = viewportHeight - tooltipHeight - 16;
        }
        if (top < 16) {
          top = 16;
        }
        
        setPosition({ top, left });
      }
      
      setShouldShow(true);
      setIsVisible(true);
      
      // Track pro feature awareness
      try {
        capture('pro_feature_awareness', {
          feature_name: featureName,
          interaction_type: 'tooltip_viewed'
        });
      } catch {}
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
    setTimeout(() => setShouldShow(false), 150); // Allow for fade out
  };

  const handleUpgradeClick = () => {
    try {
      capture('pro_feature_cta_clicked', {
        feature_name: featureName,
        source: 'value_tooltip'
      });
    } catch {}
    
    // Navigate to pricing
    window.location.href = '/pricing';
  };

  return (
    <div 
      ref={containerRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {trigger}
      
      {shouldShow && (
        <div 
          ref={tooltipRef}
          className={`
            fixed z-[9999] w-80 p-4 bg-gray-900 text-white rounded-lg shadow-2xl
            transition-all duration-150 ease-out
            ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
          `}
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
        >
          
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-amber-400 rounded-full"></div>
              <h3 className="font-semibold text-sm">Pro Feature: {featureName}</h3>
            </div>
            
            <ul className="space-y-1 text-xs text-gray-200">
              {benefits.map((benefit, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
            
            <div className="pt-2 border-t border-gray-700">
              <button
                onClick={handleUpgradeClick}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium py-2 px-3 rounded text-sm transition-all duration-200"
              >
                Upgrade to Pro
              </button>
              <div className="text-center mt-1">
                <span className="text-xs text-gray-400">£1.99/month or £14.99/year</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}