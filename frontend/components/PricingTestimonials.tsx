'use client';

import React from 'react';

interface Testimonial {
  name: string;
  role: string;
  content: string;
  rating: number;
}

const testimonials: Testimonial[] = [
  {
    name: 'Marcus Chen',
    role: 'Competitive Commander Player',
    content: 'ManaTap AI helped me optimize my deck\'s mana curve and identified key synergies I missed. Went from 2-2 to 4-0 at my LGS. Worth every penny!',
    rating: 5
  },
  {
    name: 'Sarah Martinez',
    role: 'Budget Deck Builder',
    content: 'The budget swap feature is incredible. Saved me over $200 on my Gishath deck without sacrificing power level. The AI suggestions are spot-on.',
    rating: 5
  },
  {
    name: 'James Thompson',
    role: 'EDH Enthusiast',
    content: 'Finally, an AI that actually understands Magic. The deck analysis catches things even experienced players miss. My playgroup is jealous of my optimized lists.',
    rating: 5
  },
  {
    name: 'Emily Rodriguez',
    role: 'Casual Player',
    content: 'I was overwhelmed by deck building until ManaTap. The suggestions are clear, the price tracking is helpful, and it\'s made the game so much more enjoyable.',
    rating: 5
  },
  {
    name: 'David Park',
    role: 'Tournament Player',
    content: 'The probability calculator and hand testing widget are game-changers. I\'ve refined my mulligan decisions and my win rate has noticeably improved.',
    rating: 5
  },
  {
    name: 'Alexandra Foster',
    role: 'Collection Manager',
    content: 'Being able to track my collection, see cost-to-finish, and get personalized recommendations all in one place? This tool pays for itself.',
    rating: 5
  }
];

export default function PricingTestimonials() {
  return (
    <div className="mt-16 bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700">
      <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
        Loved by MTG Players Everywhere
      </h2>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {testimonials.map((testimonial, index) => (
          <div
            key={index}
            className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
          >
            {/* Rating Stars */}
            <div className="flex items-center gap-1 mb-4">
              {Array.from({ length: testimonial.rating }).map((_, i) => (
                <svg
                  key={i}
                  className="w-5 h-5 text-amber-400 fill-current"
                  viewBox="0 0 20 20"
                >
                  <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                </svg>
              ))}
            </div>
            
            {/* Content */}
            <p className="text-gray-700 dark:text-gray-300 mb-4 italic">
              "{testimonial.content}"
            </p>
            
            {/* Author */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="font-semibold text-gray-900 dark:text-white">
                {testimonial.name}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {testimonial.role}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
