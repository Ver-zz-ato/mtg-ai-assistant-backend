'use client';
import { toast } from '@/lib/toast-client';

export function showProToast() {
  toast('This is a Pro feature. Upgrade to Pro for just £3.99/month to unlock AI-powered deck improvements and more!', 'info');
}