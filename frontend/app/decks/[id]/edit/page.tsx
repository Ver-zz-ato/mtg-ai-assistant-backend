// app/decks/[id]/edit/page.tsx
import { redirect } from "next/navigation";

export default async function EditRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // Next 15: params is a Promise
  redirect(`/my-decks/${id}`);
}
