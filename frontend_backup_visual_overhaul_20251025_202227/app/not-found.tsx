// app/not-found.tsx
export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl p-8 text-center">
      <h1 className="text-2xl font-semibold mb-2">Not found</h1>
      <p className="text-sm text-muted-foreground mb-6">
        That page doesn’t exist or is no longer available.
      </p>
      <a href="/" className="inline-block border rounded px-3 py-1 text-sm underline-offset-4">
        Go to homepage
      </a>
    </main>
  );
}
