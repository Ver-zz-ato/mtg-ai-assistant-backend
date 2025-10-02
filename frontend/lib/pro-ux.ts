'use client';
import { toast } from '@/lib/toast-client';

export function showProToast() {
  toast('This is a Pro feature. Upgrade to unlock.', 'info');
}