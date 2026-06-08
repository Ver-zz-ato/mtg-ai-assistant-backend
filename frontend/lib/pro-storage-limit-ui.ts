"use client";

type ProLimitPayload = {
  code?: unknown;
  error?: unknown;
};

export function isProStorageLimitPayload(payload: ProLimitPayload | null | undefined): boolean {
  return (
    (typeof payload?.code === "string" && payload.code.startsWith("PRO_LIMIT_")) ||
    (typeof payload?.error === "string" && payload.error.includes("PRO_LIMIT_"))
  );
}

export async function showProStorageLimitToast(payload: ProLimitPayload): Promise<void> {
  const message =
    typeof payload.error === "string" && payload.error.trim()
      ? payload.error
      : "Upgrade to Pro for unlimited ManaTap storage.";
  try {
    const { toast } = await import("@/lib/toast-client");
    toast(message, "info");
  } catch {
    alert(message);
  }
}

export async function handleProStorageLimitPayload(payload: ProLimitPayload): Promise<boolean> {
  if (!isProStorageLimitPayload(payload)) return false;
  await showProStorageLimitToast(payload);
  return true;
}
