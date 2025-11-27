# SEO Guide for ManaTap.ai

This document explains the SEO setup and how to maintain it for optimal Google Search visibility.

## Overview

ManaTap.ai is structured to grow organic traffic through:
1. **Hero Landing Page** - `/mtg-commander-ai-deck-builder` (primary SEO entry point)
2. **Blog System** - Regular helpful content for Google to index
3. **Clean Sitemap** - All important pages included
4. **Proper Meta Tags** - Unique titles and descriptions for every page
5. **Structured Data** - JSON-LD schema for better understanding

## Key SEO Pages

### Primary Landing Page
- **URL**: `/mtg-commander-ai-deck-builder`
- **Purpose**: Main entry point for Google searches like "AI commander deck builder", "free MTG deck analyzer"
- **Priority**: 0.9 (highest)
- **Update Frequency**: Monthly

### Blog Index
- **URL**: `/blog`
- **Purpose**: Hub for all blog content
- **Priority**: 0.6
- **Update Frequency**: Weekly (when new posts added)

### Individual Blog Posts
- **URL**: `/blog/[slug]`
- **Purpose**: Long-tail keyword targeting and helpful content
- **Priority**: 0.7
- **Update Frequency**: Monthly

## Sitemap

The sitemap is automatically generated at `/sitemap.xml` and includes:
- All static pages (homepage, tools, pricing, etc.)
- All blog posts
- Public decks (limited to 500 most recent)
- Hero landing page

**Location**: `frontend/app/sitemap.ts`

**To add new pages to sitemap:**
1. Add the route to the `staticRoutes` array
2. Set appropriate priority (0.5-0.9)
3. Set changeFrequency ("weekly", "monthly", etc.)

## Meta Tags

Every page should have unique:
- **Title**: 50-60 characters, includes target keywords
- **Description**: 150-160 characters, compelling and keyword-rich
- **Canonical URL**: Prevents duplicate content issues

**Blog posts** automatically generate meta tags from content in `frontend/app/blog/[slug]/page.tsx`.

## Google Search Console Setup

### Step 1: Add Property
1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property: `https://manatap.ai`
3. Verify ownership (DNS record or HTML file)

### Step 2: Submit Sitemap
1. In Search Console, go to "Sitemaps"
2. Submit: `https://manatap.ai/sitemap.xml`
3. Google will start crawling within 24-48 hours

### Step 3: Monitor Coverage
1. Check "Coverage" report for:
   - **Valid** - Pages indexed successfully
   - **Excluded** - Pages blocked (check why)
   - **Error** - Pages with issues (fix these)

### Step 4: Check Index Status
1. Use "URL Inspection" tool to check specific pages
2. Request indexing for important new pages
3. Monitor "Performance" to see which queries bring traffic

## Robots.txt

Located at `/public/robots.txt`. Currently configured to:
- Allow all public pages
- Block `/admin/` and `/api/` routes
- Declare sitemap location

**Don't block important pages!** Only block:
- Admin interfaces
- API endpoints
- Private user data
- Duplicate content

## Blog Content Strategy

### Publishing Schedule
- **Goal**: 1-2 helpful articles per month
- **Topics**: Deck building guides, MTG strategy, budget tips, format guides

### Example Article Outlines

1. **"How to Build Your First Commander Deck"**
   - Target: "how to build commander deck", "first EDH deck"
   - Structure: Step-by-step guide, beginner-friendly
   - CTA: Link to deck builder

2. **"The 7 Most Common Deckbuilding Mistakes"**
   - Target: "MTG deck building mistakes", "common EDH errors"
   - Structure: List format, actionable fixes
   - CTA: Link to deck analyzer

3. **"Top Budget Staples Every MTG Player Should Know"**
   - Target: "budget MTG cards", "cheap commander staples"
   - Structure: Card recommendations with explanations
   - CTA: Link to budget swaps tool

