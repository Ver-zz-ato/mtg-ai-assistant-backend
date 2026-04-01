/**
 * Copy text to the clipboard from a click/touch handler.
 * Tries a synchronous execCommand path first (reliable on iOS Safari and when
 * async Clipboard API fails or is unavailable). Falls back to navigator.clipboard.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const s = String(text ?? "");
  if (typeof window === "undefined") return false;

  function copyViaExecCommand(): boolean {
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, s.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  if (copyViaExecCommand()) return true;

  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(s);
      return true;
    }
  } catch {
    /* ignore */
  }

  return false;
}
