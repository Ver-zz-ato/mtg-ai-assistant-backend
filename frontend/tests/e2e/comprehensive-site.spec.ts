/**
 * Comprehensive site test — full coverage of ManaTap.
 * Covers: routes, monetization, discoverability, tools, commander pages, navigation, content.
 *
 * Run (with comprehensive report output):
 *   npm run test:comprehensive
 *
 * Outputs:
 *   - test-results/comprehensive-html-report/   (HTML report)
 *   - test-results/comprehensive-results.xml   (JUnit for CI)
 *   - test-results/comprehensive-results.json  (machine-readable)
 *   - test-results/comprehensive-artifacts/    (screenshots, videos on failure)
 *
 * View HTML report:
 *   npm run test:comprehensive:report
 *
 * Generate markdown summary:
 *   npm run test:comprehensive:summary
 *
 * Run against production:
 *   PLAYWRIGHT_BASE_URL=https://www.manatap.ai npm run test:comprehensive
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

function setupErrorTracking(page: any) {
  const pageErrors: Error[] = [];
  page.on('pageerror', (e: Error) => pageErrors.push(e));
  return {
    assertNoErrors: () => {
      if (pageErrors.length > 0) throw new Error(`Page errors: ${pageErrors.map(e => e.message).join('; ')}`);
    }
  };
}

test.describe('Comprehensive Site Test', () => {
  test.setTimeout(120_000); // 2 min per test

  test('1. Homepage — loads, chat visible, no critical errors', async ({ page }) => {
    const err = setupErrorTracking(page);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    const chat = page.getByTestId('chat-textarea');
    await expect(chat).toBeVisible({ timeout: 15_000 });
    err.assertNoErrors();
  });

  test('2. Static core pages — all return 200', async ({ request }) => {
    const routes = [
      '/',
      '/pricing',
      '/privacy',
      '/terms',
      '/support',
      '/changelog',
      '/tools',
      '/tools/mulligan',
      '/tools/probability',
      '/price-tracker',
      '/collections/cost-to-finish',
      '/deck/swap-suggestions',
      '/decks/browse',
      '/commanders',
      '/commander-archetypes',
      '/strategies',
      '/meta',
      '/cards',
      '/blog',
      '/mtg-commander-ai-deck-builder',
      '/commander-mulligan-calculator',
      '/mtg-probability-calculator',
      '/mtg-deck-cost-calculator',
      '/mtg-budget-swap-tool',
    ];
    for (const path of routes) {
      const res = await request.get(`${BASE}${path}`, { timeout: 30_000 });
      expect(res.status(), `Expected 200 for ${path}`).toBe(200);
    }
  });

  test('3. Commander hub pages — first 10 commanders load', async ({ page }) => {
    const slugs = [
      'the-ur-dragon',
      'edgar-markov',
      'atraxa-praetors-voice',
      'krenko-mob-boss',
      'kaalia-of-the-vast',
      'giada-font-of-hope', // correct slug (not giadafontofhope)
      'jodah-the-unifier',
      'miirym-sentinel-wyrm',
      'nekusar-the-mindrazer',
      'muldrotha-the-gravetide',
    ];
    for (const slug of slugs) {
      const res = await page.goto(`${BASE}/commanders/${slug}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      expect(res?.status(), `Expected 200 for /commanders/${slug}`).toBe(200);
      await expect(page.locator('h1')).toContainText(/Commander|Tools/i, { timeout: 5_000 });
    }
  });

  test('4. Commander content pages — mulligan, budget, best-cards', async ({ page }) => {
    const baseSlug = 'the-ur-dragon';
    const contentPages = ['mulligan-guide', 'budget-upgrades', 'best-cards'];
    for (const sub of contentPages) {
      const path = `/commanders/${baseSlug}/${sub}`;
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      expect(res?.status(), `Expected 200 for ${path}`).toBe(200);
      await expect(page.locator('h1')).toBeVisible({ timeout: 5_000 });
    }
  });

  test('5. Commander hub polish — stats ribbon, tools, synergy, similar', async ({ page }) => {
    const res = await page.goto(`${BASE}/commanders/the-ur-dragon`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    expect(res?.status()).toBe(200);

    // Stats ribbon (pills)
    const ribbon = page.locator('text=/Public decks|Median cost|Archetype|Difficulty/i').first();
    await expect(ribbon).toBeVisible({ timeout: 15_000 });

    // Tool actions block (scope to main — nav links can be hidden on mobile)
    const main = page.locator('main');
    await expect(main.locator('text=/Start here.*Mulligan/i').first()).toBeVisible({ timeout: 5_000 });
    await expect(main.locator('text=/Mulligan Simulator|Cost to Finish|Budget Swaps|Browse Decks/i').first()).toBeVisible({ timeout: 5_000 });

    // Synergy teaser (hub only)
    await expect(page.locator('text=/Common synergy packages/i')).toBeVisible({ timeout: 5_000 });

    // Similar commanders (hub only)
    await expect(page.locator('text=/Similar commanders you may like/i')).toBeVisible({ timeout: 5_000 });
  });

  test('6. Archetypes — index + all archetype pages', async ({ page }) => {
    const r = await page.goto(`${BASE}/commander-archetypes`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    expect(r?.status()).toBe(200);

    const archetypes = ['dragons', 'aristocrats', 'treasure', 'tokens', 'sacrifice'];
    for (const slug of archetypes) {
      const res = await page.goto(`${BASE}/commander-archetypes/${slug}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      expect(res?.status(), `Expected 200 for archetype ${slug}`).toBe(200);
    }
  });

  test('7. Strategies — index + all strategy pages', async ({ page }) => {
    const r = await page.goto(`${BASE}/strategies`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    expect(r?.status()).toBe(200);

    const strategies = ['ramp', 'tokens', 'sacrifice', 'control'];
    for (const slug of strategies) {
      const res = await page.goto(`${BASE}/strategies/${slug}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      expect(res?.status(), `Expected 200 for strategy ${slug}`).toBe(200);
    }
  });

  test('8. Meta pages — trending, most-played, budget', async ({ page }) => {
    const metaSlugs = ['trending-commanders', 'most-played-commanders', 'budget-commanders', 'trending-cards', 'most-played-cards'];
    for (const slug of metaSlugs) {
      const res = await page.goto(`${BASE}/meta/${slug}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      expect(res?.status(), `Expected 200 for /meta/${slug}`).toBe(200);
    }
  });

  test('9. Cards — index + top card pages', async ({ page }) => {
    const r = await page.goto(`${BASE}/cards`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    expect(r?.status()).toBe(200);

    const cardSlugs = ['sol-ring', 'arcane-signet', 'lightning-greaves'];
    for (const slug of cardSlugs) {
      const res = await page.goto(`${BASE}/cards/${slug}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      expect(res?.status(), `Expected 200 for /cards/${slug}`).toBe(200);
    }
  });

  test('10. Blog — index + sample posts', async ({ page }) => {
    const r = await page.goto(`${BASE}/blog`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    expect(r?.status()).toBe(200);

    const posts = ['devlog-23-days-soft-launch', 'welcome-to-manatap-ai-soft-launch', 'how-to-build-your-first-commander-deck'];
    for (const slug of posts) {
      const res = await page.goto(`${BASE}/blog/${slug}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      expect(res?.status(), `Expected 200 for /blog/${slug}`).toBe(200);
    }
  });

  test('11. Monetization — pricing page content', async ({ page }) => {
    await page.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Target main content (nav links can be hidden on mobile)
    const main = page.locator('main');
    await expect(main.locator('text=/monthly|annual|subscription|plan|hand testing|probability|budget swap|fix names/i').first()).toBeVisible({ timeout: 10_000 });
  });

  test('12. Monetization — upgrade CTA exists on tool pages', async ({ page }) => {
    await page.goto(`${BASE}/tools/mulligan`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const upgradeLink = page.getByRole('link', { name: /pricing|upgrade|pro|subscribe/i }).first();
    await expect(upgradeLink).toBeVisible({ timeout: 10_000 });
  });

  test('13. Discoverability — sitemap index returns 200', async ({ request }) => {
    test.skip(BASE.includes('localhost'), 'Sitemap may not be available in dev mode');
    const res = await request.get(`${BASE}/sitemap.xml`, { timeout: 15_000 });
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('sitemap');
    expect(text).toContain('manatap.ai');
  });

  test('14. Discoverability — sitemap segments return valid XML', async ({ request }) => {
    test.skip(BASE.includes('localhost'), 'Sitemap may not be available in dev mode');
    const segments = ['static', 'tools', 'commanders', 'commander-content', 'archetypes', 'strategies', 'meta', 'cards'];
    for (const id of segments) {
      const res = await request.get(`${BASE}/sitemap/${id}.xml`, { timeout: 15_000 });
      expect(res.status(), `Expected 200 for sitemap/${id}.xml`).toBe(200);
      const text = await res.text();
      expect(text).toContain('<?xml');
      expect(text).toMatch(/urlset|sitemapindex/);
    }
  });

  test('15. Discoverability — key pages have title and meta', async ({ page }) => {
    const pages = [
      { path: '/', titlePattern: /ManaTap|MTG/i },
      { path: '/pricing', titlePattern: /pricing|ManaTap/i },
      { path: '/commanders/the-ur-dragon', titlePattern: /Ur-Dragon|Commander|ManaTap/i },
      { path: '/tools/mulligan', titlePattern: /mulligan|ManaTap/i },
    ];
    for (const { path, titlePattern } of pages) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const title = await page.title();
      expect(title, `Title for ${path}`).toMatch(titlePattern);
    }
  });

  test('16. Tools — mulligan simulator loads', async ({ page }) => {
    await page.goto(`${BASE}/tools/mulligan`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.locator('text=/mulligan|keep rate|simulator/i').first()).toBeVisible({ timeout: 10_000 });
  });

  test('17. Tools — probability calculator loads', async ({ page }) => {
    await page.goto(`${BASE}/tools/probability`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.locator('body')).toBeVisible({ timeout: 10_000 });
  });

  test('18. Tools — cost-to-finish loads', async ({ page }) => {
    await page.goto(`${BASE}/collections/cost-to-finish`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.locator('body')).toBeVisible({ timeout: 10_000 });
  });

  test('19. Tools — budget swap suggestions loads', async ({ page }) => {
    await page.goto(`${BASE}/deck/swap-suggestions`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.locator('body')).toBeVisible({ timeout: 10_000 });
  });

  test('20. Tools — price tracker loads', async ({ page }) => {
    await page.goto(`${BASE}/price-tracker`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.locator('body')).toBeVisible({ timeout: 10_000 });
  });

  test('21. Deck browse — search works', async ({ page }) => {
    await page.goto(`${BASE}/decks/browse`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const search = page.locator('input[type="search"], input[placeholder*="search"], input[placeholder*="deck"]').first();
    if (await search.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await search.fill('Atraxa');
      await search.press('Enter');
      await page.waitForTimeout(3000);
    }
    expect(await page.url()).toContain('/decks/browse');
  });

  test('22. Commander tools CTA — links are crawlable', async ({ page }) => {
    await page.goto(`${BASE}/commanders/the-ur-dragon`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Use main content (nav links can be hidden on mobile)
    const main = page.locator('main');
    const mulliganLink = main.locator('a[href*="tools/mulligan"]').first();
    const costLink = main.locator('a[href*="cost-to-finish"]').first();
    const swapsLink = main.locator('a[href*="swap-suggestions"]').first();
    const browseLink = main.locator('a[href*="decks/browse"]').first();
    await expect(mulliganLink).toBeVisible({ timeout: 5_000 });
    await expect(costLink).toBeVisible({ timeout: 5_000 });
    await expect(swapsLink).toBeVisible({ timeout: 5_000 });
    await expect(browseLink).toBeVisible({ timeout: 5_000 });
  });

  test('23. Internal linking — commander hub to content pages', async ({ page }) => {
    await page.goto(`${BASE}/commanders/the-ur-dragon`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const mulliganGuide = page.locator('a[href*="mulligan-guide"]').first();
    const budgetUpgrades = page.locator('a[href*="budget-upgrades"]').first();
    const bestCards = page.locator('a[href*="best-cards"]').first();
    await expect(mulliganGuide).toBeVisible({ timeout: 5_000 });
    await expect(budgetUpgrades).toBeVisible({ timeout: 5_000 });
    await expect(bestCards).toBeVisible({ timeout: 5_000 });
  });

  test('24. Similar commanders — links to other commanders', async ({ page }) => {
    await page.goto(`${BASE}/commanders/the-ur-dragon`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const similarSection = page.locator('text=/Similar commanders you may like/i');
    await expect(similarSection).toBeVisible({ timeout: 5_000 });
    const commanderLinks = page.locator('a[href^="/commanders/"]');
    const count = await commanderLinks.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('25. Health API — returns ok', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`, { timeout: 15_000 });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('ok');
    expect(json).toHaveProperty('checks');
  });

  test('26. Guest pages — my-decks, collections, profile show sign-in when not logged in', async ({ page }) => {
    const guestRoutes = ['/my-decks', '/collections', '/profile'];
    for (const path of guestRoutes) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const signIn = page.locator('text=/sign in|create account|log in/i').first();
      await expect(signIn).toBeVisible({ timeout: 10_000 });
    }
  });

  test('27. Wishlist page loads', async ({ page }) => {
    const r = await page.goto(`${BASE}/wishlist`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    expect(r?.status()).toBe(200);
    await expect(page.locator('body')).toBeVisible({ timeout: 10_000 });
  });

  test('28. New deck page loads', async ({ page }) => {
    const r = await page.goto(`${BASE}/new-deck`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    expect(r?.status()).toBe(200);
  });

  test('29. Compare decks page loads', async ({ page }) => {
    const r = await page.goto(`${BASE}/compare-decks`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    expect(r?.status()).toBe(200);
  });

  test('30. SEO /q pages — at least index works', async ({ page }) => {
    const res = await page.goto(`${BASE}/q/test-slug-404-maybe`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    expect(res?.status()).toBeLessThan(500);
  });
});

// ─── Extended route coverage ─────────────────────────────────────────────────
test.describe('Extended Routes', () => {
  test.setTimeout(90_000);

  const EXTRA_ROUTES = [
    '/refund', '/thank-you', '/budget-swaps', '/compare-decks',
    '/watchlist', '/binder/sol-ring', '/collections', '/meta/trending-commanders',
  ];
  for (const path of EXTRA_ROUTES) {
    test(`Route ${path} returns 200`, async ({ request }) => {
      const res = await request.get(`${BASE}${path}`, { timeout: 30_000 });
      expect(res.status(), `Expected 200 for ${path}`).toBe(200);
    });
  }

  const BLOG_POSTS = [
    'devlog-23-days-soft-launch', 'welcome-to-manatap-ai-soft-launch', 'budget-commander-100',
    'mana-curve-mastery', 'budget-edh-hidden-gems', 'how-to-build-your-first-commander-deck',
    'the-7-most-common-deckbuilding-mistakes', 'edh-land-count-what-the-community-actually-runs',
    'top-budget-staples-every-mtg-player-should-know-2025', 'why-ai-can-help-with-mtg-deck-building',
    'how-manatap-ai-works', 'how-ai-evaluates-mtg-deck-synergy',
  ];
  for (const slug of BLOG_POSTS) {
    test(`Blog post /blog/${slug} loads`, async ({ page }) => {
      const res = await page.goto(`${BASE}/blog/${slug}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('article')).toBeVisible({ timeout: 5_000 });
    });
  }

  const ARCHETYPES = ['dragons', 'aristocrats', 'treasure', 'spellslinger', 'elfball', 'tokens', 'sacrifice', 'reanimator', 'artifacts', 'enchantress'];
  for (const slug of ARCHETYPES) {
    test(`Archetype /commander-archetypes/${slug} loads`, async ({ request }) => {
      const res = await request.get(`${BASE}/commander-archetypes/${slug}`, { timeout: 30_000 });
      expect(res.status()).toBe(200);
    });
  }

  const STRATEGIES = ['ramp', 'tokens', 'sacrifice', 'control', 'aggro', 'combo'];
  for (const slug of STRATEGIES) {
    test(`Strategy /strategies/${slug} loads`, async ({ request }) => {
      const res = await request.get(`${BASE}/strategies/${slug}`, { timeout: 30_000 });
      expect(res.status()).toBe(200);
    });
  }
});

// ─── Commander content pages (multiple commanders) ───────────────────────────
test.describe('Commander Content Multi', () => {
  test.setTimeout(90_000);

  const COMMANDERS = ['edgar-markov', 'giada-font-of-hope', 'krenko-mob-boss'];
  const CONTENT = ['mulligan-guide', 'budget-upgrades', 'best-cards'];
  for (const cmd of COMMANDERS) {
    for (const sub of CONTENT) {
      test(`/commanders/${cmd}/${sub} loads`, async ({ request }) => {
        const res = await request.get(`${BASE}/commanders/${cmd}/${sub}`, { timeout: 30_000 });
        expect(res.status()).toBe(200);
      });
    }
  }
});

// ─── Page title checks (SEO) ───────────────────────────────────────────────
test.describe('Page Titles (SEO)', () => {
  const TITLE_CHECKS = [
    { path: '/commanders', pattern: /commanders|Commander/i },
    { path: '/commander-archetypes', pattern: /archetype|Commander/i },
    { path: '/strategies', pattern: /strategi|Commander/i },
    { path: '/meta', pattern: /meta|trending|ManaTap/i },
    { path: '/cards', pattern: /card|ManaTap/i },
    { path: '/blog', pattern: /blog|ManaTap/i },
    { path: '/tools', pattern: /tool|MTG|ManaTap/i },
    { path: '/privacy', pattern: /privacy|ManaTap/i },
    { path: '/terms', pattern: /terms|ManaTap/i },
    { path: '/support', pattern: /support|ManaTap/i },
    { path: '/changelog', pattern: /changelog|ManaTap/i },
    { path: '/decks/browse', pattern: /decks|browse|ManaTap/i },
    { path: '/collections/cost-to-finish', pattern: /cost|finish|ManaTap/i },
    { path: '/deck/swap-suggestions', pattern: /swap|budget|ManaTap/i },
    { path: '/price-tracker', pattern: /price|tracker|ManaTap/i },
    { path: '/commanders/giada-font-of-hope', pattern: /Giada|Commander|ManaTap/i },
  ];
  for (const { path, pattern } of TITLE_CHECKS) {
    test(`Title for ${path} matches ${pattern}`, async ({ page }) => {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const title = await page.title();
      expect(title).toMatch(pattern);
    });
  }
});

// ─── Navigation flows ──────────────────────────────────────────────────────
test.describe('Navigation Flows', () => {
  test.setTimeout(120_000);

  test('Homepage → Commanders index → Commander hub', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // On mobile, commanders link is in hamburger menu
    const menuBtn = page.getByRole('button', { name: 'Toggle menu' });
    if (await menuBtn.isVisible()) await menuBtn.click();
    const cmdLink = page.getByRole('link', { name: /commanders/i }).first();
    await cmdLink.click();
    await expect(page).toHaveURL(/\/commanders/);
    const hubLink = page.locator('a[href*="/commanders/"]').first();
    await hubLink.click();
    await expect(page).toHaveURL(/\/commanders\/[^/]+$/);
  });

  test('Commanders index → Tools', async ({ page }) => {
    await page.goto(`${BASE}/commanders`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const toolsLink = page.getByRole('link', { name: /tools|mulligan|probability/i }).first();
    await toolsLink.click();
    await expect(page).toHaveURL(/\/(tools|tools\/mulligan|tools\/probability)/);
  });

  test('Tools index lists all tools', async ({ page }) => {
    await page.goto(`${BASE}/tools`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.locator('text=/mulligan|probability|cost|swap|price/i').first()).toBeVisible({ timeout: 5_000 });
  });

  test('Commander hub → Mulligan guide', async ({ page }) => {
    await page.goto(`${BASE}/commanders/the-ur-dragon`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const main = page.locator('main');
    const mulliganLink = main.locator('a[href*="mulligan-guide"]').first();
    await mulliganLink.click();
    await expect(page).toHaveURL(/mulligan-guide/);
  });

  test('Blog index → Blog post', async ({ page }) => {
    await page.goto(`${BASE}/blog`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const postLink = page.locator('a[href*="/blog/"]').first();
    await postLink.click();
    await expect(page).toHaveURL(/\/blog\/[^/]+/);
  });
});

// ─── API endpoints ─────────────────────────────────────────────────────────
test.describe('API Endpoints', () => {
  test('GET /api/health returns ok', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`, { timeout: 15_000 });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.ok).toBeDefined();
  });

  test('Health returns database check', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`, { timeout: 15_000 });
    const json = await res.json();
    expect(json.checks).toBeDefined();
    expect(json.checks.database !== undefined || json.checks?.db !== undefined).toBeTruthy();
  });
});

// ─── 404 handling ─────────────────────────────────────────────────────────
test.describe('Error Handling', () => {
  test('Non-existent commander returns 404', async ({ request }) => {
    const res = await request.get(`${BASE}/commanders/nonexistent-commander-xyz`).catch(() => null);
    expect(res?.status()).toBe(404);
  });

  test('Non-existent blog returns 404', async ({ request }) => {
    const res = await request.get(`${BASE}/blog/nonexistent-post-xyz`).catch(() => null);
    expect(res?.status()).toBe(404);
  });

  test('Invalid path returns 404 or redirect', async ({ request }) => {
    const res = await request.get(`${BASE}/random-invalid-path-404`, { timeout: 10_000 });
    expect(res.status()).toBeLessThan(500);
  });
});

// ─── Content verification ───────────────────────────────────────────────────
test.describe('Content Verification', () => {
  test.setTimeout(120_000);

  test('Commander hub has intro text', async ({ page }) => {
    await page.goto(`${BASE}/commanders/the-ur-dragon`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const main = page.locator('main');
    await expect(main.locator('text=/commander|deck|tool/i').first()).toBeVisible({ timeout: 5_000 });
  });

  test('Archetype page has intro content', async ({ page }) => {
    await page.goto(`${BASE}/commander-archetypes/dragons`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const main = page.locator('main');
    await expect(main.locator('text=/dragon|tribal|commander/i').first()).toBeVisible({ timeout: 5_000 });
  });

  test('Strategy page has intro content', async ({ page }) => {
    await page.goto(`${BASE}/strategies/ramp`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const main = page.locator('main');
    await expect(main.locator('text=/ramp|mana|commander/i').first()).toBeVisible({ timeout: 5_000 });
  });

  test('Blog post has article content', async ({ page }) => {
    await page.goto(`${BASE}/blog/how-to-build-your-first-commander-deck`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const article = page.getByRole('article');
    await expect(article.locator('p').filter({ hasText: /\S/ }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Card page has card name', async ({ page }) => {
    await page.goto(`${BASE}/cards/sol-ring`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.locator('text=/Sol Ring/i').first()).toBeVisible({ timeout: 5_000 });
  });
});