4. **"How Mana Curves Actually Work"**
   - Target: "MTG mana curve", "deck curve explained"
   - Structure: Educational, with examples
   - CTA: Link to mulligan simulator

5. **"EDH Land Count: What the Community Actually Runs"**
   - Target: "commander land count", "EDH how many lands"
   - Structure: Data-driven, community insights
   - CTA: Link to deck analyzer

### Content Guidelines
- **Length**: 800-2000 words (longer = better for SEO)
- **Keywords**: Use naturally, don't stuff
- **Internal Links**: Link to relevant tools and other blog posts
- **External Links**: Link to authoritative MTG sources when relevant
- **Images**: Include screenshots or card images (with alt text)
- **CTAs**: Always include clear call-to-action linking to relevant tool

## Long-Tail Keywords to Target

Naturally include these phrases in content:
- "AI deck builder for Commander"
- "Analyze MTG decks automatically"
- "Budget swaps for Magic: The Gathering decks"
- "MTG mulligan calculator online"
- "Free EDH deck analyzer AI"
- "Commander deck builder AI"
- "MTG deck analysis tool"
- "Magic deck optimization"

**Don't force keywords!** Use them naturally in headings and body text.

## Internal Linking Strategy

Link structure:
- **Homepage** → Hero landing page
- **Blog** → Hero landing page
- **Blog posts** → Other relevant blog posts
- **All pages** → Relevant tools (deck builder, analyzer, etc.)

**Anchor text**: Use descriptive text, not "click here"

## Monitoring & Maintenance

### Weekly
- Check Google Search Console for new errors
- Review which queries are bringing traffic
- Check for new pages that need indexing

### Monthly
- Publish 1-2 new blog posts
- Update sitemap if new pages added
- Review and update meta descriptions if needed
- Check for broken internal links

### Quarterly
- Review top-performing pages
- Identify content gaps
- Update outdated blog posts
- Analyze competitor content

## Common Issues & Fixes

### Pages Not Indexing
- **Check robots.txt** - Make sure page isn't blocked
- **Check meta robots** - Ensure no "noindex" tag
- **Submit to Search Console** - Request indexing manually
- **Check internal links** - Google needs links to find pages

### Low Rankings
- **Improve content quality** - Longer, more helpful content ranks better
- **Get backlinks** - Share on Reddit, forums, social media
- **Update regularly** - Fresh content signals active site
- **Fix technical issues** - Fast loading, mobile-friendly

### Duplicate Content
- **Use canonical URLs** - Every page should have canonical tag
- **Avoid duplicate titles** - Each page needs unique title
- **Consolidate similar pages** - Merge or redirect duplicates

## Backlink Strategy

While outreach is manual, the site is structured for easy backlinking:
- **Hero page** - Shareable, linkable landing page
- **Blog posts** - Valuable content worth linking to
- **Tools** - Unique resources people will share
- **Clean URLs** - Easy to remember and share

**Where to get backlinks:**
- Reddit (r/EDH, r/magicTCG) - Share helpful blog posts
- MTG forums - Answer questions with links to relevant content
- YouTube - Reach out to MTG content creators
- Directories - Submit to MTG tool directories
- Guest posts - Write for other MTG sites

## Performance & Technical SEO

- **Page Speed**: Optimize images, use Next.js optimizations
- **Mobile-Friendly**: Responsive design (already implemented)
- **HTTPS**: Required (already configured)
- **Structured Data**: JSON-LD schema on key pages
- **Internal Links**: Clear navigation structure

## Next Steps

1. **Submit sitemap** to Google Search Console
2. **Monitor coverage** for errors
3. **Publish first blog post** from example outlines
4. **Share hero page** on Reddit/social media
5. **Request indexing** for important pages
6. **Track progress** in Search Console monthly

## Questions?

If you need help with SEO:
- Check Google Search Console documentation
- Review this guide
- Test pages with Google's Rich Results Test
- Use Google's PageSpeed Insights for performance

---

**Last Updated**: 2025-01-27
**Maintained By**: Development Team

