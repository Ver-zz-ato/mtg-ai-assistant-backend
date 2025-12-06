# Code Organization - Future Refactoring Candidates

**Date:** 2025-01-27  
**Status:** Documentation for future improvements

---

## Overview

This document identifies large files that could benefit from refactoring to improve maintainability, testability, and code reusability.

---

## Large Files Identified

### 1. `frontend/components/Chat.tsx` (926 lines)

**Current State:**
- Main chat component with all functionality in one file
- Handles: messaging, streaming, UI state, card previews, voice input

**Refactoring Opportunities:**

#### Extract Custom Hooks:
- `useChatMessages()` - Message state management
- `useChatStreaming()` - Streaming logic
- `useCardPreviews()` - Card image fetching and display
- `useVoiceInput()` - Voice input handling

#### Extract Sub-Components:
- `ChatMessageList` - Message rendering
- `ChatInput` - Input field and send button
- `CardPreviewPanel` - Card preview display
- `ChatHeader` - Chat header with thread info

#### Extract Utilities:
- `chatHelpers.ts` - Message parsing, formatting utilities
- `streamingHelpers.ts` - Streaming response handling

**Benefits:**
- Easier to test individual pieces
- Better code reusability
- Clearer component structure
- Easier to maintain

**Priority:** Medium (works fine as-is, but would improve maintainability)

---

### 2. `frontend/app/collections/cost-to-finish/Client.tsx` (1500+ lines)

**Current State:**
- Large client component handling cost-to-finish calculations
- Includes: CSV parsing, card matching, price fetching, UI rendering

**Refactoring Opportunities:**

#### Extract Custom Hooks:
- `useCostToFinish()` - Main calculation logic
- `useCardMatching()` - Fuzzy matching logic
- `usePriceFetching()` - Price data fetching
- `useCSVParsing()` - CSV file parsing

#### Extract Sub-Components:
- `CostToFinishResults` - Results table rendering
- `CostToFinishControls` - Control panel (filters, exports)
- `CostToFinishUpload` - File upload component
- `CostToFinishSummary` - Summary statistics

#### Extract Utilities:
- `costCalculations.ts` - Price calculation logic
- `csvParsing.ts` - CSV parsing utilities
- `cardMatching.ts` - Card name matching logic

**Benefits:**
- Much easier to test calculation logic
- Reusable components for other features
- Better performance (smaller component re-renders)
- Clearer code organization

**Priority:** High (very large file, would benefit significantly from splitting)

---

## Refactoring Guidelines

### When to Refactor

1. **File exceeds 500-800 lines** - Consider splitting
2. **Multiple responsibilities** - Extract into separate modules
3. **Hard to test** - Break into smaller, testable units
4. **Code duplication** - Extract shared logic
5. **Performance issues** - Split to reduce re-renders

### How to Refactor

1. **Start with utilities** - Extract pure functions first
2. **Extract hooks** - Move stateful logic to custom hooks
3. **Split components** - Break UI into smaller components
4. **Test incrementally** - Test each extracted piece
5. **Refactor gradually** - Don't do everything at once

### Testing Strategy

- Write tests for extracted utilities first
- Test hooks in isolation
- Test components with mocked dependencies
- Ensure integration tests still pass

---

## Other Candidates

### Medium Priority

- `frontend/app/my-decks/[id]/Client.tsx` - Large deck detail page
- `frontend/app/deck/swap-suggestions/Client.tsx` - Swap suggestions UI

### Low Priority

- Most other files are reasonably sized
- Focus on files that are actively being modified frequently

---

## Notes

- These refactorings are **optional** and **deferred**
- Current code works fine - this is for future maintainability
- Prioritize based on:
  - How often the file is modified
  - How many bugs/issues come from the file
  - Team velocity and development needs

---

## Implementation Order (When Ready)

1. Extract utilities from large files (easiest, lowest risk)
2. Extract custom hooks (medium effort, high value)
3. Split components (more effort, but improves structure)
4. Add comprehensive tests (ensures refactoring didn't break anything)

