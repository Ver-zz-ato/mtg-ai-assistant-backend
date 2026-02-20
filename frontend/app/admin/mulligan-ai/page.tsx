import MulliganAiPlayground from "@/components/admin/MulliganAiPlayground";
import Link from "next/link";

export default function MulliganAiPage() {
  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="mb-4">
        <Link href="/admin/justfordavy" className="text-sm text-neutral-400 hover:text-white">
          ← Back to Admin
        </Link>
      </div>
      <MulliganAiPlayground />
    </div>
  );
}
