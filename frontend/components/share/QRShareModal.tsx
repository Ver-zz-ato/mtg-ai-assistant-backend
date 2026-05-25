"use client";

import React from "react";
import QRCode from "qrcode";
import { Copy, ExternalLink, QrCode, X } from "lucide-react";

type QRShareModalProps = {
  open: boolean;
  url: string;
  title?: string;
  description?: string;
  onClose: () => void;
};

export default function QRShareModal({
  open,
  url,
  title = "Share ManaTap link",
  description,
  onClose,
}: QRShareModalProps) {
  const [dataUrl, setDataUrl] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setDataUrl("");
    QRCode.toDataURL(url, {
      margin: 2,
      width: 256,
      color: {
        dark: "#111111",
        light: "#fff8e7",
      },
    })
      .then((next) => {
        if (!cancelled) setDataUrl(next);
      })
      .catch(() => {
        if (!cancelled) setError("Could not generate QR code.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      const { toast } = await import("@/lib/toast-client");
      toast("Share link copied.", "success");
    } catch {
      alert("Could not copy link.");
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close QR share modal"
        onClick={onClose}
      />
      <section className="relative w-full max-w-sm rounded-xl border border-amber-300/25 bg-neutral-950 p-4 text-neutral-100 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-300/25 bg-amber-300/10 text-amber-200">
              <QrCode size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">{title}</h2>
              {description ? <p className="mt-0.5 text-xs text-neutral-400">{description}</p> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-neutral-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 flex justify-center rounded-lg border border-white/10 bg-neutral-900 p-4">
          {dataUrl ? (
            <img src={dataUrl} alt="QR code for share link" className="h-64 w-64 rounded-md" />
          ) : (
            <div className="flex h-64 w-64 items-center justify-center rounded-md bg-neutral-950 text-sm text-neutral-400">
              {error || "Generating QR..."}
            </div>
          )}
        </div>

        <p className="mt-3 break-all rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-neutral-400">
          {url}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/20"
          >
            <Copy size={16} aria-hidden="true" />
            Copy
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-white/10"
          >
            <ExternalLink size={16} aria-hidden="true" />
            Open
          </a>
        </div>
      </section>
    </div>
  );
}
