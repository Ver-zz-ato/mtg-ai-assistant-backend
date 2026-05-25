"use client";

import React from "react";
import { Camera, ExternalLink, Keyboard, Loader2, QrCode, X } from "lucide-react";

type BarcodeResult = {
  rawValue?: string;
};

type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<BarcodeResult[]>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  return candidate || null;
}

function isSafeOpenUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function ScanQrClient() {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [supported, setSupported] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const [detected, setDetected] = React.useState("");
  const [manualUrl, setManualUrl] = React.useState("");
  const [status, setStatus] = React.useState("Ready to scan a ManaTap share QR.");

  React.useEffect(() => {
    setSupported(Boolean(getBarcodeDetector()) && Boolean(navigator.mediaDevices?.getUserMedia));
    return () => stopCamera();
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function startCamera() {
    const Detector = getBarcodeDetector();
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setStatus("This browser does not support camera QR scanning. Paste a link below instead.");
      return;
    }
    setDetected("");
    setStatus("Starting camera...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      setStatus("Point your camera at a ManaTap QR code.");
      const detector = new Detector({ formats: ["qr_code"] });
      scanLoop(detector);
    } catch {
      setStatus("Camera permission was blocked or unavailable. Paste the share link below instead.");
      stopCamera();
    }
  }

  async function scanLoop(detector: BarcodeDetectorLike) {
    if (!videoRef.current || !streamRef.current) return;
    try {
      const hits = await detector.detect(videoRef.current);
      const raw = hits[0]?.rawValue?.trim();
      if (raw) {
        setDetected(raw);
        setManualUrl(raw);
        setStatus("QR found.");
        stopCamera();
        return;
      }
    } catch {
      setStatus("Could not read that frame. Keep the QR code steady.");
    }
    window.setTimeout(() => scanLoop(detector), 500);
  }

  function openValue(value: string) {
    const url = value.trim();
    if (!isSafeOpenUrl(url)) {
      setStatus("Paste a full http or https link.");
      return;
    }
    window.location.href = url;
  }

  return (
    <section className="rounded-xl border border-amber-300/20 bg-neutral-950/80 p-4 text-neutral-100 shadow-xl shadow-black/25 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-300/25 bg-amber-300/10 text-amber-200">
          <QrCode size={20} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-300">QR scanner</p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Open a ManaTap share link</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Scan a QR code from a shared deck, collection, wishlist, card, roast, or report. Browser support varies, so paste works everywhere.
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-white/10 bg-black">
        <video ref={videoRef} className="aspect-video w-full object-cover" playsInline muted />
      </div>

      <p className="mt-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-300">{status}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startCamera}
          disabled={!supported || scanning}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-300 px-4 py-2 text-sm font-bold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
          {scanning ? "Scanning" : "Start camera"}
        </button>
        <button
          type="button"
          onClick={stopCamera}
          disabled={!scanning}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Stop
        </button>
      </div>

      {detected ? (
        <div className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3">
          <p className="text-sm font-semibold text-emerald-100">Detected link</p>
          <p className="mt-1 break-all text-xs text-emerald-100/80">{detected}</p>
          <button
            type="button"
            onClick={() => openValue(detected)}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-emerald-300 px-3 py-1.5 text-xs font-bold text-black transition hover:bg-emerald-200"
          >
            <ExternalLink size={14} aria-hidden="true" />
            Open link
          </button>
        </div>
      ) : null}

      <div className="mt-6 rounded-lg border border-white/10 bg-neutral-900/70 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Keyboard size={16} aria-hidden="true" />
          Paste a share link
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={manualUrl}
            onChange={(event) => setManualUrl(event.target.value)}
            placeholder="https://www.manatap.ai/..."
            className="min-h-10 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-amber-300/60"
          />
          <button
            type="button"
            onClick={() => openValue(manualUrl)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/20"
          >
            <ExternalLink size={16} aria-hidden="true" />
            Open
          </button>
        </div>
      </div>
    </section>
  );
}
