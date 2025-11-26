# AI Testing System - Simple Guide 🧪

## What Did We Build? (ELI5)

Imagine your MTG AI assistant is a student taking a test. We built a **testing system** that:

1. **Gives the AI tests** - Like flashcards with questions and expected answers
2. **Checks if the AI passes** - Compares what the AI says vs. what it should say
3. **Finds mistakes** - "You said Sol Ring is banned, but it's not!"
4. **Suggests fixes** - "Add this rule to your prompt: 'Sol Ring is legal in Commander'"
5. **Applies the fixes** - Updates the AI's "textbook" (the prompt) with better rules
6. **Tracks improvements** - Shows you if the AI got better after the fix

## How It Works

### The Flow:
```
1. You run tests → AI answers questions
2. System checks answers → Finds failures
3. Click "Auto-Improve" → System analyzes failures
4. System suggests prompt fixes → You review them
5. You accept fixes → System updates the AI's prompt
6. Run tests again → See if AI improved!
```

## How to Test It

### Step 1: Access the Admin Page
1. Start your dev server: `npm run dev` (in the `frontend/` folder)
2. Go to: `http://localhost:3000/admin/ai-test`
3. Make sure you're logged in as an admin user

### Step 2: Run a Single Test
1. **Select a test case** from the list (e.g., "Chat: Basic ramp question")
2. Click **"Run Test"**
3. See the AI's response and validation results
4. Check if it passed ✅ or failed ❌

### Step 3: Run Batch Tests (Recommended)
1. **Select multiple test cases** (or use all)
2. Click **"Run Batch Tests"**
3. Wait for all tests to complete
4. See a summary: "5 passed, 2 failed"

### Step 4: Auto-Improve
1. After running batch tests, if there are failures:
2. Click **"Auto-Improve"** button
3. System analyzes failures and creates "prompt patches"
4. Review the patches in the "Pending Prompt Patches" section
5. Check the ones you want to apply
6. Choose action: **Append**, **Prepend**, or **Replace**
7. Click **"Apply Selected Patches"**
8. System creates a new prompt version with the fixes

### Step 5: Test Again
1. Run the same batch tests again
2. Compare results - did the pass rate improve?
3. Check the "Eval Runs History" to see improvement over time

## How It Improves Your AI

### Before:
- AI might say "Sol Ring is banned" (wrong!)
- AI might suggest off-color cards
- AI might give inconsistent advice
- **You manually fix prompts** → Tedious and error-prone

### After:
1. **Tests catch mistakes** → "This test failed: AI suggested a banned card"
2. **Auto-Improve analyzes** → "The prompt needs a banlist check rule"
3. **System suggests fix** → "Add: 'Check banned_cards.json before suggesting cards'"
4. **You apply it** → New prompt version created
5. **AI gets smarter** → Next test run, it passes!

### Real Example:

**Test Case:**
- Input: "Suggest ramp for my Jund Commander deck"
- Expected: Should NOT suggest banned cards

**First Run:**
- AI suggests: "Mana Crypt" ❌ (banned in Commander)
- Test fails

**Auto-Improve:**
- Creates patch: "Before suggesting cards, check banned_cards.json"
- You apply it

**Second Run:**
- AI suggests: "Sol Ring, Arcane Signet, Cultivate" ✅ (all legal)
- Test passes!

## Key Features

### 1. Test Case Management
- **Default tests** in `frontend/lib/data/ai_test_cases.json`
- **Custom tests** saved in database
- **Create from failures** - Turn user complaints into tests

### 2. Validation Types
- **Keyword Checks** - Does response contain expected words?
- **LLM Fact-Check** - Another AI judges if the answer is correct
- **Reference Compare** - Checks against real MTG data (Scryfall, banlists)

### 3. Prompt Versioning
- Each improvement creates a new "version"
- Can rollback if a version makes things worse
- Track which version was used for each test

### 4. User Failure Integration
- See real user complaints from `knowledge_gaps` table
- See low ratings from `feedback` table
- Turn them into test cases automatically

## Quick Start Checklist

- [ ] Database tables created (`prompt_versions`, `prompt_patches`, `eval_runs`)
- [ ] Dev server running (`npm run dev`)
- [ ] Logged in as admin
- [ ] Navigate to `/admin/ai-test`
- [ ] Run a single test to verify it works
- [ ] Run batch tests
- [ ] Try Auto-Improve on failures
- [ ] Apply patches and test again

## Tips

1. **Start small** - Run 2-3 tests first to see how it works
2. **Review patches carefully** - Not all suggestions are good
3. **Test after applying** - Always verify improvements worked
4. **Use eval runs** - Track improvement over time
5. **Create tests from real failures** - Best tests come from actual user problems

## Troubleshooting

**"No test cases found"**
- Check `frontend/lib/data/ai_test_cases.json` exists
- Check database `ai_test_cases` table has entries

**"Auto-Improve button not showing"**
- Make sure you ran batch tests first
- Make sure there are failures

**"Tests still failing after applying patches"**
- Check which prompt version is active in `app_config`
- Verify the patches were actually applied
- Check the new prompt version in `prompt_versions` table

**"Can't access /admin/ai-test"**
- Make sure you're logged in
- Check your user ID/email is in `ADMIN_USER_IDS` or `ADMIN_EMAILS` env vars

## What's Next?

1. **Add more test cases** - Cover edge cases you care about
2. **Monitor eval runs** - Track improvement over weeks
3. **Create tests from user feedback** - Real problems = best tests
4. **Iterate** - Run tests → Improve → Test again → Repeat!

---

**Remember:** This is a feedback loop. The more you test and improve, the smarter your AI gets! 🚀





