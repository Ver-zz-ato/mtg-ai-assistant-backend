'use client';

const MAX = 20;

type BufferedEvent = { event: string; props: Record<string, unknown>; ts: string };

const buffer: BufferedEvent[] = [];

export function pushCaptureEvent(event: string, props: Record<string, unknown>): void {
  buffer.push({ event, props: { ...props }, ts: new Date().toISOString() });
  if (buffer.length > MAX) buffer.shift();
}

export function getLastEvents(n: number = 10): BufferedEvent[] {
  return buffer.slice(-n).reverse();
}

export function clearCaptureBuffer(): void {
  buffer.length = 0;
}
