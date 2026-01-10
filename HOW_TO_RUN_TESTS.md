# How to Run Tests - Simple Guide

## 📍 Where to Run Tests

**Location**: Open your terminal in the `frontend` folder

```
cd frontend
```

---

## 🚀 Commands to Run Tests

### 1. **Run ALL E2E Tests** (The new ones we just created)
```bash
cd frontend
npm run test:e2e
```
This runs:
- ✅ Share tests (`share.spec.ts`)
- ✅ Quick Add tests (`quick-add.spec.ts`)  
- ✅ Deck Analysis tests (`deck-analysis.spec.ts`)
- ✅ All other E2E tests

**Time**: ~2-5 minutes (it opens a browser and clicks through everything)

---

### 2. **Run Just ONE Test File**

Run only the new Share tests:
```bash
cd frontend
npx playwright test tests/e2e/share.spec.ts
```

Run only the Quick Add tests:
```bash
cd frontend
npx playwright test tests/e2e/quick-add.spec.ts
```

Run only the Deck Analysis tests:
```bash
cd frontend
npx playwright test tests/e2e/deck-analysis.spec.ts
```

---

### 3. **Run Tests in Watch Mode** (See them run in browser)
```bash
cd frontend
npx playwright test --ui
```
This opens a nice GUI where you can:
- See tests running in real-time
- Watch the browser click through things
- See which tests pass/fail
- Re-run failed tests

---

### 4. **Run Tests Headed** (See the browser)
```bash
cd frontend
npx playwright test --headed
```
By default, tests run "headless" (no browser window). This flag shows the browser so you can watch what's happening.

---

### 5. **Run Just the New Tests We Created**
```bash
cd frontend
npx playwright test tests/e2e/share.spec.ts tests/e2e/quick-add.spec.ts tests/e2e/deck-analysis.spec.ts
```

---

## 🔧 Setup (First Time Only)

If you haven't installed Playwright browsers yet:

```bash
cd frontend
npx playwright install
```

This downloads Chrome, Firefox, and Safari browsers for testing.

---

## 📊 What You'll See

When you run tests, you'll see output like:

```
Running 3 tests using 1 worker

✓ tests/e2e/share.spec.ts:3:5 › Share Functionality › deck share button copies link to clipboard (2.3s)
✓ tests/e2e/share.spec.ts:36:3 › Share Functionality › wishlist share makes wishlist public (1.8s)
✓ tests/e2e/quick-add.spec.ts:4:5 › Quick Add Feature › quick add card to deck from deck page (3.1s)

3 passed (7.2s)
```

If a test fails, you'll see:
- Screenshot of what went wrong
- Video of the test run
- Error message

All saved in: `frontend/test-results/`

---

## ⚡ Quick Commands Cheat Sheet

```bash
# Run all tests
npm run test:e2e

# Run just new tests
npx playwright test tests/e2e/share.spec.ts tests/e2e/quick-add.spec.ts tests/e2e/deck-analysis.spec.ts

# Run with UI (recommended for first time)
npx playwright test --ui

# Run and watch browser
npx playwright test --headed

# Run specific test
npx playwright test tests/e2e/share.spec.ts
```

---

## 🎯 Recommended: First Time Running Tests

**Start with the UI mode** so you can see what's happening:

```bash
cd frontend
npx playwright test --ui
```

Then click on any test to watch it run!
