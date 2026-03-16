'use client';

import Link from 'next/link';
import { useState, useMemo, useEffect } from 'react';
import BlogImage from '@/components/BlogImage';
import { DEFAULT_BLOG_POSTS } from '@/lib/blog-defaults';

export default function BlogPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All Posts');
  const [blogPosts, setBlogPosts] = useState<typeof DEFAULT_BLOG_POSTS>(DEFAULT_BLOG_POSTS);

  useEffect(() => {
    fetch('/api/blog')
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok && Array.isArray(data?.blog?.entries)) {
          const apiEntries = data.blog.entries as typeof DEFAULT_BLOG_POSTS;
          // Merge: use defaults as base, API entries override (never remove defaults)
          const bySlug = new Map(DEFAULT_BLOG_POSTS.map((p) => [p.slug, { ...p }]));
          for (const e of apiEntries) {
            if (e?.slug) {
              // Normalize so required fields exist (API may use different casing)
              const normalized = {
                ...bySlug.get(e.slug),
                ...e,
                slug: e.slug,
                readTime: e.readTime ?? (e as any).read_time ?? '5 min read',
              };
              bySlug.set(e.slug, normalized); // dedupes if DB has same slug twice
            }
          }
          setBlogPosts(Array.from(bySlug.values()));
        }
      })
      .catch(() => {});
  }, []);

  const filteredPosts = useMemo(() => {
    let posts = selectedCategory === 'All Posts'
      ? blogPosts
      : blogPosts.filter(post => post.category === selectedCategory);
    // Sort by date descending (newest first)
    return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedCategory, blogPosts]);

  const categories = ['All Posts', 'Budget Building', 'Strategy', 'Commander', 'Announcement'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            MTG Deck Building Blog
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Tips, strategies, and insights to help you build better Magic: The Gathering decks
          </p>
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-2 justify-center mb-12">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Blog Posts Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {filteredPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-2xl transition-all duration-300 hover:-translate-y-2"
            >
              {/* Hero Image */}
              <div className={`h-48 bg-gradient-to-br ${post.gradient} flex items-center justify-center relative overflow-hidden`}>
                {post.imageUrl ? (
                  <>
                    <BlogImage 
                      src={post.imageUrl} 
                      alt={post.title}
                      className="absolute inset-0 w-full h-full object-cover opacity-90"
                      fallbackToGradient={true}
                      icon={post.icon}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
                    <div className="absolute inset-0 bg-black/20"></div>
                  </>
                ) : (
                  <>
                    <div className="absolute inset-0 bg-black/10"></div>
                    <div className="relative z-10 text-8xl drop-shadow-2xl animate-pulse">{post.icon}</div>
                    <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent"></div>
                  </>
                )}
              </div>

              <div className="p-6">
                {/* Category & Read Time */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    post.category === 'Strategy' 
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                      : post.category === 'Announcement'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  }`}>
                    {post.category}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    • {post.readTime}
                  </span>
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-blue-500 group-hover:to-purple-500 transition-all line-clamp-2">
                  {post.title}
                </h2>

                {/* Excerpt */}
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">
                  {post.excerpt}
                </p>

                {/* Meta */}
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <span className="font-medium">{post.author}</span>
                  <span>{new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>
            </Link>
          ))}

          {/* Coming Soon Cards */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 opacity-60">
            <div className="h-48 bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center">
              <div className="text-6xl">📝</div>
            </div>
            <div className="p-6">
              <span className="text-xs font-semibold text-gray-500">Coming Soon</span>
              <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300 mt-2 mb-3">
                More articles on the way!
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                We're working on more great content about deck building, card analysis, and MTG strategy.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl p-8 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Build Better Decks?
          </h2>
          <p className="text-blue-100 mb-6 max-w-2xl mx-auto">
            Use ManaTap AI's powerful tools to analyze your decks, find budget alternatives, and optimize your card choices.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/mtg-commander-ai-deck-builder"
              className="px-6 py-3 bg-white text-blue-600 rounded-lg font-bold hover:bg-gray-100 transition-colors"
            >
              Free Deck Builder →
            </Link>
            <Link
              href="/my-decks"
              className="px-6 py-3 bg-white/20 backdrop-blur text-white rounded-lg font-bold hover:bg-white/30 transition-colors"
            >
              Start Building
            </Link>
            <Link
              href="/pricing"
              className="px-6 py-3 bg-white/20 backdrop-blur text-white rounded-lg font-bold hover:bg-white/30 transition-colors"
            >
              View Pro Features
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

