import type { PublishResult } from "./publishToX";

/**
 * Instagram Graph API: create image container + publish (caption-only needs image URL).
 */
export async function publishToInstagram(content: string): Promise<PublishResult> {
  const token = String(process.env.INSTAGRAM_ACCESS_TOKEN || "").trim();
  const userId = String(process.env.INSTAGRAM_USER_ID || "").trim();
  const imageUrl = String(process.env.INSTAGRAM_DEFAULT_IMAGE_URL || "").trim();

  if (!token || !userId || !imageUrl) {
    throw new Error(
      "INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID, and INSTAGRAM_DEFAULT_IMAGE_URL required"
    );
  }

  const caption = content.trim().slice(0, 2200);
  const base = `https://graph.facebook.com/v21.0/${userId}`;

  const containerRes = await fetch(`${base}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      image_url: imageUrl,
      caption,
      access_token: token,
    }),
    cache: "no-store",
  });

  const containerJson = (await containerRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };

  if (!containerRes.ok || !containerJson.id) {
    throw new Error(containerJson.error?.message || `Instagram container ${containerRes.status}`);
  }

  const publishRes = await fetch(`${base}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      creation_id: containerJson.id,
      access_token: token,
    }),
    cache: "no-store",
  });

  const publishJson = (await publishRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };

  if (!publishRes.ok || !publishJson.id) {
    throw new Error(publishJson.error?.message || `Instagram publish ${publishRes.status}`);
  }

  return {
    externalPostId: publishJson.id,
    externalPostUrl: `https://www.instagram.com/p/${publishJson.id}/`,
  };
}
