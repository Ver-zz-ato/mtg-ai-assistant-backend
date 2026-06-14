/**
 * Written App Store customer reviews via App Store Connect API.
 * Star-only ratings without review text may not appear in this endpoint.
 */

export type AppStoreCustomerReview = {
  id: string;
  rating: number | null;
  title: string | null;
  body: string | null;
  reviewerNickname: string | null;
  territory: string | null;
  createdDate: string | null;
  raw: Record<string, unknown>;
};

type AppleReviewAttributes = {
  rating?: number;
  title?: string;
  body?: string;
  reviewerNickname?: string;
  territory?: string;
  createdDate?: string;
};

type AppleReviewResource = {
  id?: string;
  type?: string;
  attributes?: AppleReviewAttributes;
};

type AppleReviewsResponse = {
  data?: AppleReviewResource[];
  errors?: { code?: string; detail?: string; title?: string }[];
};

const ASC_BASE = "https://api.appstoreconnect.apple.com";

export async function fetchLatestCustomerReviews(opts: {
  appId: string;
  jwt: string;
  limit?: number;
}): Promise<AppStoreCustomerReview[]> {
  const appId = opts.appId.trim();
  if (!appId) throw new Error("apple_asc_app_id_missing");

  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 200);
  const url = new URL(`${ASC_BASE}/v1/apps/${encodeURIComponent(appId)}/customerReviews`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "-createdDate");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${opts.jwt}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();
  let json: AppleReviewsResponse;
  try {
    json = JSON.parse(text) as AppleReviewsResponse;
  } catch {
    throw new Error(`apple_asc_invalid_json_${res.status}`);
  }

  if (!res.ok) {
    const detail = json.errors?.[0]?.detail || json.errors?.[0]?.title || `http_${res.status}`;
    throw new Error(`apple_asc_fetch_failed:${detail}`);
  }

  const rows = Array.isArray(json.data) ? json.data : [];
  return rows
    .filter((row): row is AppleReviewResource & { id: string } => typeof row?.id === "string")
    .map((row) => {
      const attrs = row.attributes || {};
      return {
        id: row.id,
        rating: typeof attrs.rating === "number" ? attrs.rating : null,
        title: attrs.title ?? null,
        body: attrs.body ?? null,
        reviewerNickname: attrs.reviewerNickname ?? null,
        territory: attrs.territory ?? null,
        createdDate: attrs.createdDate ?? null,
        raw: row as Record<string, unknown>,
      };
    });
}
