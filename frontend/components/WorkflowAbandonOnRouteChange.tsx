'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { attachWorkflowAbandonListeners, fireWorkflowAbandoned } from '@/lib/analytics/workflow-abandon';

/**
 * Fires workflow.abandoned on route change or tab hide, then attaches beforeunload/visibility listeners.
 */
export default function WorkflowAbandonOnRouteChange() {
  const pathname = usePathname();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    attachWorkflowAbandonListeners();
  }, []);

  useEffect(() => {
    const current = pathname ?? '/';
    if (prevPath.current !== null && prevPath.current !== current) {
      fireWorkflowAbandoned();
    }
    prevPath.current = current;
  }, [pathname]);

  return null;
}
