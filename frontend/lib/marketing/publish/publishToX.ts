export type PublishResult = {
  externalPostId: string;
  externalPostUrl: string;
};

export async function publishToX(content: string): Promise<PublishResult> {
  const token = String(process.env.X_USER_ACCESS_TOKEN || "").trim();
  if (!token) {
    throw new Error("X_USER_ACCESS_TOKEN not configured");
  }

  const text = content.trim().slice(0, 280);
  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as {
    data?: { id?: string };
    errors?: Array<{ message?: string }>;
    detail?: string;
  };

  if (!res.ok) {
    const msg =
      json.errors?.[0]?.message || json.detail || `X API ${res.status}`;
    throw new Error(msg);
  }

  const id = json.data?.id;
  if (!id) throw new Error("X API returned no tweet id");

  return {
    externalPostId: id,
    externalPostUrl: `https://x.com/i/web/status/${id}`,
  };
}
