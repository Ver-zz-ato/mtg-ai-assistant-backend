/**
 * Send a Discord webhook notification when a real (non-AI) shoutbox message is posted.
 * Env: DISCORD_SHOUTBOX_WEBHOOK_URL
 * Failure is logged only; does not throw.
 */

const MAX_TEXT_LENGTH = 1500;

export async function notifyDiscordShoutboxRealMessage(user: string, text: string): Promise<void> {
  const url = process.env.DISCORD_SHOUTBOX_WEBHOOK_URL;
  if (!url?.trim()) return;

  const safeUser = user.slice(0, 50).replace(/[\n\r]/g, " ");
  const safeText = text.slice(0, MAX_TEXT_LENGTH).replace(/[\n\r]/g, " ").trim() || "(empty)";
  const content = `**Shoutbox** — **${safeUser}**: ${safeText}`;

  try {
    const res = await fetch(url.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      console.warn("[shoutbox-discord] Webhook failed:", res.status, await res.text());
    }
  } catch (e) {
    console.warn("[shoutbox-discord] Post failed:", e);
  }
}
