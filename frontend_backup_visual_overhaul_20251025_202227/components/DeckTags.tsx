'use client';

import React, { useState } from 'react';
import { PREDEFINED_TAGS, TAG_CATEGORIES, validateTag, getTagByLabel, type TagDefinition } from '@/lib/predefined-tags';

/**
 * TagPills - Display deck tags as colored pills
 */
interface TagPillsProps {
  tags: string[]; // Array of tag labels
  onRemove?: (tag: string) => void;
  maxDisplay?: number; // Max tags to show before "+N more"
}

export function TagPills({ tags, onRemove, maxDisplay = 3 }: TagPillsProps) {
  if (tags.length === 0) return null;

  const visibleTags = maxDisplay ? tags.slice(0, maxDisplay) : tags;
  const hiddenCount = tags.length - visibleTags.length;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {visibleTags.map((tag) => {
        const def = getTagByLabel(tag);
        const bgColor = def?.bgColor || 'bg-neutral-800';
        const textColor = def?.color || 'text-gray-300';

        return (
          <span
            key={tag}
            className={`${bgColor} ${textColor} px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1`}
          >
            {tag}
            {onRemove && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemove(tag);
                }}
                className="hover:opacity-70 transition-opacity"
                aria-label={`Remove ${tag} tag`}
              >
                ×
              </button>
            )}
          </span>
        );
      })}
      {hiddenCount > 0 && (
        <span className="text-xs text-gray-500">+{hiddenCount} more</span>
      )}
    </div>
  );
}

/**
 * TagSelector - Modal for selecting/adding deck tags
 */
interface TagSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  currentTags: string[];
  onSave: (tags: string[]) => void;
}

export function TagSelector({ isOpen, onClose, currentTags, onSave }: TagSelectorProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>(currentTags);
  const [customTag, setCustomTag] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('strategy');

  if (!isOpen) return null;

  const toggleTag = (tagLabel: string) => {
    if (selectedTags.includes(tagLabel)) {
      setSelectedTags(selectedTags.filter(t => t !== tagLabel));
    } else {
      if (selectedTags.length >= 5) {
        setError('Maximum 5 tags per deck');
        setTimeout(() => setError(null), 3000);
        return;
      }
      setSelectedTags([...selectedTags, tagLabel]);
    }
  };

  const addCustomTag = () => {
    const validation = validateTag(customTag);
    
    if (!validation.valid) {
      setError(validation.error || 'Invalid tag');
      setTimeout(() => setError(null), 3000);
      return;
    }

    const sanitized = validation.sanitized!;
    
    if (selectedTags.includes(sanitized)) {
      setError('Tag already added');
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (selectedTags.length >= 5) {
      setError('Maximum 5 tags per deck');
      setTimeout(() => setError(null), 3000);
      return;
    }

    setSelectedTags([...selectedTags, sanitized]);
    setCustomTag('');
    setError(null);
  };

  const handleSave = () => {
    onSave(selectedTags);
    onClose();
  };

  const categoryTags = PREDEFINED_TAGS.filter(t => t.category === activeCategory);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Deck Tags</h2>
            <p className="text-sm text-gray-400 mt-1">Select up to 5 tags to organize your deck</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Selected Tags */}
          {selectedTags.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Selected ({selectedTags.length}/5)
              </label>
              <TagPills tags={selectedTags} onRemove={(tag) => setSelectedTags(selectedTags.filter(t => t !== tag))} maxDisplay={10} />
            </div>
          )}

          {/* Category Tabs */}
          <div>
            <div className="flex gap-2 border-b border-neutral-800 mb-4">
              {TAG_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    activeCategory === cat.id
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <span className="mr-1">{cat.emoji}</span>
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Tag Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categoryTags.map((tag) => {
                const isSelected = selectedTags.includes(tag.label);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.label)}
                    className={`px-3 py-2 rounded-lg border transition-all text-sm font-medium ${
                      isSelected
                        ? `${tag.bgColor} ${tag.color} border-${tag.color.replace('text-', '')}`
                        : 'bg-neutral-950 border-neutral-700 text-gray-300 hover:border-neutral-600'
                    }`}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Tag Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Custom Tag (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
                placeholder="Enter custom tag..."
                maxLength={30}
                className="flex-1 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addCustomTag}
                disabled={!customTag.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                Add
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Max 30 characters. Profanity filtered.</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-neutral-900 border-t border-neutral-800 p-6 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-neutral-700 text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
          >
            Save Tags
          </button>
        </div>
      </div>
    </div>
  );
}


