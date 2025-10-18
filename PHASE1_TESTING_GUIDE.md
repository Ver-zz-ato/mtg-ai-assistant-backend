# Phase 1 Testing Guide 🧪

All Phase 1 components are now integrated! Here's where and how to test everything:

---

## 🎯 Quick Test Page

**Visit: `/test-components`**

This dedicated page shows ALL Phase 1 components in one place:
- ✅ Auth Gate demo with trigger button
- ✅ All 3 Coach Bubble variants
- ✅ All 5 Empty State variants
- ✅ Rate Limit messages (full + compact)

**Perfect for quick testing!**

---

## 1. 🔒 Auth Gate

### What it does:
Beautiful toast notification that appears when a user tries to access a protected feature while not logged in.

### Where to test:
1. **Demo page**: Visit `/test-components` and click "Try Protected Feature" button
2. **Real usage**: Auth gate is ready to be integrated into any feature that needs it

### How to integrate (for future features):
```tsx
import AuthGate from '@/components/AuthGate';
import { useAuthGate } from '@/components/AuthGate';

// Method 1: Component
{!user && <AuthGate message="Sign in to analyze decks" />}

// Method 2: Hook
const { showAuthGate } = useAuthGate();
if (!user) showAuthGate("Sign in to use this feature");
```

---

## 2. 🧙‍♂️ Coach Bubbles

### What they do:
Friendly wizard tips that appear once per session, auto-dismiss after 2-3 closes.

### Where to see them:

#### Option A: My Decks Page
1. Navigate to `/my-decks`
2. **If you have decks**: Wait 3 seconds, one of two coach bubbles will appear:
   - "Try the Mulligan simulator on your deck!" (50% chance)
   - "Find budget alternatives for expensive cards" (50% chance)
3. **If no decks**: You'll see the empty state instead

#### Option B: Collections Page
1. Navigate to `/collections`
2. **If you have collections**: Wait 3 seconds
3. Coach bubble appears: "Check out Cost to Finish for your decks!"

#### Option C: Test Page
1. Visit `/test-components`
2. Scroll to "Coach Bubbles" section
3. Manually triggered bubble shows immediately

### Coach bubble locations:
- **Bottom-right corner** of screen
- **Yellow background** with wizard emoji 🧙‍♂️
- **Dismissible** by clicking X or Learn More
- **Session-based**: Only shows once per browser session
- **Auto-dismisses forever** after 2-3 dismissals (stored in localStorage)

---

## 3. 📦 Empty States

### What they do:
Beautiful, actionable screens when there's no data to display.

### Where to test:

#### Option A: Test Page (All at once)
Visit `/test-components` and scroll to "Empty States" section to see all 5:
1. No Decks
2. No Collections
3. No Wishlist Items
4. No Chat History
5. No Cost to Finish

#### Option B: Real Pages

1. **No Decks**: `/my-decks` (only if you have 0 decks)
2. **No Collections**: `/collections` (only if you have 0 collections)
3. **No Wishlist**: `/wishlist` (only if wishlist is empty)
4. **No Chat**: *To be integrated into chat component*
5. **No Cost to Finish**: *To be integrated into Cost to Finish page*

### What empty states include:
- 🎨 Large animated emoji
- 📝 Clear title and description
- 🔘 Primary action button (gradient blue/purple)
- 🔘 Secondary action button (outlined)

---

## 4. ⏳ Rate Limit Messages

### What they do:
Friendly countdown messages when users hit API rate limits, with helpful suggestions.

### Where to test:

#### Option A: Test Page
Visit `/test-components` and scroll to "Rate Limit Messages" section to see:
1. **Full message** - Shows 60-second countdown with suggestions
2. **Compact banner** - Shows 5-minute countdown inline

#### Option B: Real Usage
Rate limit messages will appear automatically when:
- AI analysis is called too frequently
- Budget swaps are requested rapidly
- Any API endpoint returns a 429 status

### Features:
- ⏱️ Live countdown timer
- 💡 Suggestions for what to do while waiting
- 💎 Pro upgrade hint
- ✅ "Ready to try again!" message when timer ends

---

## 5. 📚 Blog & Help Menu

### Blog:
1. **Blog listing**: Visit `/blog`
   - First article: "Building Budget EDH: 5 Hidden Gems Under $1"
   - Coming soon placeholders
   - Category filters (UI ready, filtering to be implemented)
2. **Read article**: Click on the article card
3. **Navigation**: Click "Blog" in top navigation bar

### Help Menu:
1. Look for **"Help"** dropdown in top navigation bar (next to Blog)
2. Click it to see:
   - What is ManaTap?
   - How pricing works
   - Rules & Legality
   - Contact Support
3. Click outside to close, or click any link

---

## 🎯 Summary: Where Everything Is

| Component | Test Page | Real Integration |
|-----------|-----------|------------------|
| Auth Gate | `/test-components` | Ready for integration |
| Coach Bubbles | `/test-components` | `/my-decks`, `/collections` |
| Empty States | `/test-components` | `/my-decks`, `/collections` |
| Rate Limits | `/test-components` | Ready for API integration |
| Blog | `/blog` | Header navigation |
| Help Menu | Header dropdown | Header navigation |

---

## 🚀 Next Steps After Testing

Once you've tested everything, we can move to **Phase 2**:
1. Sample Commander Deck button
2. First-run micro tour
3. Undo toasts for destructive actions
4. Contextual tips system
5. More blog posts

---

## 💡 Pro Tips

1. **Coach bubbles won't appear if you dismissed them 3 times** - Clear localStorage to reset:
   - Open DevTools → Application → Local Storage → Clear
   
2. **Empty states only show when data is empty** - You may need to delete test data

3. **Best test flow**:
   - Start at `/test-components` to see everything
   - Then visit `/my-decks` and `/collections` to see real integration
   - Check blog at `/blog`
   - Try help menu in header

4. **Coach bubbles timing**:
   - My Decks: 2 seconds after page load (if you have decks)
   - Collections: 3 seconds after page load (if you have collections)
   - Test page: Immediate

---

**Happy Testing! 🎉**

