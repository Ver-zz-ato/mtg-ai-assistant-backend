import { Suspense } from "react";
import Client from "./Client";

export const dynamic = "force-dynamic";

export default function AiWorkshopPage() {
  return (
    <Suspense fallback={<div className="text-neutral-400 text-sm py-8">Loading AI Workshop…</div>}>
      <Client />
    </Suspense>
  );
}
