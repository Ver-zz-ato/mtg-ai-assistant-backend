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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
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

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-gray-900 border-b-0',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-gray-900 border-t-0',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-gray-900 border-r-0',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-gray-900 border-l-0'
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
          className={`
            absolute z-50 w-80 p-4 bg-gray-900 text-white rounded-lg shadow-lg
            transition-all duration-150 ease-out
            ${positionClasses[placement]}
            ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
          `}
        >
          {/* Arrow */}
          <div 
            className={`absolute w-0 h-0 border-4 ${arrowClasses[placement]}`}
          />
          
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
                <span className="text-xs text-gray-400">Starting at $9/month</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}