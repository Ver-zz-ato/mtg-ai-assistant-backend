# SEO Indexing Booster Workflow

After major deploys, use this workflow to boost indexation of priority pages in Google Search Console.

## 1. Google Search Console Setup

- Select the **Domain property** if available (`manatap.ai`), otherwise use the **URL prefix** property (`https://www.manatap.ai/`).
- Domain property covers all subdomains and protocols; URL prefix is scoped to the exact URL.

## 2. Get Priority URLs

**Endpoint:** `GET /api/admin/seo/priority-urls`

**Auth:** Use one of:

- **Admin session** (logged-in admin user)
- **Token header:** `X-Admin-Token`, `X-Cron-Secret`, or `X-Cron-Key` with value from `ADMIN_TOKEN`, `CRON_SECRET`, or `CRON_KEY` env var
- **Bearer token:** `Authorization: Bearer <token>`

**Example with token:**

```bash
curl -H "X-Admin-Token: YOUR_CRON_SECRET" "https://www.manatap.ai/api/admin/seo/priority-urls"
```

**Query params:**

| Param   | Default | Max  | Description                    |
|---------|---------|------|--------------------------------|
| `limit` | 100     | 200  | Max number of URLs to return   |
| `format`| `json`  | —    | `text` = plain text, one URL per line |

**Examples:**

```bash
# JSON (default)
curl -H "X-Admin-Token: $CRON_SECRET" "https://www.manatap.ai/api/admin/seo/priority-urls"

# Plain text, 50 URLs
curl -H "X-Admin-Token: $CRON_SECRET" "https://www.manatap.ai/api/admin/seo/priority-urls?limit=50&format=text"
```

**Response (JSON):** `{ "urls": ["https://www.manatap.ai/", ...] }`

**Response (format=text):** One URL per line.

## 3. Request Indexing in GSC

1. Open [Google Search Console](https://search.google.com/search-console)
2. Use **URL Inspection** (left sidebar)
3. Paste each priority URL
4. Click **Request indexing**

Repeat for the top 20–50 URLs after each major deploy. GSC limits daily indexing requests.

## 4. When to Run

- After deploying canonical/redirect changes
- After adding new commander or card pages
- After publishing new blog posts
- When GSC shows "Discovered – currently not indexed" for key pages

## 5. Sitemap Validation

Run in CI or locally against production:

```bash
npm run seo:validate-sitemap
```

**Env:** `SITEMAP_VALIDATE_SAMPLE` (default 20) – URLs to sample per child sitemap.

Samples URLs from each sitemap segment, HEAD-checks each, and fails if any returns 404, 5xx, redirect chain >1, or non-XML response.
