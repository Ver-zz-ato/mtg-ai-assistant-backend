// app/profile/page.tsx
import FeedbackFab from "@/components/FeedbackFab";
import ProfileClient from "./Client";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">My Profile</h1>
      <ProfileClient />
      <FeedbackFab />
    </main>
  );
}