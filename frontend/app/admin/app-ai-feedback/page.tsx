"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy route — unified admin lives at /admin/ai-feedback */
export default function AppAiFeedbackLegacyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/ai-feedback");
  }, [router]);
  return (
    <div className="p-8 text-neutral-400 text-sm">
      Redirecting to unified AI Feedback…
    </div>
  );
}
