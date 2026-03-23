/**
 * Send Expo push notifications via Expo Push API.
 * @see https://docs.expo.dev/push-notifications/sending-notifications/
 */
export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
};

export async function sendExpoPushMessages(messages: ExpoPushMessage[]): Promise<{ ok: boolean; raw?: unknown }> {
  if (!messages.length) return { ok: true };
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("expo_push_send_failed", res.status, raw);
      return { ok: false, raw };
    }
    return { ok: true, raw };
  } catch (e) {
    console.error("expo_push_send_error", e);
    return { ok: false };
  }
}
