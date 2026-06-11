export type PublishPlatform = "x" | "instagram" | "blog";

export function isXPublishConfigured(): boolean {
  return !!String(process.env.X_USER_ACCESS_TOKEN || "").trim();
}

export function isInstagramPublishConfigured(): boolean {
  return (
    !!String(process.env.INSTAGRAM_ACCESS_TOKEN || "").trim() &&
    !!String(process.env.INSTAGRAM_USER_ID || "").trim() &&
    !!String(process.env.INSTAGRAM_DEFAULT_IMAGE_URL || "").trim()
  );
}

export function publishConfigStatus(): Record<PublishPlatform, boolean> {
  return {
    x: isXPublishConfigured(),
    instagram: isInstagramPublishConfigured(),
    blog: true,
  };
}
